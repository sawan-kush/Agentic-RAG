import asyncio, json, os, uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.config import supabase
from app.pipeline import run_pipeline
from app.ingestion import ingest, delete_document, MAX_BYTES
from app import conversations as convs
from app import cache


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print(f"[cache] Redis: {await cache.status()}")  # disabled | up | down -- visible in `docker compose logs backend`
    yield
    await cache.close()


app = FastAPI(title="Agentic RAG API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
                   allow_methods=["*"], allow_headers=["*"])


async def current_user(authorization: str = Header(None)) -> str:
    """Verifies the Supabase JWT sent by the frontend and returns the user id."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.removeprefix("Bearer ")
    cached = await cache.cached_user(token)  # a few seconds of memory saves a Supabase round trip per request
    if cached:
        return cached
    try:
        res = await asyncio.to_thread(supabase.auth.get_user, token)
        user_id = res.user.id
    except Exception:
        raise HTTPException(401, "Invalid token")
    await cache.remember_user(token, user_id)  # only verified tokens get here
    return user_id


def valid_uuid(value: str) -> str:
    """Ids from the URL go into database queries, so reject anything that isn't a UUID (404, not a crash)."""
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(404, "Not found")


class ChatIn(BaseModel):
    query: str = Field(min_length=1, max_length=2000)  # also protects the free-tier LLM budget
    conversation_id: str | None = None


def line(event: dict) -> str:
    return json.dumps(event) + "\n"


@app.get("/health")
async def health():
    # `ok` only says the API itself is alive. Redis is an optional accelerator, so its state is reported
    # separately and never makes the API "unhealthy".
    return {"ok": True, "redis": await cache.status()}


@app.post("/chat")
async def chat(body: ChatIn, user_id: str = Depends(current_user)):
    history, conv_id = [], None
    if body.conversation_id:
        conv_id = valid_uuid(body.conversation_id)
        history = await convs.load_history(user_id, conv_id)
        if history is None:
            raise HTTPException(404, "Conversation not found")

    async def stream():  # newline-delimited JSON, one event per line
        text_parts, sources, verified, trace_log = [], [], None, []
        try:
            async for ev in run_pipeline(body.query, user_id, history):
                kind = ev["type"]
                if kind == "trace":
                    trace_log.append({k: ev[k] for k in ("agent", "detail", "ms")})
                elif kind == "token":
                    text_parts.append(ev["text"])
                elif kind == "replace":
                    text_parts = [ev["text"]]
                elif kind == "verified":
                    verified = ev["grounded"]
                elif kind == "done":
                    sources = ev["sources"]
                    continue  # we send `done` ourselves below, after saving, so it can include the conversation id
                yield line(ev)
        except Exception as e:
            print(f"[chat] pipeline error: {type(e).__name__}: {e}")  # details stay in the server log
            yield line({"type": "replace", "text": "Something went wrong while answering. Please try again."})
            yield line({"type": "done", "sources": [], "conversation_id": conv_id})
            return  # nothing is saved for a failed answer

        try:
            cid = await convs.save_exchange(user_id, conv_id, body.query, "".join(text_parts), sources, trace_log, verified)
        except Exception as e:  # the user still got their answer; only the saving failed
            print(f"[chat] could not save conversation: {type(e).__name__}: {e}")
            cid = conv_id
        yield line({"type": "done", "sources": sources, "conversation_id": cid})
    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.get("/conversations")
async def list_conversations(user_id: str = Depends(current_user)):
    return await convs.list_conversations(user_id)


@app.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, user_id: str = Depends(current_user)):
    conv = await convs.get_conversation(user_id, valid_uuid(conv_id))
    if conv is None:
        raise HTTPException(404, "Conversation not found")
    return conv


@app.delete("/conversations/{conv_id}")
async def remove_conversation(conv_id: str, user_id: str = Depends(current_user)):
    if not await convs.delete_conversation(user_id, valid_uuid(conv_id)):
        raise HTTPException(404, "Conversation not found")
    return {"deleted": conv_id}


@app.post("/ingest")
async def ingest_route(file: UploadFile, user_id: str = Depends(current_user)):
    data = await file.read(MAX_BYTES + 1)  # read at most 10 MB + 1 byte, enough to detect "too big"
    try:
        return await ingest(user_id, file.filename or "upload", data)
    finally:  # the library changed (or may have, if indexing failed halfway): old cached answers must not be reused
        await cache.bump_docs_version(user_id)


@app.delete("/documents/{doc_id}")
async def delete_document_route(doc_id: str, user_id: str = Depends(current_user)):
    try:
        await delete_document(user_id, valid_uuid(doc_id))
    finally:
        await cache.bump_docs_version(user_id)  # same reason as in /ingest
    return {"deleted": doc_id}