from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.memory.db import get_db


def _collection():
    settings = get_settings()
    return get_db()[settings.mongodb_sessions_collection]


async def get_history(philosopher_id: str, session_id: str, limit: int | None = None) -> list[dict[str, str]]:
    limit = limit or get_settings().session_history_limit
    doc = await _collection().find_one({"philosopher_id": philosopher_id, "session_id": session_id})
    if not doc:
        return []
    messages = doc.get("messages", [])
    return messages[-limit:]


async def append_turn(
    philosopher_id: str,
    session_id: str,
    user_message: str,
    assistant_message: str,
) -> None:
    now = datetime.now(timezone.utc)
    await _collection().update_one(
        {"philosopher_id": philosopher_id, "session_id": session_id},
        {
            "$push": {
                "messages": {
                    "$each": [
                        {"role": "user", "content": user_message},
                        {"role": "assistant", "content": assistant_message},
                    ],
                    "$slice": -get_settings().session_max_messages,
                }
            },
            "$set": {"updated_at": now},
            "$setOnInsert": {
                "philosopher_id": philosopher_id,
                "session_id": session_id,
                "created_at": now,
            },
        },
        upsert=True,
    )
