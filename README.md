# BodyAgents

Agentic RAG educational anatomy app.

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

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Optional RAG seed:

```bash
python pipeline/chunker.py
python pipeline/embed_and_store.py
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3001




