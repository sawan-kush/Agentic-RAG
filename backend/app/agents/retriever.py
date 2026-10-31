"""Agent 2: Retrieval & Query Engine (LlamaIndex + Pinecone)."""
from dataclasses import dataclass
from llama_index.core import VectorStoreIndex
from llama_index.core.vector_stores import MetadataFilters, MetadataFilter, FilterOperator
from app.config import vector_store
from app.agents.router import ask_json


@dataclass
class Chunk:
    text: str
    doc_id: str
    file_name: str
    score: float


async def retrieve(query: str, user_id: str, top_k: int = 5):
    # Rewrite longer questions into focused sub-queries
    queries = [query] if len(query.split()) < 6 else await ask_json(
        f'Rewrite as up to 3 standalone search queries, as a JSON string array: "{query}"')

    index = VectorStoreIndex.from_vector_store(vector_store)
    # Per-user isolation: Pinecone only returns chunks tagged with this user's id
    filters = MetadataFilters(filters=[MetadataFilter(key="user_id", value=user_id, operator=FilterOperator.EQ)])
    retriever = index.as_retriever(similarity_top_k=top_k, filters=filters)

    best: dict[str, Chunk] = {}
    for q in queries:
        for n in await retriever.aretrieve(q):
            c = Chunk(n.node.get_content(), n.node.metadata.get("doc_id"), n.node.metadata.get("file_name"), n.score or 0)
            if n.node.node_id not in best or c.score > best[n.node.node_id].score:
                best[n.node.node_id] = c
    chunks = sorted(best.values(), key=lambda c: c.score, reverse=True)[:top_k]
    return chunks, queries
