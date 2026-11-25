"""Wrapper — prefer: python -m app.scripts.promote_admin --email you@example.com"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.scripts.promote_admin import main  # noqa: E402

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Promote a user to admin")
    parser.add_argument("--email", required=True, help="Account email to promote")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.email)))
