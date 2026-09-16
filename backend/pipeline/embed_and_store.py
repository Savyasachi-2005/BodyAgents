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
from pymongo import UpdateOne
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
    client = MongoClient(settings.mongodb_uri)
    collection = client[settings.mongodb_db][settings.mongodb_vector_collection]
    existing = {doc["chunk_id"]: doc.get("content_hash") for doc in collection.find({}, {"chunk_id": 1, "content_hash": 1})}
    changed = [row for row in rows if existing.get(row["chunk_id"]) != row.get("content_hash")]
    if not changed:
        print("Knowledge is already up to date")
        client.close()
        return
    vectors = model.encode([row["text"] for row in changed], normalize_embeddings=True, batch_size=32)
    operations = []
    for row, vector in zip(changed, vectors):
        doc = {
            "body_part_id": row["body_part_id"],
            "chunk_id": row["chunk_id"],
            "text": row["text"],
            "source": row["source"],
            "section": row.get("section"),
            "content_hash": row.get("content_hash"),
            "embedding": vector.tolist(),
        }
        operations.append(UpdateOne(
            {"chunk_id": row["chunk_id"]},
            {"$set": doc},
            upsert=True,
        ))
    collection.bulk_write(operations, ordered=False)

    print(f"Upserted {len(changed)} changed chunks into {settings.mongodb_db}.{settings.mongodb_vector_collection}")
    client.close()


if __name__ == "__main__":
    main()
