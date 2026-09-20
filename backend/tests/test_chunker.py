from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.chunker import chunk_text


def test_chunker_preserves_metadata_and_sentence_boundaries() -> None:
    text = "One sentence. Two sentence.\n\nA separate section has context."
    chunks = chunk_text(text, "heart", "heart.txt")
    assert chunks
    assert {chunk["body_part_id"] for chunk in chunks} == {"heart"}
    assert all(chunk["content_hash"] for chunk in chunks)
    assert all(chunk["section"].startswith("section-") for chunk in chunks)


def test_chunker_does_not_split_short_paragraphs() -> None:
    chunks = chunk_text("The heart pumps blood.", "heart", "heart.txt")
    assert chunks[0]["text"] == "The heart pumps blood."
