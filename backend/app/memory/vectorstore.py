from __future__ import annotations

from functools import lru_cache
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import numpy as np
    from sentence_transformers import SentenceTransformer

from app.config import get_settings
from app.memory.db import get_db

logger = logging.getLogger(__name__)


class RetrievalError(RuntimeError):
    """Raised when retrieval cannot produce a trustworthy result."""


@lru_cache
def get_embedder() -> "SentenceTransformer":
    from sentence_transformers import SentenceTransformer  # lazy import

    settings = get_settings()
    return SentenceTransformer(settings.embedding_model)


def embed_texts(texts: list[str]) -> list[list[float]]:
    import numpy as np  # lazy import

    model = get_embedder()
    vectors = model.encode(texts, normalize_embeddings=True)
    return [v.tolist() for v in np.asarray(vectors)]


def cosine_similarity(a: "np.ndarray", b: "np.ndarray") -> float:
    import numpy as np  # lazy import

    return float(np.dot(a, b))


def _normalize_results(documents: list[dict[str, Any]], min_score: float) -> list[dict[str, Any]]:
    return [
        {
            "text": doc.get("text", ""),
            "source": doc.get("source", "seed"),
            "chunk_id": doc.get("chunk_id"),
            "section": doc.get("section"),
            "score": float(doc.get("score", 0)),
        }
        for doc in documents
        if doc.get("text") and float(doc.get("score", 0)) >= min_score
    ]


async def _vector_search(collection: Any, philosopher_id: str, query_vector: list[float], k: int) -> list[dict[str, Any]]:
    settings = get_settings()
    pipeline = [
        {"$vectorSearch": {
            "index": settings.mongodb_vector_index,
            "path": "embedding",
            "queryVector": query_vector,
            "numCandidates": max(settings.rag_num_candidates, k),
            "limit": k,
            "filter": {"body_part_id": philosopher_id},
        }},
        {"$project": {"text": 1, "source": 1, "chunk_id": 1, "section": 1, "score": {"$meta": "vectorSearchScore"}}},
    ]
    return [document async for document in collection.aggregate(pipeline)]


async def _explicit_fallback(collection: Any, philosopher_id: str, query_vector: "np.ndarray", k: int) -> list[dict[str, Any]]:
    """Compatibility path for local MongoDB. It is deliberately logged."""
    import numpy as np  # lazy import

    logger.warning("MongoDB Vector Search unavailable; using bounded Python fallback", extra={"body_part_id": philosopher_id})
    cursor = collection.find({"body_part_id": philosopher_id}, {"text": 1, "embedding": 1, "source": 1, "chunk_id": 1, "section": 1})
    scored: list[dict[str, Any]] = []
    async for doc in cursor:
        embedding = doc.get("embedding")
        if embedding:
            doc["score"] = cosine_similarity(query_vector, np.asarray(embedding, dtype=np.float32))
            scored.append(doc)
    return sorted(scored, key=lambda item: item["score"], reverse=True)[:k]


async def retrieve_passages(philosopher_id: str, query: str, top_k: int | None = None) -> list[dict[str, Any]]:
    settings = get_settings()
    k = top_k or settings.rag_top_k
    collection = get_db()[settings.mongodb_vector_collection]

    if not query.strip():
        return []
    query_values = embed_texts([query])[0]
    try:
        if settings.rag_vector_search_enabled:
            results = await _vector_search(collection, philosopher_id, query_values, k)
            return _normalize_results(results, settings.rag_min_score)
    except Exception as exc:
        if not settings.rag_fallback_enabled:
            raise RetrievalError("MongoDB Vector Search failed") from exc
        logger.warning("Vector search failed: %s", exc)
    if not settings.rag_fallback_enabled:
        return []
    import numpy as np  # lazy import
    fallback = await _explicit_fallback(collection, philosopher_id, np.asarray(query_values, dtype=np.float32), k)
    return _normalize_results(fallback, settings.rag_min_score)
