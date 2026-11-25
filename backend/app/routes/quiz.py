from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.memory.db import get_db
from app.quiz_bank import ORGAN_IDS, get_questions

router = APIRouter(prefix="/api/v1/quiz", tags=["quiz"])

BADGE_IDS = {"first_quiz", "first_perfect", "three_organs", "streak_7"}


class QuizResultBody(BaseModel):
    organ_id: str = Field(min_length=2, max_length=40)
    correct_count: int = Field(ge=0, le=20)
    total: int = Field(ge=1, le=20)


class QuizProgressBody(BaseModel):
    xp: int = Field(ge=0, default=0)
    coins: int = Field(ge=0, default=0)
    streak: int = Field(ge=0, default=0)
    last_quiz_date: str | None = None
    organ_stars: dict[str, int] = Field(default_factory=dict)
    best_scores: dict[str, int] = Field(default_factory=dict)
    badges: list[str] = Field(default_factory=list)


def empty_progress(user_id: str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "xp": 0,
        "coins": 0,
        "streak": 0,
        "last_quiz_date": None,
        "organ_stars": {},
        "best_scores": {},
        "badges": [],
    }


def _serialize(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "userId": doc["user_id"],
        "xp": int(doc.get("xp") or 0),
        "coins": int(doc.get("coins") or 0),
        "streak": int(doc.get("streak") or 0),
        "lastQuizDate": doc.get("last_quiz_date"),
        "organStars": doc.get("organ_stars") or {},
        "bestScores": doc.get("best_scores") or {},
        "badges": list(doc.get("badges") or []),
    }


def stars_for_score(correct: int, total: int) -> int:
    if total <= 0:
        return 0
    if correct >= total:
        return 3
    if correct >= total - 1:
        return 2
    if correct >= math.ceil(total * 0.6):
        return 1
    return 0


def today_key(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc).astimezone()
    return f"{now.year:04d}-{now.month:02d}-{now.day:02d}"


def days_between(a: str, b: str) -> int:
    a_date = datetime.fromisoformat(f"{a}T12:00:00")
    b_date = datetime.fromisoformat(f"{b}T12:00:00")
    return int(round((b_date - a_date).total_seconds() / 86_400))


async def load_or_empty(user_id: str) -> dict[str, Any]:
    doc = await get_db()["quiz_progress"].find_one({"user_id": user_id})
    if not doc:
        return empty_progress(user_id)
    return doc


def apply_result(current: dict[str, Any], organ_id: str, correct_count: int, total: int) -> tuple[dict[str, Any], dict[str, Any]]:
    previous_best = current.get("best_scores", {}).get(organ_id)
    improved_answers = max(0, correct_count - (previous_best if previous_best is not None else 0))
    xp_from_answers = improved_answers * 10
    coins_from_answers = improved_answers
    perfect = correct_count == total and total > 0
    earned_perfect_bonus = perfect and previous_best != total
    xp_bonus = 15 if earned_perfect_bonus else 0
    coin_bonus = 3 if earned_perfect_bonus else 0
    xp_earned = xp_from_answers + xp_bonus
    coins_earned = coins_from_answers + coin_bonus
    stars = stars_for_score(correct_count, total)

    today = today_key()
    last = current.get("last_quiz_date")
    streak = int(current.get("streak") or 0)
    if not last:
        streak = 1
    elif last == today:
        streak = max(1, streak)
    else:
        gap = days_between(last, today)
        streak = streak + 1 if gap == 1 else 1

    organ_stars = dict(current.get("organ_stars") or {})
    prev_stars = int(organ_stars.get(organ_id) or 0)
    organ_stars[organ_id] = max(prev_stars, stars)

    best_scores = dict(current.get("best_scores") or {})
    best_scores[organ_id] = max(int(best_scores.get(organ_id) or 0), correct_count)

    badges = set(current.get("badges") or [])
    new_badges: list[str] = []

    def unlock(badge_id: str) -> None:
        if badge_id not in badges:
            badges.add(badge_id)
            new_badges.append(badge_id)

    unlock("first_quiz")
    if perfect:
        unlock("first_perfect")
    starred = sum(1 for value in organ_stars.values() if int(value or 0) >= 1)
    if starred >= 3:
        unlock("three_organs")
    if streak >= 7:
        unlock("streak_7")

    progress = {
        "user_id": current["user_id"],
        "xp": int(current.get("xp") or 0) + xp_earned,
        "coins": int(current.get("coins") or 0) + coins_earned,
        "streak": streak,
        "last_quiz_date": today,
        "organ_stars": organ_stars,
        "best_scores": best_scores,
        "badges": sorted(badges),
        "updated_at": datetime.now(timezone.utc),
    }
    delta = {
        "xpEarned": xp_earned,
        "coinsEarned": coins_earned,
        "stars": organ_stars[organ_id],
        "previousBest": previous_best,
        "newBadges": new_badges,
        "progress": _serialize(progress),
    }
    return progress, delta


@router.get("/questions/{organ_id}")
async def get_organ_questions(organ_id: str) -> dict[str, Any]:
    try:
        payload = await get_questions(organ_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.get("/progress")
async def get_progress(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    doc = await load_or_empty(user["id"])
    return {"progress": _serialize(doc)}


@router.put("/progress")
async def put_progress(body: QuizProgressBody, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Used for one-time migrate of local progress."""
    organ_stars = {k: max(0, min(3, int(v))) for k, v in body.organ_stars.items() if k in ORGAN_IDS}
    best_scores = {k: max(0, int(v)) for k, v in body.best_scores.items() if k in ORGAN_IDS}
    badges = [b for b in body.badges if b in BADGE_IDS]
    doc = {
        "user_id": user["id"],
        "xp": body.xp,
        "coins": body.coins,
        "streak": body.streak,
        "last_quiz_date": body.last_quiz_date,
        "organ_stars": organ_stars,
        "best_scores": best_scores,
        "badges": badges,
        "updated_at": datetime.now(timezone.utc),
    }
    existing = await get_db()["quiz_progress"].find_one({"user_id": user["id"]})
    if existing and (existing.get("xp") or 0) > 0:
        # Server already has progress — keep it (migrate only when empty).
        return {"progress": _serialize(existing), "migrated": False}
    await get_db()["quiz_progress"].update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    return {"progress": _serialize(doc), "migrated": True}


@router.post("/result")
async def post_result(body: QuizResultBody, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if body.organ_id not in ORGAN_IDS:
        raise HTTPException(status_code=400, detail="Unknown organ_id")
    if body.correct_count > body.total:
        raise HTTPException(status_code=400, detail="correct_count cannot exceed total")
    current = await load_or_empty(user["id"])
    progress, delta = apply_result(current, body.organ_id, body.correct_count, body.total)
    await get_db()["quiz_progress"].update_one({"user_id": user["id"]}, {"$set": progress}, upsert=True)
    return delta
