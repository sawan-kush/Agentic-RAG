"""Orchestrates the 3 agents. Yields events the UI shows as the agent trace."""
import asyncio, time
from app.config import llm, supabase
from app.agents.router import route_query
from app.agents.retriever import retrieve
from app.agents.verifier import verify

MAX_RETRIES = 1


def trace(agent: str, detail: str, started: float) -> dict:
    return {"type": "trace", "agent": agent, "detail": detail, "ms": round((time.perf_counter() - started) * 1000)}


async def run_pipeline(query: str, user_id: str):
    t = time.perf_counter()
    r = await route_query(query)
    yield trace("Router", f"{r['route']}: {r['reason']}", t)

    if r["route"] == "direct":
        yield {"type": "answer", "text": (await llm.acomplete(query)).text, "sources": []}
        return

    if r["route"] == "sql":
        t = time.perf_counter()
        # The model never writes SQL: we run a fixed query scoped to this user.
        rows = await asyncio.to_thread(lambda: supabase.table("documents")
            .select("file_name,created_at,chunk_count,size_bytes").eq("user_id", user_id).execute().data)
        yield trace("Metadata query", f"{len(rows)} rows", t)
        ans = await llm.acomplete(f"Answer using this document list only:\n{rows}\n\nQ: {query}")
        yield {"type": "answer", "text": ans.text, "sources": []}
        return

    top_k, chunks, answer = 5, [], ""
    for _ in range(MAX_RETRIES + 1):
        t = time.perf_counter()
        chunks, subs = await retrieve(query, user_id, top_k)
        yield trace("Retriever", f"{len(chunks)} chunks, top-k {top_k}, {len(subs)} sub-queries", t)

        ctx = "\n\n".join(f"[{i}] ({c.file_name}) {c.text}" for i, c in enumerate(chunks))
        answer = (await llm.acomplete(
            f"Answer ONLY from the context. If it is not there, say you could not find it.\n\nContext:\n{ctx}\n\nQuestion: {query}")).text

        t = time.perf_counter()
        v = await verify(answer, chunks)
        yield trace("Verifier", "grounded" if v["grounded"] else f"ungrounded: {len(v['unsupported'])} claims", t)
        if v["grounded"]:
            break
        top_k = 12  # widen the search and try once more

    sources = list({c.doc_id: {"docId": c.doc_id, "fileName": c.file_name} for c in chunks}.values())
    yield {"type": "answer", "text": answer, "sources": sources}
