from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

PERSONAS_DIR = Path(__file__).resolve().parents[1] / "configs" / "personas"


@lru_cache
def load_personas() -> dict[str, dict[str, Any]]:
    personas: dict[str, dict[str, Any]] = {}
    for path in PERSONAS_DIR.glob("*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        personas[data["id"]] = data
    return personas


def get_persona(philosopher_id: str) -> dict[str, Any] | None:
    return load_personas().get(philosopher_id)


def known_persona_ids() -> set[str]:
    return set(load_personas().keys())
