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
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8001
```

In Command Prompt, you can activate the environment first with `.venv\Scripts\activate.bat` and then use `python` and `uvicorn` normally. In PowerShell, use the explicit `.venv\Scripts\python.exe` and `.venv\Scripts\uvicorn.exe` commands above; this Python installation does not include a PowerShell activation script.

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




