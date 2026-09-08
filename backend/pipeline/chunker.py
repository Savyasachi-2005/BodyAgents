"""Split seed body-knowledge text into overlapping chunks."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "seed" / "body_knowledge"
OUT_PATH = ROOT / "seed" / "chunks.jsonl"

CHUNK_SIZE = 420
OVERLAP = 80


def chunk_text(text: str, body_part_id: str, source: str) -> list[dict]:
    cleaned = " ".join(text.split())
    chunks: list[dict] = []
    start = 0
    index = 0
    while start < len(cleaned):
        end = min(start + CHUNK_SIZE, len(cleaned))
        piece = cleaned[start:end].strip()
        if piece:
            chunks.append(
                {
                    "body_part_id": body_part_id,
                    "chunk_id": f"{body_part_id}-{index}",
                    "text": piece,
                    "source": source,
                }
            )
            index += 1
        if end >= len(cleaned):
            break
        start = max(0, end - OVERLAP)
    return chunks


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for path in sorted(SEED_DIR.glob("*.txt")):
        rows.extend(chunk_text(path.read_text(encoding="utf-8"), path.stem, path.name))
    with OUT_PATH.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} chunks to {OUT_PATH}")


if __name__ == "__main__":
    main()
