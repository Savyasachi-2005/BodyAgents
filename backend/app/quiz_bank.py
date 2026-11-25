"""Quiz question bank stored in Mongo, seeded from curated JSON."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.memory.db import get_db

ORGAN_IDS = {
    "heart",
    "brain",
    "lungs",
    "bones",
    "liver",
    "kidneys",
    "eyeball",
    "intestine",
    "pancreas",
    "skin",
}

SEED_PATH = Path(__file__).resolve().parent / "data" / "quiz_seed.json"
COLLECTION = "quiz_questions"


def load_seed() -> dict[str, list[dict[str, Any]]]:
    if not SEED_PATH.exists():
        return {}
    raw = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if k in ORGAN_IDS and isinstance(v, list)}


def normalize_question(raw: dict[str, Any], index: int, organ_id: str) -> dict[str, Any]:
    choices = raw.get("choices") or []
    if not isinstance(choices, list) or len(choices) != 4:
        raise ValueError(f"Question {index + 1}: choices must be exactly 4 strings")
    choices_t = [str(c).strip() for c in choices]
    if any(not c for c in choices_t):
        raise ValueError(f"Question {index + 1}: choices cannot be empty")
    correct = raw.get("correctIndex", raw.get("correct_index", 0))
    try:
        correct_i = int(correct)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Question {index + 1}: invalid correctIndex") from exc
    if correct_i not in (0, 1, 2, 3):
        raise ValueError(f"Question {index + 1}: correctIndex must be 0–3")
    qid = str(raw.get("id") or f"{organ_id}-{index + 1}").strip()
    prompt = str(raw.get("prompt") or "").strip()
    explain = str(raw.get("explain") or "").strip()
    if not prompt:
        raise ValueError(f"Question {index + 1}: prompt is required")
    if not explain:
        raise ValueError(f"Question {index + 1}: explain is required")
    return {
        "id": qid,
        "prompt": prompt,
        "choices": choices_t,
        "correctIndex": correct_i,
        "explain": explain,
    }


def serialize_questions(doc: dict[str, Any] | None, organ_id: str) -> dict[str, Any]:
    questions = (doc or {}).get("questions") or []
    updated = (doc or {}).get("updated_at")
    if isinstance(updated, datetime):
        updated = updated.isoformat()
    return {
        "organId": organ_id,
        "questions": questions,
        "updatedAt": updated,
        "updatedBy": (doc or {}).get("updated_by"),
    }


async def ensure_seeded() -> None:
    """Insert seed banks for organs that have no document yet."""
    seed = load_seed()
    if not seed:
        return
    col = get_db()[COLLECTION]
    now = datetime.now(timezone.utc)
    for organ_id, questions in seed.items():
        existing = await col.find_one({"organ_id": organ_id}, projection={"_id": 1})
        if existing:
            continue
        normalized = [normalize_question(q, i, organ_id) for i, q in enumerate(questions)]
        await col.insert_one(
            {
                "organ_id": organ_id,
                "questions": normalized,
                "updated_at": now,
                "updated_by": "seed",
            }
        )


async def get_questions(organ_id: str) -> dict[str, Any]:
    if organ_id not in ORGAN_IDS:
        raise ValueError("Unknown organ_id")
    await ensure_seeded()
    doc = await get_db()[COLLECTION].find_one({"organ_id": organ_id})
    return serialize_questions(doc, organ_id)


async def list_all_questions() -> list[dict[str, Any]]:
    await ensure_seeded()
    col = get_db()[COLLECTION]
    out: list[dict[str, Any]] = []
    for organ_id in sorted(ORGAN_IDS):
        doc = await col.find_one({"organ_id": organ_id})
        out.append(serialize_questions(doc, organ_id))
    return out


async def put_questions(
    organ_id: str,
    questions: list[dict[str, Any]],
    updated_by: str,
) -> dict[str, Any]:
    if organ_id not in ORGAN_IDS:
        raise ValueError("Unknown organ_id")
    if not questions:
        raise ValueError("At least one question is required")
    if len(questions) > 100:
        raise ValueError("At most 100 questions per organ")
    normalized = [normalize_question(q, i, organ_id) for i, q in enumerate(questions)]
    ids = [q["id"] for q in normalized]
    if len(ids) != len(set(ids)):
        raise ValueError("Question ids must be unique within an organ")
    now = datetime.now(timezone.utc)
    doc = {
        "organ_id": organ_id,
        "questions": normalized,
        "updated_at": now,
        "updated_by": updated_by,
    }
    await get_db()[COLLECTION].update_one({"organ_id": organ_id}, {"$set": doc}, upsert=True)
    return serialize_questions(doc, organ_id)
