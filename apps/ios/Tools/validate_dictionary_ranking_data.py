#!/usr/bin/env python3
"""Fail-closed validation for the bundled Dictionary Best Match v1 artifact."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from dictionary_ranking_adapter import dictionary_ranking_mapping_sha256
from dictionary_ranking_contract import runtime_contract
from language_data_tools import file_sha256


EXPECTED_COUNTS = {
    "form_priority_profiles": 56_127,
    "canonical_senses": 253_020,
    "gloss_atoms": 441_826,
    "sense_form_restrictions": 1_929,
    "reading_form_restrictions": 6_201,
}

TOOL_FILES = {
    "import_tool_sha256": "import_jmdict.py",
    "dictionary_ranking_adapter_sha256": "dictionary_ranking_adapter.py",
    "dictionary_ranking_contract_sha256": "dictionary_ranking_contract.py",
    "shared_tooling_sha256": "language_data_tools.py",
    "unidic_adapter_sha256": "unidic_adapter.py",
    "tatoeba_adapter_sha256": "tatoeba_adapter.py",
}


def validate(
    database_path: Path,
    manifest_path: Path,
    source_path: Path,
    contract_path: Path | None = None,
) -> dict[str, object]:
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
    for key, filename in TOOL_FILES.items():
        if transform.get(key) != file_sha256(Path(__file__).with_name(filename)):
            failures.append(f"{key} current file checksum")
    if contract_path is not None:
        if json.loads(contract_path.read_text()) != runtime_contract(transform):
            failures.append("bundled runtime contract")

    database = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
        actual_counts = {
            table: database.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in EXPECTED_COUNTS
        }
        if actual_counts != EXPECTED_COUNTS:
            failures.append(f"database evidence counts: {actual_counts}")
        actual_mapping = dictionary_ranking_mapping_sha256(database)
        expected_mapping = transform.get("dictionary_ranking_mapping_sha256")
        if actual_mapping != expected_mapping:
            failures.append("dictionary ranking mapping checksum")
        semantic_group_sizes = [
            row[0]
            for row in database.execute(
                "SELECT count(*) FROM entries GROUP BY semantic_fingerprint HAVING count(*) > 1"
            )
        ]
        actual_semantic_equivalence = {
            "normalization": "opaque-app-id-lexicographic-min-v1",
            "duplicate_groups": len(semantic_group_sizes),
            "source_rows": sum(semantic_group_sizes),
        }
        if transform.get("semantic_equivalence") != actual_semantic_equivalence:
            failures.append("semantic equivalence normalization")
        metadata = dict(database.execute("SELECT key, value FROM metadata"))
        if json.loads(metadata.get("dictionary_ranking_policy", "null")) != "dictionary-best-match-v1":
            failures.append("database policy metadata")
        if json.loads(metadata.get("dictionary_ranking_schema_version", "null")) != "zenbu.dictionary-ranking.v1":
            failures.append("database schema metadata")
        if json.loads(metadata.get("dictionary_ranking_evidence", "null")) != EXPECTED_COUNTS:
            failures.append("database evidence metadata")
        if json.loads(metadata.get("dictionary_ranking_mapping_sha256", "null")) != expected_mapping:
            failures.append("dictionary ranking mapping database metadata")
        for key in TOOL_FILES:
            if json.loads(metadata.get(key, "null")) != transform.get(key):
                failures.append(f"{key} database metadata")
        invalid_fingerprints = database.execute(
            "SELECT count(*) FROM entries WHERE length(semantic_fingerprint) != 32"
        ).fetchone()[0]
        if invalid_fingerprints:
            failures.append(f"invalid semantic fingerprints: {invalid_fingerprints}")
        fingerprint_index_columns = [
            row[2]
            for row in database.execute("PRAGMA index_info(entries_semantic_fingerprint_index)")
        ]
        if fingerprint_index_columns != ["semantic_fingerprint", "id"]:
            failures.append("semantic fingerprint lookup index")
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
        "mapping_sha256": transform["dictionary_ranking_mapping_sha256"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("source", type=Path)
    parser.add_argument("--contract", type=Path)
    arguments = parser.parse_args()
    print(
        json.dumps(
            validate(arguments.database, arguments.manifest, arguments.source, arguments.contract),
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
