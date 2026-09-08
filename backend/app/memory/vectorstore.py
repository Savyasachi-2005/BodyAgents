from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import get_settings
from app.memory.db import get_db


@lru_cache
def get_embedder() -> SentenceTransformer:
    settings = get_settings()
    return SentenceTransformer(settings.embedding_model)


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_embedder()
    vectors = model.encode(texts, normalize_embeddings=True)
    return [vector.tolist() for vector in vectors]


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


async def retrieve_passages(philosopher_id: str, query: str, top_k: int | None = None) -> list[dict[str, Any]]:
    settings = get_settings()
    k = top_k or settings.rag_top_k
    collection = get_db()[settings.mongodb_vector_collection]

    query_vec = np.array(embed_texts([query])[0], dtype=np.float32)
    cursor = collection.find({"body_part_id": philosopher_id}, {"text": 1, "embedding": 1, "source": 1})
    scored: list[tuple[float, dict[str, Any]]] = []
    async for doc in cursor:
        embedding = doc.get("embedding")
        if not embedding:
            continue
        score = cosine_similarity(query_vec, np.array(embedding, dtype=np.float32))
        scored.append((score, doc))

    scored.sort(key=lambda item: item[0], reverse=True)
    results = []
    for score, doc in scored[:k]:
        results.append(
            {
                "text": doc.get("text", ""),
                "source": doc.get("source", "seed"),
                "score": score,
            }
        )
    return results
