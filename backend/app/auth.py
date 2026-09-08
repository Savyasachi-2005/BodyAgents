from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import get_settings
from app.memory.db import get_db

USERS = "users"
AUTH_SESSIONS = "auth_sessions"
TOKEN_DAYS = 14


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return salt, digest.hex()


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    _, candidate = _hash_password(password, salt)
    return hmac.compare_digest(candidate, password_hash)


def initials_from_name(name: str) -> str:
    parts = [part for part in name.strip().split() if part]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


async def create_user(name: str, email: str, password: str) -> dict[str, Any]:
    email_norm = email.strip().lower()
    users = get_db()[USERS]
    existing = await users.find_one({"email": email_norm})
    if existing:
        raise ValueError("Email already registered")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")

    salt, password_hash = _hash_password(password)
    now = datetime.now(timezone.utc)
    doc = {
        "name": name.strip(),
        "email": email_norm,
        "salt": salt,
        "password_hash": password_hash,
        "created_at": now,
    }
    result = await users.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "name": doc["name"],
        "email": doc["email"],
        "initials": initials_from_name(doc["name"]),
    }


async def authenticate(email: str, password: str) -> dict[str, Any]:
    email_norm = email.strip().lower()
    user = await get_db()[USERS].find_one({"email": email_norm})
    if not user or not verify_password(password, user["salt"], user["password_hash"]):
        raise ValueError("Invalid email or password")
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "initials": initials_from_name(user["name"]),
    }


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await get_db()[AUTH_SESSIONS].insert_one(
        {
            "token": token,
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + timedelta(days=TOKEN_DAYS),
        }
    )
    return token


async def get_user_by_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    session = await get_db()[AUTH_SESSIONS].find_one({"token": token})
    if not session:
        return None
    expires = session.get("expires_at")
    if expires and expires.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        await get_db()[AUTH_SESSIONS].delete_one({"token": token})
        return None

    from bson import ObjectId

    user = await get_db()[USERS].find_one({"_id": ObjectId(session["user_id"])})
    if not user:
        return None
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "initials": initials_from_name(user["name"]),
    }


async def delete_session(token: str | None) -> None:
    if not token:
        return
    await get_db()[AUTH_SESSIONS].delete_one({"token": token})
