from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.memory.db import get_db
from app.config import get_settings
from app.personas import known_persona_ids

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


class ChatSource(BaseModel):
    title: str
    publisher: str
    url: str | None = None
    trust_tier: str | None = None


class ChatMessage(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str = Field(max_length=20000)
    sources: list[ChatSource] | None = None


class ChatPutBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    messages: list[ChatMessage] = Field(default_factory=list, max_length=200)


def _collection():
    return get_db()[get_settings().mongodb_sessions_collection]


@router.get("/{philosopher_id}")
async def get_chat(philosopher_id: str, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if philosopher_id not in known_persona_ids():
        raise HTTPException(status_code=404, detail="Unknown philosopher_id")
    doc = await _collection().find_one(
        {"user_id": user["id"], "philosopher_id": philosopher_id},
        sort=[("updated_at", -1)],
    )
    if not doc:
        return {"sessionId": None, "messages": []}
    messages = doc.get("ui_messages") or []
    return {
        "sessionId": doc.get("session_id"),
        "messages": messages,
    }


@router.put("/{philosopher_id}")
async def put_chat(
    philosopher_id: str,
    body: ChatPutBody,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if philosopher_id not in known_persona_ids():
        raise HTTPException(status_code=404, detail="Unknown philosopher_id")
    now = datetime.now(timezone.utc)
    messages = [message.model_dump() for message in body.messages]
    # Cap stored transcript size
    settings = get_settings()
    max_msgs = settings.session_max_messages
    if len(messages) > max_msgs:
        messages = messages[-max_msgs:]

    # Key by philosopher + session (existing unique index); attach user_id for ownership.
    await _collection().update_one(
        {
            "philosopher_id": philosopher_id,
            "session_id": body.session_id,
        },
        {
            "$set": {
                "ui_messages": messages,
                "updated_at": now,
                "user_id": user["id"],
                "philosopher_id": philosopher_id,
                "session_id": body.session_id,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"status": "ok", "sessionId": body.session_id, "count": len(messages)}
