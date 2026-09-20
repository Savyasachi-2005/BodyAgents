# BodyAgents

Agentic RAG educational anatomy app, with a Next.js/Three.js learner UI and a
FastAPI/LangGraph/Groq backend.

```
anatomy-main/
  frontend/   # Next.js + vinext + Three.js UI
  backend/    # FastAPI + LangGraph + Groq + Mongo
  .env.example
```
 
## Setup

```bash
copy .env.example .env
```

Fill `GROQ_API_KEY` and `MONGODB_URI`.

For production, set a restricted `CORS_ORIGINS` list and create a MongoDB Atlas
Vector Search index named by `MONGODB_VECTOR_INDEX`. The index must use the
`embedding` field as a cosine vector and support a `body_part_id` filter.

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8001
```

In Command Prompt, you can activate the environment first with `.venv\Scripts\activate.bat` and then use `python` and `uvicorn` normally. In PowerShell, use the explicit `.venv\Scripts\python.exe` and `.venv\Scripts\uvicorn.exe` commands above; this Python installation does not include a PowerShell activation script.

Optional RAG seed:

```bash
python pipeline/chunker.py
python pipeline/embed_and_store.py
```

Ingestion is incremental: unchanged chunks (identified by a content hash) do
not have their embeddings recomputed. It also bulk-upserts changed chunks.

## Retrieval and reliability

The backend retrieves a query embedding through MongoDB Vector Search, filters
by body part, applies `RAG_MIN_SCORE`, and includes readable source references
in grounded answers. If Vector Search is unavailable, an explicitly logged,
configuration-controlled compatibility fallback is used for local development.

Session history is bounded by `SESSION_MAX_MESSAGES`; only the most recent
`SESSION_HISTORY_LIMIT` messages are sent to the model. `/api/v1/health` is a
cheap liveness probe and `/api/v1/ready` verifies MongoDB connectivity.

## Tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3001




