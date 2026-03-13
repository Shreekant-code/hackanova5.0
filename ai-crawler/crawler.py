from typing import Any, Dict, List, Set
from urllib.parse import urldefrag, urljoin, urlparse
import time
import re

import requests
from bs4 import BeautifulSoup

from config import settings


class SchemeCrawler:
    """
    Step 1-3:
    - Visit a scheme listing page
    - Extract scheme links
    - Convert relative URLs to absolute and deduplicate
    """

    def __init__(self, timeout_seconds: int = settings.request_timeout_seconds) -> None:
        self.timeout_seconds = timeout_seconds
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": settings.request_user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )

    def extract_scheme_links(
        self,
        listing_url: str,
        search_query: str = "",
        search_keyword: str = "",
    ) -> List[str]:
        listing_url = self._normalize_listing_url(listing_url)
        try:
            response = self.session.get(listing_url, timeout=self.timeout_seconds)
            response.raise_for_status()
        except requests.RequestException:
            # MyScheme /schemes listing can return non-200 depending on rollout.
            # Fallback directly to public search API extraction.
            return sorted(
                self._extract_links_from_api(
                    listing_url,
                    search_query=search_query,
                    search_keyword=search_keyword,
                )
            )

        soup = BeautifulSoup(response.text, "html.parser")
        base_domain = urlparse(listing_url).netloc.lower()
        links = self._extract_links_from_html(soup, listing_url, base_domain)

        # MyScheme listing pages are largely JS-driven. Fallback to public search API.
        if not links:
            links = self._extract_links_from_api(
                listing_url,
                search_query=search_query,
                search_keyword=search_keyword,
            )

        return sorted(links)

    def _extract_links_from_html(
        self, soup: BeautifulSoup, listing_url: str, base_domain: str
    ) -> Set[str]:
        links: Set[str] = set()
        for anchor in soup.find_all("a", href=True):
            absolute_url = self._to_absolute_url(listing_url, anchor["href"])
            if not absolute_url:
                continue

            parsed = urlparse(absolute_url)
            if parsed.netloc.lower() != base_domain:
                continue
            if self._is_blocked_link(absolute_url):
                continue

            searchable = f"{parsed.path} {parsed.query} {anchor.get_text(' ', strip=True)}".lower()
            if any(keyword in searchable for keyword in settings.scheme_keywords):
                links.add(absolute_url)
            if len(links) >= settings.max_scheme_links:
                break
        return links

    def _extract_links_from_api(
        self,
        listing_url: str,
        search_query: str = "",
        search_keyword: str = "",
    ) -> Set[str]:
        links: Set[str] = set()
        headers = self._api_headers()

        from_index = 0
        page_size = min(50, settings.max_scheme_links)

        while len(links) < settings.max_scheme_links:
            params: Dict[str, str | int] = {
                "lang": "en",
                "q": (search_query or "").strip(),
                "keyword": (search_keyword or "").strip(),
                "sort": "",
                "from": from_index,
                "size": page_size,
            }
            response = self._request_with_retry(
                url=settings.myscheme_search_api,
                headers=headers,
                params=params,
            )
            if response is None:
                break
            payload = response.json() or {}

            data = payload.get("data") or {}
            items = ((data.get("hits") or {}).get("items")) or []
            if not items:
                break

            for item in items:
                fields = item.get("fields") or {}
                slug = (fields.get("slug") or "").strip()
                if not slug:
                    continue
                links.add(f"https://www.myscheme.gov.in/schemes/{slug}")
                if len(links) >= settings.max_scheme_links:
                    break

            if len(items) < page_size:
                break
            from_index += page_size

        return links

    def _request_with_retry(
        self,
        url: str,
        headers: Dict[str, str],
        params: Dict[str, str | int] | None = None,
        json_body: Any | None = None,
        method: str = "GET",
    ) -> requests.Response | None:
        attempts = max(1, settings.request_retries + 1)
        for attempt in range(attempts):
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json_body,
                    headers=headers,
                    timeout=self.timeout_seconds,
                )
                if response.status_code == 429 and attempt < attempts - 1:
                    retry_after_header = response.headers.get("Retry-After")
                    retry_after_seconds = 0.0
                    if retry_after_header:
                        try:
                            retry_after_seconds = float(retry_after_header)
                        except ValueError:
                            retry_after_seconds = 0.0
                    backoff_seconds = retry_after_seconds or min(30.0, 2.0 * (attempt + 1))
                    time.sleep(backoff_seconds)
                    continue
                response.raise_for_status()
                return response
            except requests.RequestException:
                if attempt < attempts - 1:
                    time.sleep(1.0 * (attempt + 1))
                    continue
                return None
        return None

    def fetch_scheme_seed_data(self, scheme_url: str) -> Dict[str, object]:
        slug = self._extract_slug_from_url(scheme_url)
        if not slug:
            return {}

        headers = self._api_headers()
        detail_url = "https://api.myscheme.gov.in/schemes/v6/public/schemes"
        detail_response = self._request_with_retry(
            url=detail_url,
            headers=headers,
            json_body=[slug],
            method="POST",
        )

        # Fallback for alternate deployment response shape.
        if detail_response is None:
            detail_response = self._request_with_retry(
                url=detail_url,
                headers=headers,
                params={"slug": slug, "lang": "en"},
            )

        if detail_response is None:
            return {}

        detail_payload = detail_response.json() or {}
        detail_record = self._pick_detail_record(detail_payload)
        if not detail_record:
            return {}

        locale_record = self._pick_locale_record(detail_record)
        basic = locale_record.get("basicDetails") or {}
        content = locale_record.get("schemeContent") or {}
        scheme_content = content.copy() if isinstance(content, dict) else {}

        ministry = self._as_label(basic.get("nodalMinistryName"))
        state = self._as_label(basic.get("state")) or "All"
        category_tags = self._extract_rich_text_items(basic.get("tags") or [])
        benefits = self._extract_rich_text_items(content.get("benefits") or [])
        documents_required = self._extract_rich_text_items(
            content.get("documentsRequired") or []
        )
        direct_apply_link = self._clean_string(
            self._find_first_value_by_keys(
                detail_record,
                {
                    "applylink",
                    "applicationlink",
                    "applicationurl",
                    "applyurl",
                    "registrationurl",
                    "officialwebsite",
                    "officialurl",
                },
            )
        )

        # Fallback to dedicated documents endpoint when schemeContent lacks documentsRequired.
        if not documents_required:
            scheme_id = str(detail_record.get("_id") or "").strip()
            if not scheme_id:
                id_lookup_response = self._request_with_retry(
                    url=detail_url,
                    headers=headers,
                    params={"slug": slug, "lang": "en"},
                )
                if id_lookup_response is not None:
                    id_payload = id_lookup_response.json() or {}
                    id_record = self._pick_detail_record(id_payload)
                    scheme_id = str(id_record.get("_id") or "").strip()

            if scheme_id:
                docs_url = (
                    f"https://api.myscheme.gov.in/schemes/v6/public/schemes/"
                    f"{scheme_id}/documents"
                )
                docs_response = self._request_with_retry(
                    url=docs_url,
                    headers=headers,
                    params={"lang": "en"},
                )
                if docs_response is not None:
                    docs_payload = docs_response.json() or {}
                    docs_data = docs_payload.get("data")
                    docs_en = docs_data.get("en") if isinstance(docs_data, dict) else {}
                    docs_list_node = (
                        docs_en.get("documents_required")
                        if isinstance(docs_en, dict)
                        else []
                    )
                    documents_required = self._extract_rich_text_items(docs_list_node)
                    if documents_required:
                        scheme_content["documentsRequired"] = documents_required

        original_apply_link = self.resolve_original_apply_link(
            direct_apply_link,
            scheme_content.get("applicationProcess"),
            scheme_content.get("briefDescription"),
            scheme_content.get("detailedDescription"),
            benefits,
            documents_required,
        )

        return {
            "slug": slug,
            "scheme_name": basic.get("schemeName") or "",
            "category_tags": category_tags,
            "state": state,
            "ministry": ministry,
            "description": content.get("briefDescription") or "",
            "benefits": benefits,
            "documents_required": documents_required,
            "apply_link": scheme_url,
            "scheme_page_link": scheme_url,
            "original_apply_link": original_apply_link,
            "scheme_data": {
                "basicDetails": basic,
                "schemeContent": scheme_content,
            },
        }

    def resolve_original_apply_link(self, apply_link: str, *text_nodes: Any) -> str:
        candidates = self._collect_candidate_links(apply_link, *text_nodes)

        for url in candidates:
            if not self._is_official_gov_url(url):
                continue
            if self._is_myscheme_host(url):
                continue
            if self._is_likely_document_url(url):
                continue
            return url

        for url in candidates:
            if not self._is_official_gov_url(url):
                continue
            if self._is_myscheme_host(url):
                continue
            if not self._is_likely_document_url(url):
                continue
            origin = self._to_origin_url(url)
            if origin:
                return origin

        for url in candidates:
            if self._is_myscheme_host(url):
                continue
            if self._is_likely_document_url(url):
                continue
            return url

        return ""

    @staticmethod
    def _api_headers() -> Dict[str, str]:
        return {
            "accept": "application/json, text/plain, */*",
            "origin": "https://www.myscheme.gov.in",
            "referer": "https://www.myscheme.gov.in/search",
            "x-api-key": settings.myscheme_api_key,
        }

    @staticmethod
    def _pick_detail_record(payload: Dict[str, Any]) -> Dict[str, Any]:
        data = payload.get("data")
        if isinstance(data, dict):
            return data
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first
        return {}

    @staticmethod
    def _pick_locale_record(record: Dict[str, Any]) -> Dict[str, Any]:
        if isinstance(record.get("en"), dict):
            return record["en"]
        if "basicDetails" in record:
            return record
        for value in record.values():
            if isinstance(value, dict) and "basicDetails" in value:
                return value
        return {}

    @staticmethod
    def _as_label(value: Any) -> str:
        if isinstance(value, dict):
            for key in ("label", "name", "value"):
                candidate = value.get(key)
                if candidate:
                    return str(candidate).strip()
            return ""
        if value is None:
            return ""
        return str(value).strip()

    @staticmethod
    def _normalize_key(key: str) -> str:
        return "".join(ch for ch in str(key).lower() if ch.isalnum())

    def _find_first_value_by_keys(self, node: Any, wanted_keys: Set[str]) -> Any:
        if isinstance(node, dict):
            for key, value in node.items():
                if self._normalize_key(key) in wanted_keys:
                    return value
                found = self._find_first_value_by_keys(value, wanted_keys)
                if found not in (None, "", [], {}):
                    return found
        elif isinstance(node, list):
            for item in node:
                found = self._find_first_value_by_keys(item, wanted_keys)
                if found not in (None, "", [], {}):
                    return found
        return None

    def _collect_candidate_links(self, apply_link: str, *nodes: Any) -> List[str]:
        candidates: List[str] = []
        seen: Set[str] = set()

        def push(url: Any) -> None:
            normalized = self._normalize_candidate_url(url)
            if not normalized:
                return
            if normalized in seen:
                return
            seen.add(normalized)
            candidates.append(normalized)

        push(apply_link)
        for node in nodes:
            for url in self._extract_urls_from_text(self._to_text(node)):
                push(url)
        return candidates

    @staticmethod
    def _to_text(node: Any) -> str:
        if node is None:
            return ""
        if isinstance(node, str):
            return node
        if isinstance(node, list):
            return " ".join(SchemeCrawler._to_text(item) for item in node)
        if isinstance(node, dict):
            return " ".join(SchemeCrawler._to_text(value) for value in node.values())
        return str(node)

    def _extract_urls_from_text(self, text: str) -> List[str]:
        raw_links = re.findall(r"(?:https?://|www\.)[^\s<>\"']+", str(text or ""), flags=re.I)
        links: List[str] = []
        seen: Set[str] = set()
        for link in raw_links:
            normalized = self._normalize_candidate_url(link)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            links.append(normalized)
        return links

    def _normalize_candidate_url(self, url: Any) -> str:
        cleaned = self._clean_url(url)
        if not cleaned:
            return ""
        if cleaned.startswith("www."):
            cleaned = f"https://{cleaned}"

        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"}:
            return ""
        if not parsed.netloc:
            return ""
        return cleaned

    @staticmethod
    def _clean_url(url: Any) -> str:
        cleaned = str(url or "").strip()
        cleaned = re.sub(r"[),.;]+$", "", cleaned)
        return cleaned

    @staticmethod
    def _clean_string(value: Any) -> str:
        if value is None:
            return ""
        cleaned = " ".join(str(value).split()).strip()
        if cleaned.lower() in {"null", "none", "na", "n/a"}:
            return ""
        return cleaned

    @staticmethod
    def _is_official_gov_url(url: str) -> bool:
        try:
            host = (urlparse(url).hostname or "").lower()
            if not host:
                return False
            return bool(
                re.search(r"\.gov(\.|$)", host)
                or host.endswith("gov.in")
                or host.endswith("nic.in")
                or host.endswith("ac.in")
            )
        except Exception:
            return False

    @staticmethod
    def _is_myscheme_host(url: str) -> bool:
        try:
            host = (urlparse(url).hostname or "").lower()
            return host.endswith("myscheme.gov.in")
        except Exception:
            return False

    @staticmethod
    def _is_likely_document_url(url: str) -> bool:
        try:
            path = (urlparse(url).path or "").lower()
            return path.endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx"))
        except Exception:
            return False

    @staticmethod
    def _to_origin_url(url: str) -> str:
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return ""
            return f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return ""

    def _extract_rich_text_items(self, node: Any) -> List[str]:
        values: List[str] = []
        self._collect_text_values(node, values)
        return self._dedupe_clean_strings(values)

    def _collect_text_values(self, node: Any, sink: List[str]) -> None:
        if node is None:
            return
        if isinstance(node, str):
            cleaned = " ".join(node.split())
            if cleaned:
                sink.append(cleaned)
            return
        if isinstance(node, list):
            for item in node:
                self._collect_text_values(item, sink)
            return
        if isinstance(node, dict):
            for key in ("text", "label", "title", "name", "value"):
                value = node.get(key)
                if isinstance(value, str):
                    cleaned = " ".join(value.split())
                    if cleaned:
                        sink.append(cleaned)
            for value in node.values():
                if isinstance(value, (dict, list)):
                    self._collect_text_values(value, sink)

    @staticmethod
    def _dedupe_clean_strings(values: List[str]) -> List[str]:
        cleaned_values: List[str] = []
        seen: Set[str] = set()
        for value in values:
            cleaned = " ".join(str(value).split()).strip()
            if not cleaned:
                continue
            lowered = cleaned.lower()
            if lowered in {"null", "none", "na", "n/a"}:
                continue
            if lowered in seen:
                continue
            seen.add(lowered)
            cleaned_values.append(cleaned)
        return cleaned_values

    @staticmethod
    def _normalize_listing_url(url: str) -> str:
        cleaned = url.strip()
        if not cleaned.startswith(("http://", "https://")):
            cleaned = f"https://{cleaned}"
        return cleaned

    @staticmethod
    def _to_absolute_url(base_url: str, href: str) -> str:
        absolute = urljoin(base_url, href.strip())
        absolute, _ = urldefrag(absolute)
        if absolute.startswith(("http://", "https://")):
            return absolute
        return ""

    @staticmethod
    def _is_blocked_link(url: str) -> bool:
        link = url.lower()
        return any(token in link for token in settings.blocked_link_keywords)

    @staticmethod
    def _extract_slug_from_url(url: str) -> str:
        path = urlparse(url).path.strip("/")
        if not path:
            return ""
        parts = path.split("/")
        if len(parts) >= 2 and parts[0] == "schemes":
            return parts[1]
        return parts[-1]
