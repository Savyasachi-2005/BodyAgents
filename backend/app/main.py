from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.agents.philosopher import stream_reply
from app.config import get_settings
from app.memory.db import close_client
from app.personas import known_persona_ids
from app.routes.auth import router as auth_router
from app.ws.manager import manager


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_client()


app = FastAPI(title="BodyAgents", version="0.1.0", lifespan=lifespan)
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "BodyAgents"}


@app.websocket("/api/v1/ws/chat/{philosopher_id}/{session_id}")
async def chat_socket(websocket: WebSocket, philosopher_id: str, session_id: str) -> None:
    await manager.connect(websocket, philosopher_id, session_id)
    if philosopher_id not in known_persona_ids():
        await websocket.send_text(json.dumps({"type": "error", "message": "Unknown philosopher_id"}))
        await websocket.close(code=1008)
        manager.disconnect(philosopher_id, session_id)
        return

    try:
        while True:
            user_message = await websocket.receive_text()
            user_message = user_message.strip()
            if not user_message:
                continue
            async for chunk in stream_reply(philosopher_id, session_id, user_message):
                await websocket.send_text(chunk)
    except WebSocketDisconnect:
        manager.disconnect(philosopher_id, session_id)
    except Exception as exc:
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        except Exception:
            pass
        manager.disconnect(philosopher_id, session_id)
