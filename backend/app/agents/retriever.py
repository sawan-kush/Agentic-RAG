"""Agent 2: Retrieval & Query Engine -- HYBRID search.

Two searches run side by side and their ranked lists are merged:
  1. Dense / semantic search: Pinecone (finds chunks that MEAN the same thing)
  2. Keyword search: Supabase Postgres full-text search (finds chunks with the same WORDS,
     e.g. product codes, names, rare terms that embeddings often miss)
The merge uses Reciprocal Rank Fusion (RRF): a chunk's score is the sum of 1/(60 + rank)
over every list it appears in, so chunks that rank well in BOTH lists float to the top.
"""
import asyncio, re
from dataclasses import dataclass, replace
from llama_index.core import VectorStoreIndex
from llama_index.core.vector_stores import MetadataFilters, MetadataFilter, FilterOperator
from app.config import vector_store, supabase
from app.agents.router import ask_json, format_history

RRF_K = 60  # standard RRF constant; larger = flatter weighting between ranks


@dataclass
class Chunk:
    text: str
    doc_id: str
    file_name: str
    score: float


# A ranked list is a list of (chunk_key, Chunk). The key '{doc_id}#{chunk_number}' is the same
# in Pinecone and in the Postgres `chunks` table, which is how RRF knows two hits are the same chunk.
Ranked = list[tuple[str, Chunk]]


async def dense_search(retriever, q: str) -> Ranked:
    out: Ranked = []
    for n in await retriever.aretrieve(q):
        doc_id = n.node.metadata.get("doc_id")
        key = f"{doc_id}#{n.node.node_id}"
        out.append((key, Chunk(n.node.get_content(), doc_id, n.node.metadata.get("file_name"), n.score or 0)))
    return out


def to_or_query(q: str) -> str:
    """'what is the refund policy?' -> 'what | is | the | refund | policy'
    Postgres removes stop words itself. We use OR (not AND) so one missing word doesn't kill the match."""
    words = list(dict.fromkeys(w.lower() for w in re.findall(r"[^\W_]+", q) if len(w) > 1))
    return " | ".join(words[:15])


async def keyword_search(q: str, user_id: str, limit: int) -> Ranked:
    tsq = to_or_query(q)
    if not tsq:
        return []
    try:
        # search_chunks is a SQL function (see supabase/schema_v2_additions.sql). It filters by user_id.
        rows = await asyncio.to_thread(lambda: supabase.rpc(
            "search_chunks", {"p_user_id": user_id, "p_query": tsq, "p_limit": limit}).execute().data)
    except Exception as e:
        # If the SQL wasn't run yet (or Postgres hiccups) we still answer, with dense search only.
        print(f"[retriever] keyword search skipped: {type(e).__name__}: {e}")
        return []
    return [(r["id"], Chunk(r["content"], r["doc_id"], r["file_name"], r["rank"])) for r in rows]


def rrf(ranked_lists: list[Ranked]) -> list[Chunk]:
    scores: dict[str, float] = {}
    chunks: dict[str, Chunk] = {}
    for ranked in ranked_lists:
        for rank, (key, chunk) in enumerate(ranked):  # rank 0 = best
            scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            chunks.setdefault(key, chunk)
    best_first = sorted(scores, key=scores.get, reverse=True)
    return [replace(chunks[k], score=scores[k]) for k in best_first]


async def make_queries(query: str, history: list[dict] | None) -> list[str]:
    """Longer questions -- or any follow-up in an ongoing chat -- are rewritten into standalone
    search queries (this is one LLM call). Short first questions are searched as they are (no call)."""
    if not history and len(query.split()) < 6:
        return [query]
    convo = format_history(history)
    context = f"Conversation so far (resolve words like 'it' or 'that one' using it):\n{convo}\n\n" if convo else ""
    try:
        subs = await ask_json(f'{context}Rewrite the newest question as up to 3 standalone search queries, '
                              f'as a JSON string array: "{query}"')
        if isinstance(subs, dict):  # some models wrap the array in an object
            subs = next((v for v in subs.values() if isinstance(v, list)), [])
        subs = [s for s in subs if isinstance(s, str) and s.strip()][:3]
        return subs or [query]
    except Exception as e:
        print(f"[retriever] query rewrite failed ({type(e).__name__}), using the raw question")
        return [query]


async def retrieve(query: str, user_id: str, top_k: int = 5, history: list[dict] | None = None):
    queries = await make_queries(query, history)

    index = VectorStoreIndex.from_vector_store(vector_store)
    # Per-user isolation: Pinecone only returns chunks tagged with this user's id
    filters = MetadataFilters(filters=[MetadataFilter(key="user_id", value=user_id, operator=FilterOperator.EQ)])
    retriever = index.as_retriever(similarity_top_k=top_k, filters=filters)

    # For every sub-query run BOTH searches at the same time, then fuse all the lists together.
    jobs = []
    for q in queries:
        jobs.append(dense_search(retriever, q))
        jobs.append(keyword_search(q, user_id, top_k))
    ranked_lists = await asyncio.gather(*jobs)

    chunks = rrf(list(ranked_lists))[:top_k]
    return chunks, queries