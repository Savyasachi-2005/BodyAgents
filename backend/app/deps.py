from __future__ import annotations

from typing import Any

from fastapi import Header, HTTPException

from app.auth import get_user_by_token


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


async def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = await get_user_by_token(bearer_token(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return user


async def require_admin(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = await get_current_user(authorization)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
