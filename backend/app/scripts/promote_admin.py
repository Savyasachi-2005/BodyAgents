"""One-run bootstrap: promote an existing user to admin.

Usage (from backend/ with PYTHONPATH or as module):
  python -m app.scripts.promote_admin --email you@example.com
"""

from __future__ import annotations

import argparse
import asyncio


async def main(email: str) -> int:
    from app.auth import USERS, initials_from_name
    from app.memory.db import close_client, get_db

    email_norm = email.strip().lower()
    users = get_db()[USERS]
    user = await users.find_one({"email": email_norm})
    if not user:
        print(f"No user found with email: {email_norm}")
        await close_client()
        return 1

    await users.update_one(
        {"_id": user["_id"]},
        {"$set": {"role": "admin", "active": True}},
    )
    print(
        f"Promoted {user.get('name')} <{email_norm}> "
        f"({initials_from_name(user.get('name', ''))}) to admin."
    )
    await close_client()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promote a user to admin")
    parser.add_argument("--email", required=True, help="Account email to promote")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.email)))
