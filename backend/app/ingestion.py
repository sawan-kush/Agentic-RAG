"""Upload -> Supabase Storage -> extract text -> chunk -> embed -> Pinecone."""
import asyncio, io, time
from pypdf import PdfReader
from llama_index.core import Document, VectorStoreIndex, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from app.config import supabase, vector_store


def extract_text(name: str, data: bytes) -> str:
    if name.lower().endswith(".pdf"):
        return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
    return data.decode("utf-8", errors="ignore")


async def ingest(user_id: str, name: str, mime: str, data: bytes) -> dict:
    path = f"{user_id}/{int(time.time())}-{name}"
    text = await asyncio.to_thread(extract_text, name, data)

    def save():
        supabase.storage.from_("documents").upload(path, data, {"content-type": mime})
        return supabase.table("documents").insert({"user_id": user_id, "file_name": name, "storage_path": path,
                                                   "mime": mime, "size_bytes": len(data), "content": text}).execute().data[0]
    row = await asyncio.to_thread(save)

    doc = Document(text=text, metadata={"user_id": user_id, "doc_id": row["id"], "file_name": name})
    nodes = SentenceSplitter(chunk_size=512, chunk_overlap=64).get_nodes_from_documents([doc])
    await asyncio.to_thread(VectorStoreIndex, nodes, storage_context=StorageContext.from_defaults(vector_store=vector_store))
    await asyncio.to_thread(lambda: supabase.table("documents").update({"chunk_count": len(nodes)}).eq("id", row["id"]).execute())
    return {"id": row["id"], "chunks": len(nodes)}
