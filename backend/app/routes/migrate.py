from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.memory.db import get_db
from app.config import get_settings
from app.personas import known_persona_ids
from app.routes.quiz import BADGE_IDS, ORGAN_IDS, empty_progress

router = APIRouter(prefix="/api/v1/migrate", tags=["migrate"])


class MigrateNote(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    source: str = Field(min_length=1, max_length=200)
    persona_id: str | None = None
    created_at: str | None = None


class MigrateQuiz(BaseModel):
    xp: int = 0
    coins: int = 0
    streak: int = 0
    last_quiz_date: str | None = None
    organ_stars: dict[str, int] = Field(default_factory=dict)
    best_scores: dict[str, int] = Field(default_factory=dict)
    badges: list[str] = Field(default_factory=list)


class MigrateChat(BaseModel):
    philosopher_id: str
    session_id: str
    messages: list[dict[str, Any]] = Field(default_factory=list)


class MigrateBody(BaseModel):
    notes: list[MigrateNote] = Field(default_factory=list)
    quiz: MigrateQuiz | None = None
    chats: list[MigrateChat] = Field(default_factory=list)


@router.post("")
async def migrate_local(body: MigrateBody, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """One-time import of browser localStorage data when server side is empty."""
    db = get_db()
    imported = {"notes": 0, "quiz": False, "chats": 0}

    existing_notes = await db["notes"].count_documents({"user_id": user["id"]}, limit=1)
    if existing_notes == 0 and body.notes:
        docs = []
        for note in body.notes:
            created = datetime.now(timezone.utc)
            if note.created_at:
                try:
                    created = datetime.fromisoformat(note.created_at.replace("Z", "+00:00"))
                except ValueError:
                    pass
            docs.append(
                {
                    "user_id": user["id"],
                    "text": note.text.strip(),
                    "source": note.source.strip(),
                    "persona_id": note.persona_id,
                    "created_at": created,
                }
            )
        if docs:
            await db["notes"].insert_many(docs)
            imported["notes"] = len(docs)

    existing_quiz = await db["quiz_progress"].find_one({"user_id": user["id"]})
    if (not existing_quiz or int(existing_quiz.get("xp") or 0) == 0) and body.quiz:
        quiz = body.quiz
        doc = empty_progress(user["id"])
        doc.update(
            {
                "xp": max(0, quiz.xp),
                "coins": max(0, quiz.coins),
                "streak": max(0, quiz.streak),
                "last_quiz_date": quiz.last_quiz_date,
                "organ_stars": {k: max(0, min(3, int(v))) for k, v in quiz.organ_stars.items() if k in ORGAN_IDS},
                "best_scores": {k: max(0, int(v)) for k, v in quiz.best_scores.items() if k in ORGAN_IDS},
                "badges": [b for b in quiz.badges if b in BADGE_IDS],
                "updated_at": datetime.now(timezone.utc),
            }
        )
        await db["quiz_progress"].update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
        imported["quiz"] = True

    sessions = db[get_settings().mongodb_sessions_collection]
    for chat in body.chats:
        if chat.philosopher_id not in known_persona_ids():
            continue
        existing = await sessions.find_one(
            {"philosopher_id": chat.philosopher_id, "session_id": chat.session_id}
        )
        if existing and existing.get("ui_messages") and existing.get("user_id") == user["id"]:
            continue
        now = datetime.now(timezone.utc)
        await sessions.update_one(
            {
                "philosopher_id": chat.philosopher_id,
                "session_id": chat.session_id,
            },
            {
                "$set": {
                    "ui_messages": chat.messages[-get_settings().session_max_messages :],
                    "updated_at": now,
                    "user_id": user["id"],
                    "philosopher_id": chat.philosopher_id,
                    "session_id": chat.session_id,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        imported["chats"] += 1

    return {"status": "ok", "imported": imported}
