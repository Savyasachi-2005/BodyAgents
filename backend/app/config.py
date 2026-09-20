from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"

    mongodb_uri: str = ""
    mongodb_db: str = "philoagents"
    mongodb_vector_collection: str = "body_knowledge"
    mongodb_sessions_collection: str = "chat_sessions"
    mongodb_vector_index: str = "body_knowledge_vector"

    embedding_model: str = "all-MiniLM-L6-v2"
    rag_top_k: int = 5
    rag_num_candidates: int = 100
    rag_min_score: float = 0.35
    rag_vector_search_enabled: bool = True
    rag_fallback_enabled: bool = True
    session_history_limit: int = 12
    session_max_messages: int = 80
    max_websocket_message_chars: int = 4_000
    groq_temperature: float = 0.4
    groq_max_tokens: int = 800
    groq_timeout_seconds: float = 30.0
    groq_max_retries: int = 2

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = (
        "http://localhost:3000,http://localhost:3001,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001,"
        "http://localhost:8000,http://127.0.0.1:8000"
    )

    opik_api_key: str = ""
    opik_project: str = "bodyagents"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
