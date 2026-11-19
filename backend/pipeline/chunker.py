"""Split verified sources + seed body-knowledge into overlapping chunks."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "seed" / "body_knowledge"
SOURCES_DIR = ROOT / "seed" / "sources"
OUT_PATH = ROOT / "seed" / "chunks.jsonl"

CHUNK_SIZE = 900


def chunk_text(
    text: str,
    body_part_id: str,
    source: str,
    *,
    source_url: str | None = None,
    source_title: str | None = None,
    publisher: str | None = None,
    license_name: str | None = None,
    trust_tier: str = "curated-summary",
    accessed_at: str | None = None,
    source_id: str | None = None,
) -> list[dict]:
    """Keep paragraphs/sentences intact where possible instead of slicing concepts."""
    cleaned = text.strip()
    sections = [part.strip() for part in re.split(r"\n\s*\n+", cleaned) if part.strip()]
    chunks: list[dict] = []
    index = 0
    prefix = source_id or body_part_id
    for section_number, section in enumerate(sections, start=1):
        sentences = re.split(r"(?<=[.!?])\s+", " ".join(section.split()))
        current: list[str] = []
        for sentence in sentences:
            if current and len(" ".join(current)) + len(sentence) + 1 > CHUNK_SIZE:
                piece = " ".join(current)
                chunks.append(
                    _chunk_row(
                        body_part_id=body_part_id,
                        chunk_id=f"{prefix}-{index}",
                        text=piece,
                        source=source,
                        section=f"section-{section_number}",
                        source_url=source_url,
                        source_title=source_title,
                        publisher=publisher,
                        license_name=license_name,
                        trust_tier=trust_tier,
                        accessed_at=accessed_at,
                    )
                )
                index += 1
                current = []
            current.append(sentence)
        if current:
            piece = " ".join(current)
            chunks.append(
                _chunk_row(
                    body_part_id=body_part_id,
                    chunk_id=f"{prefix}-{index}",
                    text=piece,
                    source=source,
                    section=f"section-{section_number}",
                    source_url=source_url,
                    source_title=source_title,
                    publisher=publisher,
                    license_name=license_name,
                    trust_tier=trust_tier,
                    accessed_at=accessed_at,
                )
            )
            index += 1
    return chunks


def _chunk_row(**kwargs: object) -> dict:
    text = str(kwargs["text"])
    return {
        "body_part_id": kwargs["body_part_id"],
        "chunk_id": kwargs["chunk_id"],
        "text": text,
        "source": kwargs["source"],
        "section": kwargs["section"],
        "source_url": kwargs.get("source_url"),
        "source_title": kwargs.get("source_title"),
        "publisher": kwargs.get("publisher"),
        "license": kwargs.get("license_name"),
        "trust_tier": kwargs.get("trust_tier") or "curated-summary",
        "accessed_at": kwargs.get("accessed_at"),
        "content_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }


def _parse_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    if not raw.startswith("---"):
        return {}, raw
    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw
    meta: dict[str, str] = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip('"').strip("'")
    return meta, parts[2].strip()


def _chunk_seed_files() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(SEED_DIR.glob("*.txt")):
        rows.extend(
            chunk_text(
                path.read_text(encoding="utf-8"),
                path.stem,
                path.name,
                source_title=f"{path.stem.title()} study notes",
                publisher="BodyAgents curated summary",
                license_name="project educational content",
                trust_tier="curated-summary",
                source_id=f"seed-{path.stem}",
            )
        )
    return rows


def _chunk_verified_sources() -> list[dict]:
    rows: list[dict] = []
    if not SOURCES_DIR.exists():
        return rows
    for path in sorted(SOURCES_DIR.glob("**/*.md")):
        meta, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
        if not body:
            continue
        body_part_id = meta.get("body_part_id") or path.parent.name
        source_id = meta.get("id") or path.stem
        rows.extend(
            chunk_text(
                body,
                body_part_id,
                str(path.relative_to(ROOT)).replace("\\", "/"),
                source_url=meta.get("url"),
                source_title=meta.get("title") or path.stem,
                publisher=meta.get("publisher"),
                license_name=meta.get("license"),
                trust_tier=meta.get("trust_tier") or "gov",
                accessed_at=meta.get("accessed_at"),
                source_id=source_id,
            )
        )
    return rows


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows = _chunk_verified_sources() + _chunk_seed_files()
    with OUT_PATH.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    verified = sum(1 for row in rows if row.get("trust_tier") != "curated-summary")
    print(f"Wrote {len(rows)} chunks ({verified} from verified sources) to {OUT_PATH}")


if __name__ == "__main__":
    main()
