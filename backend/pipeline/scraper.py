"""Fetch allowlisted educational pages into offline markdown sources.

Usage:
  python pipeline/scraper.py
  python pipeline/scraper.py --body-part heart

Only URLs listed in configs/sources.json are fetched (verified allowlist).
Saved files under seed/sources/ are then chunked offline (option B).
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "configs" / "sources.json"
OUT_DIR = ROOT / "seed" / "sources"

USER_AGENT = "BodyAgentsEducationalBot/0.1 (+major-project; educational reuse)"


def load_registry() -> list[dict]:
    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return list(data.get("sources") or [])


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _clean_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "form", "aside"]):
        tag.decompose()

    title = ""
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        title = h1.get_text(" ", strip=True)
    elif soup.title and soup.title.get_text(strip=True):
        title = soup.title.get_text(" ", strip=True)

    main = (
        soup.find("div", id="mplus-content")
        or soup.find("div", class_="main")
        or soup.find("article")
        or soup.find("main")
        or soup.find("div", id="content")
        or soup.body
    )
    if main is None:
        return title, ""

    # Drop chrome that survives inside the content wrapper.
    for tag in main.select(".share, .social, .related-links, .page-info, .breadcrumb, .seealso"):
        tag.decompose()

    blocks: list[str] = []
    for node in main.find_all(["h2", "h3", "p", "li"]):
        text = node.get_text(" ", strip=True)
        if not text or len(text) < 40:
            continue
        lower = text.lower()
        if any(skip in lower for skip in ("javascript", "cookie", "subscribe", "advertisement")):
            continue
        blocks.append(text)

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for block in blocks:
        key = block.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(block)

    return title, "\n\n".join(unique)


def _frontmatter(source: dict, page_title: str) -> str:
    title = page_title or source["title"]
    fields = {
        "id": source["id"],
        "body_part_id": source["body_part_id"],
        "url": source["url"],
        "title": title,
        "publisher": source["publisher"],
        "license": source["license"],
        "trust_tier": source["trust_tier"],
        "accessed_at": date.today().isoformat(),
    }
    lines = ["---"]
    for key, value in fields.items():
        safe = str(value).replace('"', "'")
        lines.append(f'{key}: "{safe}"')
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def fetch_source(source: dict, client: httpx.Client) -> Path | None:
    response = client.get(source["url"], follow_redirects=True)
    response.raise_for_status()
    page_title, text = _clean_text(response.text)
    if len(text) < 400:
        print(f"skip {source['id']}: extracted text too short ({len(text)} chars)")
        return None

    organ_dir = OUT_DIR / source["body_part_id"]
    organ_dir.mkdir(parents=True, exist_ok=True)
    host = _slug(urlparse(source["url"]).netloc.split(":")[0])
    path = organ_dir / f"{source['id']}-{host}.md"
    path.write_text(_frontmatter(source, page_title) + text + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch verified educational sources")
    parser.add_argument("--body-part", help="Only fetch sources for one organ id")
    args = parser.parse_args()

    sources = load_registry()
    if args.body_part:
        sources = [item for item in sources if item["body_part_id"] == args.body_part]
    if not sources:
        raise SystemExit("No sources matched")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    with httpx.Client(timeout=30.0, headers={"User-Agent": USER_AGENT}) as client:
        for source in sources:
            try:
                path = fetch_source(source, client)
                if path:
                    print(f"saved {path.relative_to(ROOT)}")
                    ok += 1
            except Exception as exc:
                print(f"failed {source['id']}: {exc}")

    print(f"Fetched {ok}/{len(sources)} verified sources into {OUT_DIR}")
    print("Next: python pipeline/chunker.py && python pipeline/embed_and_store.py")


if __name__ == "__main__":
    main()
