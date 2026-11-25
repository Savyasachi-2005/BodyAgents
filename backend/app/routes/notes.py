from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.memory.db import get_db

router = APIRouter(prefix="/api/v1/notes", tags=["notes"])


class NoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    source: str = Field(min_length=1, max_length=200)
    persona_id: str | None = Field(default=None, max_length=80)


def _serialize(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "userId": doc["user_id"],
        "text": doc["text"],
        "source": doc["source"],
        "personaId": doc.get("persona_id"),
        "createdAt": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


@router.get("/")
async def list_notes(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    cursor = get_db()["notes"].find({"user_id": user["id"]}).sort("created_at", -1)
    notes = [_serialize(doc) async for doc in cursor]
    return {"notes": notes}


@router.post("/")
async def create_note(body: NoteCreate, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user["id"],
        "text": body.text.strip(),
        "source": body.source.strip(),
        "persona_id": body.persona_id,
        "created_at": now,
    }
    result = await get_db()["notes"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return {"note": _serialize(doc)}


@router.delete("/{note_id}")
async def delete_note(note_id: str, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, str]:
    try:
        oid = ObjectId(note_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid note id") from exc
    result = await get_db()["notes"].delete_one({"_id": oid, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "ok"}
