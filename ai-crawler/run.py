import argparse
import os
from typing import Any, Dict, List

from agent import SchemeExtractionAgent
from config import settings
from crawler import SchemeCrawler
from database import SchemeDatabase
from extractor import TextExtractor


def _as_string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        raw_items = [part.strip() for part in value.replace("\n", ",").split(",")]
    elif value is None:
        raw_items = []
    else:
        raw_items = [str(value)]

    items: List[str] = []
    seen = set()
    for item in raw_items:
        cleaned = " ".join(str(item).split()).strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in {"null", "none", "na", "n/a"}:
            continue
        if lowered in seen:
            continue
        seen.add(lowered)
        items.append(cleaned)
    return items


def _merge_string_lists(primary: Any, fallback: Any) -> List[str]:
    merged = _as_string_list(primary) + _as_string_list(fallback)
    return _as_string_list(merged)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Government Scheme AI crawler")
    parser.add_argument(
        "--listing-url",
        default=settings.listing_url,
        help="Government schemes listing URL (example: https://www.myscheme.gov.in/search)",
    )
    parser.add_argument(
        "--model-id",
        default=settings.agno_model_id,
        help="AGNO/Gemini model id",
    )
    parser.add_argument(
        "--search-query",
        default="",
        help="Optional search query for MyScheme API (example: student, farmer, scholarship)",
    )
    parser.add_argument(
        "--search-keyword",
        default="",
        help="Optional keyword filter for MyScheme API",
    )
    return parser.parse_args()


def run_pipeline(
    listing_url: str,
    model_id: str,
    search_query: str = "",
    search_keyword: str = "",
) -> Dict[str, int]:
    if not os.getenv("GEMINI_API_KEY"):
        print("[Run] GEMINI_API_KEY is missing. Add it to .env and rerun.")
        return {
            "links_found": 0,
            "processed": 0,
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "errors": 1,
        }

    crawler = SchemeCrawler()
    extractor = TextExtractor()
    agent = SchemeExtractionAgent(model_id=model_id)
    db = SchemeDatabase()

    stats = {
        "links_found": 0,
        "processed": 0,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "errors": 0,
    }

    try:
        try:
            links = crawler.extract_scheme_links(
                listing_url,
                search_query=search_query,
                search_keyword=search_keyword,
            )
        except Exception as error:
            print(f"[Crawler] Failed to process listing page: {error}")
            stats["errors"] += 1
            return stats

        stats["links_found"] = len(links)
        print(
            f"[Run] Extracted {len(links)} scheme links from listing page "
            f"(query='{search_query}', keyword='{search_keyword}')"
        )

        for link in links:
            stats["processed"] += 1

            # Network/invalid-page errors
            try:
                webpage_text = extractor.extract_text(link)
            except Exception as error:
                print(f"[Extractor] Could not read {link}: {error}")
                stats["errors"] += 1
                continue

            try:
                seed_data = crawler.fetch_scheme_seed_data(link)
            except Exception:
                seed_data = {}

            if not webpage_text and not seed_data:
                stats["skipped"] += 1
                continue

            if not webpage_text and seed_data:
                webpage_text = (
                    f"Scheme Name: {seed_data.get('scheme_name', '')}\n"
                    f"Description: {seed_data.get('description', '')}\n"
                    f"Ministry: {seed_data.get('ministry', '')}\n"
                    f"State: {seed_data.get('state', '')}\n"
                    f"Tags: {', '.join(seed_data.get('category_tags', []))}\n"
                )

            # AI extraction errors
            try:
                scheme_json = agent.extract_scheme(
                    webpage_text,
                    link,
                    seed_data=seed_data,
                )
            except Exception as error:
                print(f"[AGNO] Extraction failed for {link}: {error}")
                stats["errors"] += 1
                continue

            if not scheme_json or not str(scheme_json.get("scheme_name", "")).strip():
                stats["skipped"] += 1
                continue

            scheme_json["scheme_name"] = scheme_json["scheme_name"].strip()
            scheme_json.setdefault("gender", "All")
            scheme_json["documents_required"] = _merge_string_lists(
                scheme_json.get("documents_required"),
                seed_data.get("documents_required"),
            )
            scheme_json["benefits"] = _merge_string_lists(
                scheme_json.get("benefits"),
                seed_data.get("benefits"),
            )

            seed_scheme_data = (
                seed_data.get("scheme_data")
                if isinstance(seed_data.get("scheme_data"), dict)
                else {}
            )
            seed_scheme_content = (
                seed_scheme_data.get("schemeContent")
                if isinstance(seed_scheme_data.get("schemeContent"), dict)
                else {}
            )

            scheme_page_link = str(
                seed_data.get("scheme_page_link")
                or seed_data.get("apply_link")
                or link
            ).strip()

            original_apply_link = crawler.resolve_original_apply_link(
                scheme_json.get("original_apply_link")
                or scheme_json.get("apply_link")
                or seed_data.get("original_apply_link")
                or "",
                scheme_json.get("application_process"),
                scheme_json.get("description"),
                scheme_json.get("documents_required"),
                scheme_json.get("benefits"),
            )
            if not original_apply_link:
                original_apply_link = crawler.resolve_original_apply_link(
                    seed_data.get("original_apply_link") or "",
                    seed_scheme_content.get("applicationProcess"),
                    seed_data.get("description"),
                    seed_data.get("documents_required"),
                    seed_data.get("benefits"),
                )

            scheme_json["scheme_page_link"] = scheme_page_link
            scheme_json["original_apply_link"] = original_apply_link
            scheme_json["apply_link"] = original_apply_link or scheme_page_link

            # Duplicate-safe storage (unique key: scheme_name)
            try:
                ok, operation = db.upsert_scheme(scheme_json)
                if not ok:
                    stats["errors"] += 1
                elif operation == "inserted":
                    stats["inserted"] += 1
                else:
                    stats["updated"] += 1
            except Exception as error:
                print(f"[MongoDB] Failed to save scheme '{scheme_json['scheme_name']}': {error}")
                stats["errors"] += 1

        return stats
    finally:
        db.close()


def print_summary(stats: Dict[str, int]) -> None:
    print("[Run] Pipeline complete")
    print(
        "[Run] Stats => "
        f"links_found={stats['links_found']}, "
        f"processed={stats['processed']}, "
        f"inserted={stats['inserted']}, "
        f"updated={stats['updated']}, "
        f"skipped={stats['skipped']}, "
        f"errors={stats['errors']}"
    )


if __name__ == "__main__":
    args = parse_args()
    run_stats = run_pipeline(
        args.listing_url,
        args.model_id,
        search_query=args.search_query,
        search_keyword=args.search_keyword,
    )
    print_summary(run_stats)
