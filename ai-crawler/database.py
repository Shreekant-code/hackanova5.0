from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError

from config import settings


class SchemeDatabase:
    """
    MongoDB writer for scheme documents.
    Ensures unique scheme_name and upsert behavior to avoid duplicates.
    """

    def __init__(self) -> None:
        self.client = MongoClient(settings.mongodb_uri)
        self.collection: Collection = self.client[settings.database_name][
            settings.collection_name
        ]
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        self.collection.create_index(
            [("scheme_name", ASCENDING)],
            unique=True,
            name="scheme_name_unique_idx",
        )

    def upsert_scheme(self, scheme: Dict[str, Any]) -> Tuple[bool, str]:
        scheme_name = (scheme.get("scheme_name") or "").strip()
        if not scheme_name:
            return False, "missing_scheme_name"

        scheme["scheme_name"] = scheme_name
        now = datetime.now(timezone.utc)

        try:
            result = self.collection.update_one(
                {"scheme_name": scheme_name},
                {
                    "$set": scheme,
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )

            if result.upserted_id:
                return True, "inserted"
            return True, "updated"
        except PyMongoError as error:
            print(f"[MongoDB] Upsert failed for '{scheme_name}': {error}")
            return False, "db_error"

    def close(self) -> None:
        self.client.close()
