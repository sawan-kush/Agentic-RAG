# Agentic RAG (Python backend + Next.js UI)

## Run
Backend:  cd backend && python -m venv .venv && source .venv/bin/activate
          pip install -r requirements.txt && cp .env.example .env   (fill keys)
          uvicorn app.main:app --reload            -> http://localhost:8000/docs
Frontend: cd frontend && npm i && cp .env.example .env.local   (fill keys)
          npm run dev                              -> http://localhost:3000
Once: run supabase/schema.sql in Supabase SQL editor; create a Pinecone index (1536 dims, cosine);
enable Google in Supabase Auth.

## Where things live (backend, the part to know well)
- app/main.py          FastAPI routes: /chat (streams), /ingest, JWT check
- app/pipeline.py      runs the 3 agents in order, retry loop
- app/agents/router.py     Agent 1: direct | sql | vector
- app/agents/retriever.py  Agent 2: sub-queries + Pinecone search (per-user filter)
- app/agents/verifier.py   Agent 3: grounding check
- app/ingestion.py     file -> text -> chunks -> embeddings -> Pinecone
- app/config.py        clients and LlamaIndex models

Frontend is UI only: it logs in with Supabase and calls the API through frontend/lib/api.ts.
