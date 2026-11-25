"""Admin-only APIs: quiz banks, users, progress + Excel export."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any, Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel, EmailStr, Field

from app.auth import USERS, serialize_user
from app.deps import require_admin
from app.memory.db import get_db
from app.quiz_bank import ORGAN_IDS, list_all_questions, put_questions
from app.routes.quiz import _serialize, empty_progress

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class QuizQuestionIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=500)
    choices: list[str] = Field(min_length=4, max_length=4)
    correctIndex: int = Field(ge=0, le=3)
    explain: str = Field(min_length=1, max_length=800)


class QuizBankPut(BaseModel):
    questions: list[QuizQuestionIn] = Field(min_length=1, max_length=100)


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    role: Literal["user", "admin"] | None = None
    active: bool | None = None


async def _count_admins() -> int:
    return await get_db()[USERS].count_documents({"role": "admin", "active": {"$ne": False}})


@router.get("/quiz/questions")
async def admin_list_quiz_banks(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    banks = await list_all_questions()
    return {"banks": banks}


@router.get("/quiz/questions/{organ_id}")
async def admin_get_quiz_bank(
    organ_id: str,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    from app.quiz_bank import get_questions

    try:
        return await get_questions(organ_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/quiz/questions/{organ_id}")
async def admin_put_quiz_bank(
    organ_id: str,
    body: QuizBankPut,
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return await put_questions(
            organ_id,
            [q.model_dump() for q in body.questions],
            updated_by=admin["id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/users")
async def admin_list_users(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    enriched: list[dict[str, Any]] = []
    async for doc in get_db()[USERS].find({}).sort("created_at", -1):
        row = serialize_user(doc)
        created = doc.get("created_at")
        row["createdAt"] = created.isoformat() if isinstance(created, datetime) else None
        enriched.append(row)
    return {"users": enriched}


@router.patch("/users/{user_id}")
async def admin_patch_user(
    user_id: str,
    body: UserPatch,
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    try:
        oid = ObjectId(user_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    users = get_db()[USERS]
    target = await users.find_one({"_id": oid})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.email is not None:
        email_norm = str(body.email).strip().lower()
        clash = await users.find_one({"email": email_norm, "_id": {"$ne": oid}})
        if clash:
            raise HTTPException(status_code=400, detail="Email already in use")
        updates["email"] = email_norm
    if body.role is not None:
        updates["role"] = body.role
    if body.active is not None:
        updates["active"] = body.active

    if not updates:
        return {"user": serialize_user(target)}

    was_admin = (target.get("role") or "user") == "admin" and target.get("active") is not False
    will_demote = body.role == "user" and was_admin
    will_disable = body.active is False and was_admin
    if was_admin and (will_demote or will_disable):
        admin_count = await _count_admins()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote or disable the last admin")

    # Prevent self-lockout that leaves zero admins (same last-admin rule covers it)
    if admin["id"] == user_id and (will_demote or will_disable):
        admin_count = await _count_admins()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote or disable the last admin")

    updates["updated_at"] = datetime.now(timezone.utc)
    await users.update_one({"_id": oid}, {"$set": updates})
    refreshed = await users.find_one({"_id": oid})
    assert refreshed is not None
    row = serialize_user(refreshed)
    created = refreshed.get("created_at")
    row["createdAt"] = created.isoformat() if isinstance(created, datetime) else None
    return {"user": row}


@router.get("/progress")
async def admin_list_progress(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    users_col = get_db()[USERS]
    progress_col = get_db()["quiz_progress"]
    rows: list[dict[str, Any]] = []
    async for user in users_col.find({}).sort("created_at", -1):
        uid = str(user["_id"])
        prog = await progress_col.find_one({"user_id": uid})
        if not prog:
            prog = empty_progress(uid)
        serialized = _serialize(prog)
        rows.append(
            {
                "user": serialize_user(user),
                "progress": serialized,
            }
        )
    return {"rows": rows}


def _progress_sheet_rows(
    users: list[dict[str, Any]],
    progress_by_user: dict[str, dict[str, Any]],
) -> list[list[Any]]:
    header = [
        "User ID",
        "Name",
        "Email",
        "Role",
        "Active",
        "XP",
        "Coins",
        "Streak",
        "Last Quiz Date",
        "Badges",
        "Organs Tried",
        "Stars Total",
        "Best Scores (JSON)",
        "Organ Stars (JSON)",
    ]
    rows: list[list[Any]] = [header]
    for user in users:
        uid = str(user["_id"])
        prog = progress_by_user.get(uid) or empty_progress(uid)
        organ_stars = prog.get("organ_stars") or {}
        best_scores = prog.get("best_scores") or {}
        rows.append(
            [
                uid,
                user.get("name"),
                user.get("email"),
                user.get("role") or "user",
                False if user.get("active") is False else True,
                int(prog.get("xp") or 0),
                int(prog.get("coins") or 0),
                int(prog.get("streak") or 0),
                prog.get("last_quiz_date") or "",
                ", ".join(prog.get("badges") or []),
                len(best_scores),
                sum(int(v or 0) for v in organ_stars.values()),
                str(dict(best_scores)),
                str(dict(organ_stars)),
            ]
        )
    return rows


@router.get("/progress/export.xlsx")
async def admin_export_progress(
    user_id: str | None = Query(default=None),
    _: dict[str, Any] = Depends(require_admin),
) -> StreamingResponse:
    users_col = get_db()[USERS]
    progress_col = get_db()["quiz_progress"]

    if user_id:
        try:
            oid = ObjectId(user_id)
        except InvalidId as exc:
            raise HTTPException(status_code=400, detail="Invalid user id") from exc
        user = await users_col.find_one({"_id": oid})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        users = [user]
    else:
        users = [doc async for doc in users_col.find({}).sort("email", 1)]

    progress_by_user: dict[str, dict[str, Any]] = {}
    for user in users:
        uid = str(user["_id"])
        prog = await progress_col.find_one({"user_id": uid})
        if prog:
            progress_by_user[uid] = prog

    wb = Workbook()
    ws = wb.active
    ws.title = "Quiz Progress"
    for row in _progress_sheet_rows(users, progress_by_user):
        ws.append(row)

    # Per-organ detail sheet
    detail = wb.create_sheet("By Organ")
    detail.append(["User ID", "Name", "Email", "Organ", "Best Score", "Stars"])
    for user in users:
        uid = str(user["_id"])
        prog = progress_by_user.get(uid) or empty_progress(uid)
        organ_stars = prog.get("organ_stars") or {}
        best_scores = prog.get("best_scores") or {}
        organ_ids = sorted(set(ORGAN_IDS) | set(organ_stars) | set(best_scores))
        for organ in organ_ids:
            if organ not in best_scores and organ not in organ_stars:
                continue
            detail.append(
                [
                    uid,
                    user.get("name"),
                    user.get("email"),
                    organ,
                    best_scores.get(organ, ""),
                    organ_stars.get(organ, ""),
                ]
            )

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    filename = f"bodyagents-progress-{user_id or 'all'}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/progress/{user_id}")
async def admin_get_progress(
    user_id: str,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    try:
        oid = ObjectId(user_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    user = await get_db()[USERS].find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    prog = await get_db()["quiz_progress"].find_one({"user_id": user_id})
    if not prog:
        prog = empty_progress(user_id)
    return {"user": serialize_user(user), "progress": _serialize(prog)}
