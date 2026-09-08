"""Optional scraper scaffold — replace SOURCE_URLS with curated educational pages."""

from __future__ import annotations

# Placeholder for future offline scraping. Seed text under seed/body_knowledge/
# is used for the first demo instead of live scraping.

SOURCE_URLS: dict[str, list[str]] = {
    "brain": [],
    "heart": [],
    "lungs": [],
    "bones": [],
    "liver": [],
    "kidneys": [],
    "eyeball": [],
    "intestine": [],
    "pancreas": [],
    "skin": [],
    "digestive": [],
}


def main() -> None:
    print("Scraper scaffold only. Add curated URLs to SOURCE_URLS and implement fetch/clean.")
    print("For now run: python pipeline/chunker.py && python pipeline/embed_and_store.py")


if __name__ == "__main__":
    main()
