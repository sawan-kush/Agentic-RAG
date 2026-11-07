"""Orchestrates the 3 agents. Yields events that main.py streams to the browser.

Event types (one JSON object per line):
  trace     {"agent","detail","ms"}      what each agent did (shown as the agent trace)
  token     {"text"}                     next piece of the answer (append it)
  replace   {"text"}                     overwrite the WHOLE answer text with this one
  verified  {"grounded","unsupported"}   result of the verifier (only for document answers)
  done      {"sources"}                  always the last event
"""
import asyncio, json, time
from app import cache
from app.config import llm, supabase, MODEL_SALT
from app.agents.router import route_query, format_history
from app.agents.retriever import retrieve
from app.agents.verifier import verify

MAX_RETRIES = 1
ROUTES = {"direct", "sql", "vector"}


def trace(agent: str, detail: str, started: float) -> dict:
    return {"type": "trace", "agent": agent, "detail": detail, "ms": round((time.perf_counter() - started) * 1000)}


async def stream_llm(prompt: str, parts: list[str]):
    """Streams the LLM answer as token events and records the pieces in `parts`.
    (An async generator can't `return` a value, so the caller reads the full text from `parts`.)"""
    async for kind, piece in llm.astream(prompt):
        if kind == "reset":  # Gemini failed midway and Groq restarts: wipe the partial text
            parts.clear()
            yield {"type": "replace", "text": ""}
        else:
            parts.append(piece)
            yield {"type": "token", "text": piece}


async def safe_verify(answer: str, chunks) -> dict:
    """Never let a verifier hiccup (bad JSON, API error) destroy an answer the user already sees."""
    try:
        v = await verify(answer, chunks)
        return {"grounded": bool(v.get("grounded")), "unsupported": list(v.get("unsupported") or []), "failed": False}
    except Exception as e:
        print(f"[verifier] failed: {type(e).__name__}: {e}")
        return {"grounded": False, "unsupported": [], "failed": True}


def answer_prompt(query: str, chunks, hist_text: str) -> str:
    ctx = "\n\n".join(f"[{i}] ({c.file_name}) {c.text}" for i, c in enumerate(chunks))
    convo = f"Conversation so far (only to understand the question):\n{hist_text}\n\n" if hist_text else ""
    return (f"Answer ONLY from the context. If it is not there, say you could not find it.\n\n"
            f"{convo}Context:\n{ctx}\n\nQuestion: {query}")


SQL_ANSWER_TTL = 300  # answers about the document list can mention dates ("today"), so keep them short-lived


async def answer_cache_key(query: str, user_id: str, history: list[dict]) -> str | None:
    """Same user + same question + same chat context + same document library + same models = same answer.
    Returns None when Redis can't be used (then nothing is looked up or stored)."""
    version = await cache.docs_version(user_id)  # changes on every upload / delete (see main.py)
    if version is None:
        return None
    convo = json.dumps([[m["role"], m["text"]] for m in history], ensure_ascii=False)
    return cache.key("ans", cache.digest(MODEL_SALT, user_id, version, " ".join(query.split()), convo))


async def run_pipeline(query: str, user_id: str, history: list[dict] | None = None):
    """Public entry point (same events as before). A repeated question is answered from Redis; anything
    else runs the real pipeline below and, if the result is complete and trustworthy, is stored."""
    history = history or []
    t = time.perf_counter()
    key = await answer_cache_key(query, user_id, history)
    hit = await cache.aget_json(key) if key else None
    if isinstance(hit, dict) and "text" in hit and "sources" in hit:  # anything else counts as a miss
        yield trace("Cache", "answer served from Redis", t)
        yield {"type": "token", "text": hit["text"]}
        if hit.get("verified"):
            yield {"type": "verified", **hit["verified"]}
        yield {"type": "done", "sources": hit["sources"]}
        return

    parts: list[str] = []
    verified, used_sql = None, False
    async for ev in _run_pipeline(query, user_id, history):
        if ev["type"] == "token":
            parts.append(ev["text"])
        elif ev["type"] == "replace":
            parts = [ev["text"]]
        elif ev["type"] == "verified":
            verified = {"grounded": ev["grounded"], "unsupported": ev["unsupported"]}
        elif ev["type"] == "trace" and ev["agent"] == "Metadata query":
            used_sql = True
        elif ev["type"] == "done":
            text = "".join(parts)
            # Store before `done` goes out. Never store an empty answer, or an answer the verifier could
            # not confirm (a retry might do better). direct/sql answers have no verifier (verified is None).
            if key and text.strip() and (verified is None or verified["grounded"]):
                await cache.aset_json(key, {"text": text, "sources": ev["sources"], "verified": verified},
                                      min(cache.ANSWER_TTL, SQL_ANSWER_TTL) if used_sql else cache.ANSWER_TTL)
        yield ev


async def _run_pipeline(query: str, user_id: str, history: list[dict]):
    hist_text = format_history(history)

    t = time.perf_counter()
    try:
        r = await route_query(query, history)
        if r.get("route") not in ROUTES:
            raise ValueError(f"bad route {r.get('route')!r}")
    except Exception as e:  # if the router fails, searching the documents is the safest default
        print(f"[router] failed: {type(e).__name__}: {e}")
        r = {"route": "vector", "reason": "router unavailable, searching your documents"}
    yield trace("Router", f"{r['route']}: {r.get('reason', '')}", t)

    if r["route"] == "direct":
        prompt = f"Conversation so far:\n{hist_text}\n\nReply to the latest user message: {query}" if hist_text else query
        async for ev in stream_llm(prompt, []):
            yield ev
        yield {"type": "done", "sources": []}
        return

    if r["route"] == "sql":
        t = time.perf_counter()
        # The model never writes SQL: we run a fixed query scoped to this user.
        rows = await asyncio.to_thread(lambda: supabase.table("documents")
            .select("file_name,created_at,chunk_count,size_bytes").eq("user_id", user_id).execute().data)
        yield trace("Metadata query", f"{len(rows)} rows", t)
        async for ev in stream_llm(f"Answer using this document list only:\n{rows}\n\nQ: {query}", []):
            yield ev
        yield {"type": "done", "sources": []}
        return

    # ---- vector route: retrieve -> stream a draft -> verify -> (maybe) retry once ----
    top_k, chunks, answer = 5, [], ""
    for attempt in range(MAX_RETRIES + 1):
        t = time.perf_counter()
        chunks, subs = await retrieve(query, user_id, top_k, history)
        yield trace("Retriever", f"{len(chunks)} chunks (hybrid), top-k {top_k}, {len(subs)} sub-queries", t)
        prompt = answer_prompt(query, chunks, hist_text)

        if attempt == 0:
            # First try: the user watches the draft appear word by word.
            parts: list[str] = []
            async for ev in stream_llm(prompt, parts):
                yield ev
            answer = "".join(parts)
        else:
            # Retry: generate quietly. The user already has a draft on screen, and we only
            # swap it out (with a `replace` event) once the new answer has been checked.
            answer = (await llm.acomplete(prompt)).text

        t = time.perf_counter()
        v = await safe_verify(answer, chunks)
        if v["failed"]:
            detail = "check failed, answer not verified"
        else:
            detail = "grounded" if v["grounded"] else f"ungrounded: {len(v['unsupported'])} claims"
        yield trace("Verifier", detail, t)

        if not v["grounded"] and not v["failed"] and attempt < MAX_RETRIES:
            top_k = 12  # widen the search and try once more
            continue

        if attempt > 0:  # the draft is being corrected: overwrite it with the re-checked answer
            yield {"type": "replace", "text": answer}
        yield {"type": "verified", "grounded": v["grounded"], "unsupported": len(v["unsupported"])}
        break

    sources = list({c.doc_id: {"docId": c.doc_id, "fileName": c.file_name} for c in chunks}.values())
    yield {"type": "done", "sources": sources}