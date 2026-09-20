from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import _hash_password, initials_from_name, verify_password


def test_password_hash_verifies_only_correct_password() -> None:
    salt, password_hash = _hash_password("a-long-enough-password")
    assert verify_password("a-long-enough-password", salt, password_hash)
    assert not verify_password("incorrect-password", salt, password_hash)


def test_initials_are_stable() -> None:
    assert initials_from_name("Ada Lovelace") == "AL"
    assert initials_from_name("Ada") == "AD"
