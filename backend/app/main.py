import asyncio, json, os, uuid
from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.config import supabase
from app.pipeline import run_pipeline
from app.ingestion import ingest, delete_document, MAX_BYTES
from app import conversations as convs

app = FastAPI(title="Agentic RAG API")
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
                   allow_methods=["*"], allow_headers=["*"])


async def current_user(authorization: str = Header(None)) -> str:
    """Verifies the Supabase JWT sent by the frontend and returns the user id."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    try:
        res = await asyncio.to_thread(supabase.auth.get_user, authorization.removeprefix("Bearer "))
        return res.user.id
    except Exception:
        raise HTTPException(401, "Invalid token")


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
def health():
    return {"ok": True}


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
    return await ingest(user_id, file.filename or "upload", data)


@app.delete("/documents/{doc_id}")
async def delete_document_route(doc_id: str, user_id: str = Depends(current_user)):
    await delete_document(user_id, valid_uuid(doc_id))
    return {"deleted": doc_id}