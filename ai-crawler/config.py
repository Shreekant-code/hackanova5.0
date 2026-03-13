import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from dotenv import load_dotenv


# Load env from project root so backend + crawler share one .env file.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    mongodb_uri: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    database_name: str = os.getenv("APP_DB_NAME", "Hacknova5")
    collection_name: str = "schemes"
    listing_url: str = "https://www.myscheme.gov.in/search"

    request_timeout_seconds: int = int(os.getenv("CRAWLER_TIMEOUT_SECONDS", "20"))
    request_retries: int = int(os.getenv("CRAWLER_RETRIES", "4"))
    max_text_chars: int = int(os.getenv("MAX_TEXT_CHARS", "20000"))
    max_scheme_links: int = int(os.getenv("MAX_SCHEME_LINKS", "400"))

    agno_model_id: str = os.getenv("AGNO_MODEL_ID", "gemini-2.5-flash")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    myscheme_api_key: str = os.getenv(
        "MYSCHEME_API_KEY", "tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc"
    )
    myscheme_search_api: str = os.getenv(
        "MYSCHEME_SEARCH_API", "https://api.myscheme.gov.in/search/v6/schemes"
    )

    request_user_agent: str = os.getenv(
        "CRAWLER_USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    )

    scheme_keywords: List[str] = field(
        default_factory=lambda: [
            "scheme",
            "schemes",
            "yojana",
            "benefit",
            "welfare",
            "subsidy",
            "grant",
            "assistance",
            "citizen",
            "farmer",
            "student",
            "women",
            "pension",
            "startup",
            "scholarship",
        ]
    )

    blocked_link_keywords: List[str] = field(
        default_factory=lambda: [
            "login",
            "signin",
            "register",
            "privacy",
            "terms",
            "about",
            "contact",
            "faq",
            "disclaimer",
            "accessibility",
            "contact-us",
            "about-us",
            "javascript:",
            "mailto:",
            "tel:",
        ]
    )


settings = Settings()
