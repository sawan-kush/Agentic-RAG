import asyncio, json, os
from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.config import supabase
from app.pipeline import run_pipeline
from app.ingestion import ingest

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


class ChatIn(BaseModel):
    query: str


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat")
async def chat(body: ChatIn, user_id: str = Depends(current_user)):
    async def stream():  # newline-delimited JSON, one event per line
        try:
            async for ev in run_pipeline(body.query, user_id):
                yield json.dumps(ev) + "\n"
        except Exception as e:
            yield json.dumps({"type": "answer", "text": f"Something went wrong: {e}", "sources": []}) + "\n"
    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.post("/ingest")
async def ingest_route(file: UploadFile, user_id: str = Depends(current_user)):
    return await ingest(user_id, file.filename, file.content_type or "text/plain", await file.read())
