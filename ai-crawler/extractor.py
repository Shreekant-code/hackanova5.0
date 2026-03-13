import requests
from bs4 import BeautifulSoup

from config import settings


class TextExtractor:
    """
    Step 4:
    Visit each scheme page and extract readable text.
    """

    def __init__(
        self,
        timeout_seconds: int = settings.request_timeout_seconds,
        max_chars: int = settings.max_text_chars,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_chars = max_chars
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": settings.request_user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )

    def extract_text(self, url: str) -> str:
        response = self.session.get(url, timeout=self.timeout_seconds)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        text = " ".join(soup.stripped_strings)
        return text[: self.max_chars]
