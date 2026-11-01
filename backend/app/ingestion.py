"""Upload -> checks -> Supabase Storage -> extract text -> chunk -> embed -> Pinecone (+ Postgres chunks)."""
import asyncio, io, re, uuid
from fastapi import HTTPException
from pypdf import PdfReader
from llama_index.core import Document, VectorStoreIndex, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from app.config import supabase, vector_store, pinecone_index

MAX_BYTES = 10 * 1024 * 1024  # 10 MB per file
MAX_DOCS = 20                 # documents per user
ALLOWED = {".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown"}


def extract_text(name: str, data: bytes) -> str:
    if name.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            reader.decrypt("")  # many "protected" PDFs just have an empty password
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
    else:
        text = data.decode("utf-8", errors="ignore")
    # Postgres text columns reject NUL bytes, and lone surrogates break JSON, so scrub both.
    return text.replace("\x00", "").encode("utf-8", "ignore").decode("utf-8")


async def ingest(user_id: str, name: str, data: bytes) -> dict:
    # ---- 1. Checks. These are the REAL limits: the frontend checks are only for friendliness ----
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED:
        raise HTTPException(415, "Only PDF, TXT and MD files are supported.")
    if len(data) == 0:
        raise HTTPException(400, "That file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "That file is larger than 10 MB.")

    count = await asyncio.to_thread(lambda: supabase.table("documents").select("id", count="exact")
                                    .eq("user_id", user_id).execute().count)
    if (count or 0) >= MAX_DOCS:
        raise HTTPException(409, f"You have reached the limit of {MAX_DOCS} documents. Delete one to upload another.")

    try:
        text = await asyncio.to_thread(extract_text, name, data)
    except Exception as e:
        print(f"[ingest] could not read {name}: {type(e).__name__}: {e}")
        raise HTTPException(422, "We couldn't read this file. It may be corrupted or password-protected.")
    if not text.strip():
        raise HTTPException(422, "No text could be extracted. This looks like a scanned or image-only PDF "
                                 "(there is no OCR yet). Please upload a text-based PDF, TXT or MD file.")

    # ---- 2. Save everywhere. If any step fails we undo the earlier ones ----
    doc_id = str(uuid.uuid4())
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", name)  # Storage keys dislike spaces and unicode
    path = f"{user_id}/{doc_id}-{safe_name}"
    try:
        def save():
            supabase.storage.from_("documents").upload(path, data, {"content-type": ALLOWED[ext]})
            supabase.table("documents").insert({"id": doc_id, "user_id": user_id, "file_name": name,
                "storage_path": path, "mime": ALLOWED[ext], "size_bytes": len(data), "content": text}).execute()
        await asyncio.to_thread(save)

        # The document id is ALSO the LlamaIndex Document id, so every vector id in Pinecone becomes
        # '{doc_id}#{chunk_number}'. That shared prefix is what lets us delete a document's vectors later.
        doc = Document(text=text, id_=doc_id,
                       metadata={"user_id": user_id, "doc_id": doc_id, "file_name": name},
                       excluded_embed_metadata_keys=["user_id", "doc_id"],  # ids carry no meaning, keep them out of the embedding
                       excluded_llm_metadata_keys=["user_id", "doc_id"])
        nodes = SentenceSplitter(chunk_size=512, chunk_overlap=64).get_nodes_from_documents([doc])
        for i, node in enumerate(nodes):
            node.id_ = str(i)  # LlamaIndex prefixes '{doc_id}#' for us -> vector id '{doc_id}#{i}'

        await asyncio.to_thread(VectorStoreIndex, nodes, storage_context=StorageContext.from_defaults(vector_store=vector_store))

        # Copy the chunk text into Postgres too: that is what powers the keyword half of hybrid search.
        rows = [{"id": f"{doc_id}#{i}", "doc_id": doc_id, "user_id": user_id, "file_name": name,
                 "content": n.get_content()} for i, n in enumerate(nodes)]
        def save_chunks():
            for start in range(0, len(rows), 200):  # insert in batches so one request isn't huge
                supabase.table("chunks").insert(rows[start:start + 200]).execute()
            supabase.table("documents").update({"chunk_count": len(nodes)}).eq("id", doc_id).execute()
        await asyncio.to_thread(save_chunks)
    except Exception as e:
        print(f"[ingest] failed for {name}: {type(e).__name__}: {e}")
        await asyncio.to_thread(remove_everything, doc_id, path)  # best-effort cleanup, no half-indexed files
        raise HTTPException(502, "Indexing failed (the AI service may be rate-limited). Please try again in a minute.")
    return {"id": doc_id, "chunks": len(nodes)}


def delete_vectors(doc_id: str):
    """Pinecone: serverless/starter indexes can't delete by metadata filter, but they CAN list ids by prefix.
    So: list every id starting with '{doc_id}#', then delete those ids (max 1000 per request)."""
    namespace = getattr(vector_store, "namespace", None) or ""
    ids = []
    for page in pinecone_index.list(prefix=f"{doc_id}#", namespace=namespace):
        items = getattr(page, "vectors", page)  # newer SDKs: page.vectors (objects). older: a list of id strings
        ids += [x if isinstance(x, str) else x.id for x in items]
    for start in range(0, len(ids), 1000):
        pinecone_index.delete(ids=ids[start:start + 1000], namespace=namespace)


def remove_everything(doc_id: str, storage_path: str):
    """Best-effort cleanup used when an upload fails halfway. Each step is allowed to fail on its own."""
    for step in (lambda: delete_vectors(doc_id),
                 lambda: supabase.storage.from_("documents").remove([storage_path]),
                 lambda: supabase.table("documents").delete().eq("id", doc_id).execute()):  # also deletes its chunks (CASCADE)
        try:
            step()
        except Exception as e:
            print(f"[cleanup] step failed: {type(e).__name__}: {e}")


async def delete_document(user_id: str, doc_id: str):
    # Ownership check: the row must belong to THIS user, otherwise we pretend it doesn't exist.
    rows = await asyncio.to_thread(lambda: supabase.table("documents").select("storage_path")
                                   .eq("id", doc_id).eq("user_id", user_id).execute().data)
    if not rows:
        raise HTTPException(404, "Document not found.")

    # Order matters: vectors first. If Pinecone fails we stop with the DB row still there,
    # so you can simply retry. (The other way round would leave vectors nobody can find.)
    try:
        await asyncio.to_thread(delete_vectors, doc_id)
    except Exception as e:
        print(f"[delete] pinecone failed: {type(e).__name__}: {e}")
        raise HTTPException(502, "Couldn't remove the document from the search index. Please try again.")
    try:
        await asyncio.to_thread(lambda: supabase.storage.from_("documents").remove([rows[0]["storage_path"]]))
    except Exception as e:  # file already gone? not worth blocking the delete
        print(f"[delete] storage remove failed: {type(e).__name__}: {e}")
    await asyncio.to_thread(lambda: supabase.table("documents").delete().eq("id", doc_id).eq("user_id", user_id).execute())