"""Split seed body-knowledge text into overlapping chunks."""

from __future__ import annotations

import json
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "seed" / "body_knowledge"
OUT_PATH = ROOT / "seed" / "chunks.jsonl"

CHUNK_SIZE = 900


def chunk_text(text: str, body_part_id: str, source: str) -> list[dict]:
    """Keep paragraphs/sentences intact where possible instead of slicing concepts."""
    cleaned = text.strip()
    sections = [part.strip() for part in re.split(r"\n\s*\n+", cleaned) if part.strip()]
    chunks: list[dict] = []
    index = 0
    for section_number, section in enumerate(sections, start=1):
        sentences = re.split(r"(?<=[.!?])\s+", " ".join(section.split()))
        current: list[str] = []
        for sentence in sentences:
            if current and len(" ".join(current)) + len(sentence) + 1 > CHUNK_SIZE:
                piece = " ".join(current)
                chunks.append(
                    {"body_part_id": body_part_id, "chunk_id": f"{body_part_id}-{index}", "text": piece,
                     "source": source, "section": f"section-{section_number}",
                     "content_hash": hashlib.sha256(piece.encode("utf-8")).hexdigest()}
                )
                index += 1
                current = []
            current.append(sentence)
        if current:
            piece = " ".join(current)
            chunks.append(
                {
                    "body_part_id": body_part_id,
                    "chunk_id": f"{body_part_id}-{index}",
                    "text": piece,
                    "source": source,
                    "section": f"section-{section_number}",
                    "content_hash": hashlib.sha256(piece.encode("utf-8")).hexdigest(),
                }
            )
            index += 1
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
