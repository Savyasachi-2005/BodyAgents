from __future__ import annotations

from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.mongodb_uri:
            raise RuntimeError("MONGODB_URI is not set")
        _client = AsyncIOMotorClient(settings.mongodb_uri)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    settings = get_settings()
    return get_client()[settings.mongodb_db]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


async def ensure_indexes() -> None:
    """Create only the indexes used by application query paths."""
    from pymongo import ASCENDING

    settings = get_settings()
    db = get_db()
    await db["users"].create_index([("email", ASCENDING)], unique=True, name="users_email_unique")
    await db["auth_sessions"].create_index([("token", ASCENDING)], unique=True, name="auth_token_unique")
    await db["auth_sessions"].create_index("expires_at", expireAfterSeconds=0, name="auth_expiry_ttl")
    await db[settings.mongodb_sessions_collection].create_index(
        [("philosopher_id", ASCENDING), ("session_id", ASCENDING)],
        unique=True,
        name="chat_session_lookup",
    )
    await db[settings.mongodb_vector_collection].create_index("body_part_id", name="knowledge_body_part")
    await db[settings.mongodb_vector_collection].create_index("chunk_id", unique=True, name="knowledge_chunk_unique")
