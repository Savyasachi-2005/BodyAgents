from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.auth import authenticate, create_session, create_user, delete_session, get_user_by_token
from app.deps import bearer_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class SignupBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class AuthResponse(BaseModel):
    token: str
    user: dict


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupBody) -> AuthResponse:
    try:
        user = await create_user(body.name, body.email, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    token = await create_session(user["id"])
    return AuthResponse(token=token, user=user)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginBody) -> AuthResponse:
    try:
        user = await authenticate(body.email, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    token = await create_session(user["id"])
    return AuthResponse(token=token, user=user)


@router.get("/me")
async def me(authorization: str | None = Header(default=None)) -> dict:
    token = bearer_token(authorization)
    user = await get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user}


@router.post("/logout")
async def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    await delete_session(bearer_token(authorization))
    return {"status": "ok"}
