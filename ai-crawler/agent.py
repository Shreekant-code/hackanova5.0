import json
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from agno.agent import Agent
from agno.models.google import Gemini
from pydantic import BaseModel, Field

from config import settings


class SchemeData(BaseModel):
    scheme_name: str = ""
    description: str = ""
    category: str = ""
    benefits: List[str] = Field(default_factory=list)
    eligibility: List[str] = Field(default_factory=list)
    documents_required: List[str] = Field(default_factory=list)
    application_process: List[str] = Field(default_factory=list)
    ministry: str = ""
    apply_link: str = ""
    original_apply_link: str = ""


class SchemeLinkData(BaseModel):
    original_apply_link: str = ""


class SchemeExtractionAgent:
    """
    Convert scheme page/API content into strict structured JSON.
    """

    def __init__(self, model_id: str = settings.agno_model_id) -> None:
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is missing in environment")

        self.agent = Agent(
            model=Gemini(id=model_id, api_key=settings.gemini_api_key),
            output_schema=SchemeData,
            instructions=[
                "Extract only information explicitly present in the provided content.",
                "Do not guess or invent missing values.",
                "Return empty arrays for missing list sections.",
                "Extract documents_required only from the section titled 'Documents Required'.",
                "Extract benefits only from the section titled 'Benefits'.",
                "Extract eligibility only from the section titled 'Eligibility'.",
                "Extract application_process only from the section titled 'Application Process'.",
                "For original_apply_link, return the original official government application portal URL (not a MyScheme scheme page). If unavailable, return an empty string.",
                "For apply_link, return the scheme page/source URL.",
                "Return valid JSON only with these keys: scheme_name, description, category, benefits, eligibility, documents_required, application_process, ministry, apply_link, original_apply_link.",
                "Do not output explanations or extra keys.",
            ],
        )
        self.link_agent = Agent(
            model=Gemini(id=model_id, api_key=settings.gemini_api_key),
            output_schema=SchemeLinkData,
            instructions=[
                "You are a government scheme link resolver.",
                "Return exactly one URL in original_apply_link, or empty string if unknown.",
                "Prefer original official application website URL for the scheme.",
                "If explicit URL is missing, infer best official portal from scheme_name, ministry, and description.",
                "Never return MyScheme listing/scheme page URL.",
                "Do not return PDF/DOC links.",
                "Return JSON only with key: original_apply_link.",
            ],
        )

    def extract_scheme(
        self,
        webpage_text: str,
        scheme_url: str,
        seed_data: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        seed_data = seed_data or {}
        fallback_data: Dict[str, Any] = {}
        scheme_data = seed_data.get("scheme_data")
        if isinstance(scheme_data, dict):
            fallback_data = self.extract_from_scheme_data(
                scheme_data=scheme_data,
                default_apply_link=seed_data.get("apply_link") or "",
            )

        if not webpage_text.strip():
            if fallback_data:
                if not fallback_data.get("original_apply_link"):
                    fallback_data["original_apply_link"] = self._generate_original_link_from_name_with_gemini(
                        scheme_name=fallback_data.get("scheme_name") or seed_data.get("scheme_name") or "",
                        description=fallback_data.get("description") or seed_data.get("description") or "",
                        ministry=fallback_data.get("ministry") or seed_data.get("ministry") or "",
                        category=fallback_data.get("category") or "",
                        scheme_page_link=fallback_data.get("apply_link") or scheme_url,
                        seed_data=seed_data,
                    )
                return fallback_data
            return None

        prompt = (
            "Extract structured scheme data from this webpage text.\n"
            "Rules:\n"
            "- Only extract what is explicitly present.\n"
            "- Do not infer or guess.\n"
            "- Use section-based extraction for Benefits, Eligibility, Documents Required, Application Process.\n"
            "- If any section is missing, return [] for that field.\n"
            "- original_apply_link must be the original official government application portal URL, not MyScheme.\n"
            "- If original official portal URL is not available, return original_apply_link as empty string.\n"
            "- Return JSON only.\n\n"
            f"Source URL: {scheme_url}\n\n"
            f"Seed metadata: {json.dumps(seed_data, ensure_ascii=False)}\n\n"
            f"Deterministic fallback extraction: {json.dumps(fallback_data, ensure_ascii=False)}\n\n"
            f"{webpage_text}"
        )

        result = self.agent.run(prompt)
        payload = getattr(result, "content", result)

        if isinstance(payload, SchemeData):
            data = payload.model_dump()
        elif isinstance(payload, dict):
            data = SchemeData.model_validate(payload).model_dump()
        elif isinstance(payload, str):
            data = SchemeData.model_validate_json(payload).model_dump()
        elif hasattr(payload, "model_dump"):
            data = SchemeData.model_validate(payload.model_dump()).model_dump()
        else:
            data = SchemeData.model_validate_json(str(payload)).model_dump()

        merged = self._merge_with_fallback(data, fallback_data)

        if not merged.get("apply_link"):
            merged["apply_link"] = (
                seed_data.get("scheme_page_link")
                or seed_data.get("apply_link")
                or scheme_url
            )

        if not merged.get("original_apply_link"):
            merged["original_apply_link"] = (
                fallback_data.get("original_apply_link")
                or seed_data.get("original_apply_link")
                or ""
            )

        if self._is_myscheme_host(merged.get("original_apply_link", "")):
            merged["original_apply_link"] = (
                fallback_data.get("original_apply_link")
                or seed_data.get("original_apply_link")
                or ""
            )

        if not merged.get("original_apply_link"):
            merged["original_apply_link"] = self._generate_original_link_from_name_with_gemini(
                scheme_name=merged.get("scheme_name") or seed_data.get("scheme_name") or "",
                description=merged.get("description") or seed_data.get("description") or "",
                ministry=merged.get("ministry") or seed_data.get("ministry") or "",
                category=merged.get("category") or "",
                scheme_page_link=merged.get("apply_link") or scheme_url,
                seed_data=seed_data,
            )

        return self._normalize_output(merged)

    def extract_from_scheme_data(
        self,
        scheme_data: Dict[str, Any],
        default_apply_link: str = "",
    ) -> Dict[str, Any]:
        basic = (
            scheme_data.get("basicDetails")
            if isinstance(scheme_data.get("basicDetails"), dict)
            else {}
        )
        content = (
            scheme_data.get("schemeContent")
            if isinstance(scheme_data.get("schemeContent"), dict)
            else {}
        )

        scheme_name = self._clean_string(basic.get("schemeName"))
        description = self._clean_string(
            basic.get("description")
            or content.get("briefDescription")
            or content.get("detailedDescription")
            or ""
        )

        category = self._clean_string(
            basic.get("category")
            or self._as_label(basic.get("schemeCategory"))
            or self._as_label(basic.get("schemeSubCategory"))
            or ""
        )

        ministry = self._clean_string(
            basic.get("ministry")
            or self._as_label(basic.get("nodalMinistryName"))
            or ""
        )

        detected_link = self._clean_string(
            self._find_first_value_by_keys(
                scheme_data,
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
        apply_link = self._clean_string(default_apply_link or detected_link)
        original_apply_link = self._resolve_original_apply_link(
            detected_link,
            content.get("applicationProcess"),
            content.get("briefDescription"),
            content.get("detailedDescription"),
            content.get("benefits"),
            content.get("documentsRequired"),
        )

        result = {
            "scheme_name": scheme_name,
            "description": description,
            "category": category,
            "benefits": self._extract_content_list(content, "benefits"),
            "eligibility": self._extract_content_list(content, "eligibility"),
            "documents_required": self._extract_content_list(content, "documentsRequired"),
            "application_process": self._extract_content_list(content, "applicationProcess"),
            "ministry": ministry,
            "apply_link": apply_link,
            "original_apply_link": original_apply_link,
        }
        return self._normalize_output(result)

    @staticmethod
    def _normalize_key(key: str) -> str:
        return "".join(ch for ch in str(key).lower() if ch.isalnum())

    def _find_first_value_by_keys(self, node: Any, wanted_keys: set[str]) -> Any:
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

    def _extract_content_list(self, content: Dict[str, Any], key: str) -> List[str]:
        if key not in content:
            return []
        return self._clean_list(self._extract_text_list(content.get(key)))

    def _merge_with_fallback(
        self,
        primary: Dict[str, Any],
        fallback: Dict[str, Any],
    ) -> Dict[str, Any]:
        fallback = fallback or {}
        merged = {
            "scheme_name": primary.get("scheme_name") or fallback.get("scheme_name") or "",
            "description": primary.get("description") or fallback.get("description") or "",
            "category": primary.get("category") or fallback.get("category") or "",
            "benefits": primary.get("benefits") or fallback.get("benefits") or [],
            "eligibility": primary.get("eligibility") or fallback.get("eligibility") or [],
            "documents_required": primary.get("documents_required")
            or fallback.get("documents_required")
            or [],
            "application_process": primary.get("application_process")
            or fallback.get("application_process")
            or [],
            "ministry": primary.get("ministry") or fallback.get("ministry") or "",
            "apply_link": primary.get("apply_link") or fallback.get("apply_link") or "",
            "original_apply_link": primary.get("original_apply_link")
            or fallback.get("original_apply_link")
            or "",
        }
        return self._normalize_output(merged)

    def _extract_text_list(self, node: Any) -> List[str]:
        values: List[str] = []
        self._collect_text_values(node, values)
        return values

    def _collect_text_values(self, node: Any, sink: List[str]) -> None:
        if node is None:
            return
        if isinstance(node, str):
            cleaned = self._clean_string(node)
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
                    cleaned = self._clean_string(value)
                    if cleaned:
                        sink.append(cleaned)
            for value in node.values():
                if isinstance(value, (dict, list)):
                    self._collect_text_values(value, sink)

    @staticmethod
    def _clean_string(value: Any) -> str:
        if value is None:
            return ""
        cleaned = " ".join(str(value).split()).strip()
        if cleaned.lower() in {"null", "none", "na", "n/a"}:
            return ""
        return cleaned

    def _clean_list(self, values: List[Any]) -> List[str]:
        output: List[str] = []
        seen = set()
        for value in values:
            cleaned = self._clean_string(value)
            if not cleaned:
                continue
            lowered = cleaned.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            output.append(cleaned)
        return output

    def _resolve_original_apply_link(self, apply_link: str, *text_nodes: Any) -> str:
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

    def _generate_original_link_from_name_with_gemini(
        self,
        scheme_name: str,
        description: str,
        ministry: str,
        category: str,
        scheme_page_link: str,
        seed_data: Dict[str, Any],
    ) -> str:
        cleaned_name = self._clean_string(scheme_name)
        if not cleaned_name:
            return ""

        prompt_payload = {
            "scheme_name": cleaned_name,
            "description": self._clean_string(description),
            "ministry": self._clean_string(ministry),
            "category": self._clean_string(category),
            "scheme_page_link": self._clean_string(scheme_page_link),
            "seed_metadata": {
                "slug": self._clean_string(seed_data.get("slug")),
                "category_tags": seed_data.get("category_tags") or [],
                "state": self._clean_string(seed_data.get("state")),
            },
        }
        prompt = (
            "Find the original official website URL where a user should go for this scheme.\n"
            "Rules:\n"
            "- Use scheme name as primary signal.\n"
            "- Prefer official government/authorized portal.\n"
            "- Do not return MyScheme URL.\n"
            "- Do not return document file URL.\n"
            "- If unknown, return empty string.\n"
            "- Return JSON only: {\"original_apply_link\":\"\"}\n\n"
            f"{json.dumps(prompt_payload, ensure_ascii=False)}"
        )

        try:
            result = self.link_agent.run(prompt)
            payload = getattr(result, "content", result)
        except Exception:
            return ""

        try:
            if isinstance(payload, SchemeLinkData):
                data = payload.model_dump()
            elif isinstance(payload, dict):
                data = SchemeLinkData.model_validate(payload).model_dump()
            elif isinstance(payload, str):
                data = SchemeLinkData.model_validate_json(payload).model_dump()
            elif hasattr(payload, "model_dump"):
                data = SchemeLinkData.model_validate(payload.model_dump()).model_dump()
            else:
                data = SchemeLinkData.model_validate_json(str(payload)).model_dump()
        except Exception:
            return ""

        candidate = self._normalize_candidate_url(data.get("original_apply_link"))
        if not candidate:
            return ""
        if self._is_myscheme_host(candidate):
            return ""
        if self._is_likely_document_url(candidate):
            candidate = self._to_origin_url(candidate)
        return candidate

    def _collect_candidate_links(self, apply_link: str, *nodes: Any) -> List[str]:
        candidates: List[str] = []
        seen = set()

        def push(url: Any) -> None:
            normalized = self._normalize_candidate_url(url)
            if not normalized or normalized in seen:
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
            return " ".join(SchemeExtractionAgent._to_text(item) for item in node)
        if isinstance(node, dict):
            return " ".join(SchemeExtractionAgent._to_text(value) for value in node.values())
        return str(node)

    def _extract_urls_from_text(self, text: str) -> List[str]:
        raw_links = re.findall(r"(?:https?://|www\.)[^\s<>\"']+", str(text or ""), flags=re.I)
        links: List[str] = []
        seen = set()
        for link in raw_links:
            normalized = self._normalize_candidate_url(link)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            links.append(normalized)
        return links

    def _normalize_candidate_url(self, url: Any) -> str:
        cleaned = self._clean_string(url).rstrip("),.;")
        if not cleaned:
            return ""
        if cleaned.startswith("www."):
            cleaned = f"https://{cleaned}"
        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
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

    def _normalize_output(self, data: Dict[str, Any]) -> Dict[str, Any]:
        benefits = data.get("benefits") or []
        if not isinstance(benefits, list):
            benefits = [benefits]

        eligibility = data.get("eligibility") or []
        if not isinstance(eligibility, list):
            eligibility = [eligibility]

        documents_required = data.get("documents_required") or []
        if not isinstance(documents_required, list):
            documents_required = [documents_required]

        application_process = data.get("application_process") or []
        if not isinstance(application_process, list):
            application_process = [application_process]

        return {
            "scheme_name": self._clean_string(data.get("scheme_name")),
            "description": self._clean_string(data.get("description")),
            "category": self._clean_string(data.get("category")),
            "benefits": self._clean_list(benefits),
            "eligibility": self._clean_list(eligibility),
            "documents_required": self._clean_list(documents_required),
            "application_process": self._clean_list(application_process),
            "ministry": self._clean_string(data.get("ministry")),
            "apply_link": self._clean_string(data.get("apply_link")),
            "original_apply_link": self._clean_string(data.get("original_apply_link")),
        }
