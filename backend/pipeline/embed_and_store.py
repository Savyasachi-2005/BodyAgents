"""Embed chunks and upsert into MongoDB body_knowledge collection."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer

load_dotenv(REPO_ROOT / ".env")

from app.config import get_settings  # noqa: E402

CHUNKS_PATH = ROOT / "seed" / "chunks.jsonl"


def main() -> None:
    settings = get_settings()
    if not settings.mongodb_uri:
        raise SystemExit("MONGODB_URI missing in .env")
    if not CHUNKS_PATH.exists():
        raise SystemExit("Run pipeline/chunker.py first")

    rows = [json.loads(line) for line in CHUNKS_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    model = SentenceTransformer(settings.embedding_model)
    texts = [row["text"] for row in rows]
    vectors = model.encode(texts, normalize_embeddings=True)

    client = MongoClient(settings.mongodb_uri)
    collection = client[settings.mongodb_db][settings.mongodb_vector_collection]

    for row, vector in zip(rows, vectors):
        doc = {
            "body_part_id": row["body_part_id"],
            "chunk_id": row["chunk_id"],
            "text": row["text"],
            "source": row["source"],
            "embedding": vector.tolist(),
        }
        collection.update_one(
            {"chunk_id": row["chunk_id"]},
            {"$set": doc},
            upsert=True,
        )

    print(f"Upserted {len(rows)} chunks into {settings.mongodb_db}.{settings.mongodb_vector_collection}")
    client.close()


if __name__ == "__main__":
    main()
