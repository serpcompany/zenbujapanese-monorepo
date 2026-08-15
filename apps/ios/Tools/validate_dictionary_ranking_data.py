#!/usr/bin/env python3
"""Fail-closed validation for the bundled Dictionary Best Match v1 artifact."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from language_data_tools import file_sha256


EXPECTED_COUNTS = {
    "form_priority_profiles": 56_127,
    "canonical_senses": 253_020,
    "gloss_atoms": 441_826,
    "sense_form_restrictions": 1_929,
    "reading_form_restrictions": 6_201,
}


def validate(database_path: Path, manifest_path: Path, source_path: Path) -> dict[str, object]:
    manifest = json.loads(manifest_path.read_text())
    transform = manifest["transform"]
    failures: list[str] = []
    if file_sha256(source_path) != transform["source_sha256"]:
        failures.append("pinned JMdict source checksum")
    if file_sha256(database_path) != transform["database_sha256"]:
        failures.append("bundled database checksum")
    if database_path.stat().st_size != transform["database_bytes"]:
        failures.append("bundled database byte count")
    if transform.get("dictionary_ranking_policy") != "dictionary-best-match-v1":
        failures.append("dictionary ranking policy")
    if transform.get("dictionary_ranking_schema_version") != "zenbu.dictionary-ranking.v1":
        failures.append("dictionary ranking schema")
    if transform.get("dictionary_ranking_evidence") != EXPECTED_COUNTS:
        failures.append("manifest evidence counts")

    database = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
        actual_counts = {
            table: database.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in EXPECTED_COUNTS
        }
        if actual_counts != EXPECTED_COUNTS:
            failures.append(f"database evidence counts: {actual_counts}")
        metadata = dict(database.execute("SELECT key, value FROM metadata"))
        if json.loads(metadata.get("dictionary_ranking_policy", "null")) != "dictionary-best-match-v1":
            failures.append("database policy metadata")
        if json.loads(metadata.get("dictionary_ranking_schema_version", "null")) != "zenbu.dictionary-ranking.v1":
            failures.append("database schema metadata")
        if json.loads(metadata.get("dictionary_ranking_evidence", "null")) != EXPECTED_COUNTS:
            failures.append("database evidence metadata")
        invalid_fingerprints = database.execute(
            "SELECT count(*) FROM entries WHERE length(semantic_fingerprint) != 32"
        ).fetchone()[0]
        if invalid_fingerprints:
            failures.append(f"invalid semantic fingerprints: {invalid_fingerprints}")
        integrity = database.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            failures.append(f"SQLite integrity: {integrity}")
    finally:
        database.close()

    if failures:
        raise RuntimeError("dictionary ranking artifact invalid: " + "; ".join(failures))
    return {
        "policy": "dictionary-best-match-v1",
        "database_sha256": transform["database_sha256"],
        "database_bytes": transform["database_bytes"],
        "evidence_counts": EXPECTED_COUNTS,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("source", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(validate(arguments.database, arguments.manifest, arguments.source), sort_keys=True))


if __name__ == "__main__":
    main()
