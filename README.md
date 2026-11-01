# Agentic RAG (Python backend + Next.js UI)

## Run (Windows PowerShell)
Backend:
    cd backend
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    Copy-Item .env.example .env          # then fill in the keys
    python create_index.py               # once: creates the Pinecone index
    uvicorn app.main:app --reload        # -> http://localhost:8000/docs   (FastAPI's own API docs)

Frontend:
    cd frontend
    npm install
    Copy-Item .env.example .env.local    # then fill in the keys
    npm run dev                          # -> http://localhost:3000

## One-time setup in the dashboards
1. Supabase -> SQL editor: run `supabase/schema.sql`, THEN `supabase/schema_v2_additions.sql`
   (the second one adds chat history + keyword search; safe to run more than once).
2. Supabase -> Authentication -> Providers: enable Google (and Email).
3. Supabase -> Authentication -> URL Configuration:
   - Site URL: http://localhost:3000   (your deployed URL later)
   - Redirect URLs: add http://localhost:3000/auth/reset and http://localhost:3000/app
     (add the same two paths for your deployed domain when you deploy)

## Where things live (backend, the part to know well)
- app/main.py            FastAPI routes: /chat (streams), /ingest, /documents/{id} (DELETE),
                         /conversations (+ /{id}), /health, and the JWT check
- app/pipeline.py        runs the 3 agents; yields trace / token / replace / verified / done events
- app/agents/router.py   Agent 1: direct | sql | vector (sees the last few chat messages)
- app/agents/retriever.py Agent 2: sub-queries, then HYBRID search (Pinecone + Postgres full-text, merged with RRF)
- app/agents/verifier.py Agent 3: grounding check
- app/ingestion.py       upload checks -> text -> chunks -> embeddings -> Pinecone + Postgres; also deleting a document
- app/conversations.py   saved chats (conversations + messages tables)
- app/config.py          clients, FallbackLLM (Gemini -> Groq, both streaming)

Frontend is UI only: it logs in with Supabase and calls the API through frontend/lib/api.ts.