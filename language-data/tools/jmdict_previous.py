from __future__ import annotations

import hashlib
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from language_data_tools import file_sha256

COMPARED_COLUMNS = (
    "headword",
    "reading",
    "summary",
    "meanings_json",
    "parts_of_speech_json",
    "written_forms_json",
    "reading_forms_json",
    "senses_json",
    "cross_references_json",
    "relationships_json",
    "pitch_accent_json",
    "gloss_search",
    "is_common",
    "rank_score",
    "semantic_fingerprint",
)


def source_record_ids_sha256(ids: list[int]) -> str:
    digest = hashlib.sha256()
    for source_record_id in sorted(ids):
        digest.update(f"{source_record_id}\n".encode())
    return digest.hexdigest()


@dataclass(frozen=True)
class PreviousDatabase:
    path: Path | None = None
    sha256: str | None = None
    note_identities: dict[bytes, str] = field(default_factory=dict)

    @classmethod
    def read(cls, path: Path | None) -> PreviousDatabase:
        if path is None:
            return cls()
        database = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            identities = dict(database.execute("SELECT id, note_identity FROM entries"))
        finally:
            database.close()
        return cls(path, file_sha256(path), identities)

    def row_delta(self, database: sqlite3.Connection, retained_ids_sha256: str) -> dict[str, object]:
        if self.path is None:
            (retained,) = database.execute("SELECT count(*) FROM entries").fetchone()
            return {
                "added": retained,
                "changed": 0,
                "deleted": 0,
                "added_source_record_ids_sha256": retained_ids_sha256,
            }
        database.commit()
        database.execute("ATTACH DATABASE ? AS previous", (str(self.path),))
        try:
            added = [
                row[0]
                for row in database.execute(
                    "SELECT e.source_record_id FROM main.entries e "
                    "LEFT JOIN previous.entries p USING (id) WHERE p.id IS NULL"
                )
            ]
            deleted = [
                row[0]
                for row in database.execute(
                    "SELECT p.source_record_id FROM previous.entries p "
                    "LEFT JOIN main.entries e USING (id) WHERE e.id IS NULL ORDER BY p.source_record_id"
                )
            ]
            differs = " OR ".join(f"e.{column} IS NOT p.{column}" for column in COMPARED_COLUMNS)
            (changed,) = database.execute(
                f"SELECT count(*) FROM main.entries e JOIN previous.entries p USING (id) WHERE {differs}"
            ).fetchone()
        finally:
            database.execute("DETACH DATABASE previous")
        return {
            "added": len(added),
            "changed": changed,
            "deleted": len(deleted),
            "added_source_record_ids_sha256": source_record_ids_sha256(added),
            "deleted_source_record_ids": deleted,
        }
