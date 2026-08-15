#!/usr/bin/env python3
"""Release validation for the shipped Tatoeba Example Sentence Corpus."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from tatoeba_adapter import CC0_LICENSE, CC_BY_LICENSE, NAMED_CONTRIBUTOR, UNASSIGNED_CONTRIBUTOR


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_SOURCE_ROLES = {
    "japanese_sentences",
    "english_sentences",
    "japanese_english_links",
    "japanese_detailed_sentences",
    "english_detailed_sentences",
    "japanese_cc0_sentences",
    "english_cc0_sentences",
}
SOURCE_FILENAMES = {
    "japanese_sentences": "jpn_sentences-2026-08-08.tsv.bz2",
    "english_sentences": "eng_sentences-2026-08-08.tsv.bz2",
    "japanese_english_links": "jpn-eng_links-2026-08-08.tsv.bz2",
    "japanese_detailed_sentences": "jpn_sentences_detailed-2026-08-08.tsv.bz2",
    "english_detailed_sentences": "eng_sentences_detailed-2026-08-08.tsv.bz2",
    "japanese_cc0_sentences": "jpn_sentences_CC0-2026-08-08.tsv.bz2",
    "english_cc0_sentences": "eng_sentences_CC0-2026-08-08.tsv.bz2",
}
REQUIRED_PROVENANCE_COLUMNS = {
    "pair_id",
    "source_identity",
    "source_japanese_record_id",
    "source_english_record_id",
    "japanese_contributor",
    "english_contributor",
    "japanese_contributor_status",
    "english_contributor_status",
    "japanese_license",
    "english_license",
    "pair_license",
    "source_snapshot_date",
    "source_snapshot_sha256",
}


@dataclass(frozen=True)
class VerificationInputs:
    database: Path
    source_manifest: Path
    import_manifest: Path
    importer: Path
    adapter: Path
    reference_sample: Path
    source_directory: Path


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ordered_sha256(values: list[str]) -> str:
    digest = hashlib.sha256()
    for value in values:
        digest.update(f"{value}\n".encode())
    return digest.hexdigest()


def _scalar(database: sqlite3.Connection, sql: str, parameters: tuple[object, ...] = ()) -> object:
    row = database.execute(sql, parameters).fetchone()
    if row is None:
        raise ValueError(f"validation query returned no row: {sql}")
    return row[0]


def _metadata(database: sqlite3.Connection, key: str) -> object:
    return json.loads(str(_scalar(database, "SELECT value FROM metadata WHERE key = ?", (key,))))


def validate_release_posture(source_manifest: dict[str, object]) -> dict[str, object]:
    posture = source_manifest.get("release_posture")
    if not isinstance(posture, dict):
        raise ValueError("release blocked: Tatoeba owner-approved release posture is missing")
    expected = {
        "status": "owner-accepted-known-attribution-risk",
        "scope": "version-1.0-full-example-corpus",
        "decision_issue": 140,
    }
    for key, value in expected.items():
        if posture.get(key) != value:
            raise ValueError(f"release blocked: Tatoeba release posture {key} differs")
    decision_url = str(posture.get("decision_comment_url", ""))
    if not re.fullmatch(
        r"https://github\.com/serpcompany/zenbujapanese-monorepo/issues/140#issuecomment-[0-9]+",
        decision_url,
    ):
        raise ValueError("release blocked: Tatoeba release posture lacks its exact decision comment")
    if not str(posture.get("statement", "")).strip():
        raise ValueError("release blocked: Tatoeba release posture lacks its disclosure statement")
    return posture


def _validate_artifact_identity(
    inputs: VerificationInputs,
    database: sqlite3.Connection,
) -> tuple[dict[str, object], dict[str, object]]:
    source_manifest = json.loads(inputs.source_manifest.read_text())
    transform = json.loads(inputs.import_manifest.read_text())["transform"]
    sources = source_manifest["sources"]
    roles = {str(source["role"]) for source in sources}
    if roles != REQUIRED_SOURCE_ROLES or len(sources) != len(REQUIRED_SOURCE_ROLES):
        raise ValueError(f"pinned Tatoeba source roles differ: {sorted(roles)}")
    source_hashes = [str(source["sha256"]) for source in sources]
    if any(not SHA256_RE.fullmatch(value) for value in source_hashes):
        raise ValueError("a pinned Tatoeba input lacks a valid SHA-256")
    for source in sources:
        role = str(source["role"])
        if _file_sha256(inputs.source_directory / SOURCE_FILENAMES[role]) != source["sha256"]:
            raise ValueError(f"pinned Tatoeba input file hash differs for {role}")
    aggregate = _ordered_sha256(source_hashes)
    if aggregate != source_manifest["aggregate_sha256"]:
        raise ValueError("pinned Tatoeba input hashes do not produce the declared aggregate")

    importer_sha256 = _file_sha256(inputs.importer)
    adapter_sha256 = _file_sha256(inputs.adapter)
    expected = {
        "example_source_inputs": sources,
        "example_source_sha256": aggregate,
        "example_release_posture": source_manifest["release_posture"],
        "import_tool_sha256": importer_sha256,
        "tatoeba_adapter_sha256": adapter_sha256,
        "example_transform_sha256": _ordered_sha256([importer_sha256, adapter_sha256]),
    }
    for key, value in expected.items():
        if transform.get(key) != value:
            raise ValueError(f"generated manifest {key} differs from the pinned release evidence")
        if _metadata(database, key) != value:
            raise ValueError(f"database metadata {key} differs from the pinned release evidence")
    if transform.get("database_sha256") != _file_sha256(inputs.database):
        raise ValueError("generated database SHA-256 does not match the import manifest")
    if transform.get("database_bytes") != inputs.database.stat().st_size:
        raise ValueError("generated database byte count does not match the import manifest")

    sample_record = source_manifest["reference_sample"]
    if sample_record["sha256"] != _file_sha256(inputs.reference_sample):
        raise ValueError("reference sample SHA-256 does not match the source manifest")
    return source_manifest, transform


def _validate_reference_sample(
    database: sqlite3.Connection,
    sample_path: Path,
    sample_record: dict[str, object],
) -> dict[str, int]:
    with sample_path.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source, delimiter="\t"))
    if len(rows) != int(sample_record["pair_count"]):
        raise ValueError("reference sample pair count differs")
    query_counts: dict[str, int] = {}
    not_supplied_sides = 0
    japanese_indices = 0
    for row in rows:
        query = row["query"]
        query_counts[query] = query_counts.get(query, 0) + 1
        if int(row["observed_rank"]) != query_counts[query]:
            raise ValueError(f"reference sample rank is not contiguous for {query}")
        if not row["internal_evidence_pointer"].startswith("private://issue-140/"):
            raise ValueError("reference sample lacks an internal evidence pointer")
        if not SHA256_RE.fullmatch(row["evidence_sha256"]):
            raise ValueError("reference sample lacks an evidence hash")
        record = database.execute(
            """
            SELECT e.japanese, e.english,
                   p.japanese_contributor, p.japanese_contributor_status,
                   p.english_contributor, p.english_contributor_status,
                   p.japanese_license, p.english_license, p.pair_license
            FROM example_sentence_provenance AS p
            JOIN example_sentences AS e ON e.id = p.pair_id
            WHERE p.source_japanese_record_id = ? AND p.source_english_record_id = ?
            """,
            (int(row["japanese_id"]), int(row["english_id"])),
        ).fetchone()
        if record is None:
            raise ValueError(f"reference sample {row['sample_id']} is absent")
        expected = (
            row["japanese"],
            row["english"],
            row["japanese_contributor"] or None,
            row["japanese_contributor_status"],
            row["english_contributor"] or None,
            row["english_contributor_status"],
            CC0_LICENSE if row["japanese_cc0"] == "true" else CC_BY_LICENSE,
            CC0_LICENSE if row["english_cc0"] == "true" else CC_BY_LICENSE,
            row["pair_license"],
        )
        if record != expected:
            raise ValueError(f"reference sample {row['sample_id']} differs from generated provenance")
        not_supplied_sides += int(row["japanese_contributor_status"] == UNASSIGNED_CONTRIBUTOR)
        not_supplied_sides += int(row["english_contributor_status"] == UNASSIGNED_CONTRIBUTOR)
        japanese_indices += int(row["japanese_indices"] == "true")
    expected_counts = {str(key): int(value) for key, value in sample_record["query_counts"].items()}
    if query_counts != expected_counts:
        raise ValueError(f"reference sample query coverage differs: {query_counts}")
    return {
        "sample_pairs": len(rows),
        "sample_not_supplied_sides": not_supplied_sides,
        "sample_japanese_indices": japanese_indices,
    }


def verify_database(inputs: VerificationInputs, *, inspection: bool = False) -> dict[str, int | str]:
    database = sqlite3.connect(f"file:{inputs.database}?mode=ro", uri=True)
    try:
        source_manifest, _transform = _validate_artifact_identity(inputs, database)
        columns = {
            str(row[1]) for row in database.execute("PRAGMA table_info(example_sentence_provenance)")
        }
        missing = REQUIRED_PROVENANCE_COLUMNS.difference(columns)
        if missing:
            raise ValueError(f"example provenance lacks columns: {sorted(missing)}")
        pair_count = int(_scalar(database, "SELECT count(*) FROM example_sentences"))
        provenance_count = int(_scalar(database, "SELECT count(*) FROM example_sentence_provenance"))
        if pair_count == 0 or provenance_count < pair_count:
            raise ValueError("example corpus or provenance coverage is incomplete")
        snapshot_date = str(source_manifest["snapshot_date"])
        snapshot_sha256 = str(source_manifest["aggregate_sha256"])
        invalid_rows = int(
            _scalar(
                database,
                """
                SELECT count(*)
                FROM example_sentence_provenance AS p
                JOIN example_sentences AS e ON e.id = p.pair_id
                WHERE length(e.id) != 16
                   OR p.source_identity != 'tatoeba.weekly-export'
                   OR p.source_japanese_record_id <= 0 OR p.source_english_record_id <= 0
                   OR e.japanese = '' OR e.english = ''
                   OR p.japanese_contributor_status NOT IN (?, ?)
                   OR p.english_contributor_status NOT IN (?, ?)
                   OR (p.japanese_contributor_status = ? AND coalesce(p.japanese_contributor, '') = '')
                   OR (p.english_contributor_status = ? AND coalesce(p.english_contributor, '') = '')
                   OR (p.japanese_contributor_status = ? AND p.japanese_contributor IS NOT NULL)
                   OR (p.english_contributor_status = ? AND p.english_contributor IS NOT NULL)
                   OR p.japanese_license NOT IN (?, ?) OR p.english_license NOT IN (?, ?)
                   OR p.pair_license != CASE
                        WHEN p.japanese_license = ? AND p.english_license = ? THEN ? ELSE ? END
                   OR p.source_snapshot_date != ? OR p.source_snapshot_sha256 != ?
                """,
                (
                    NAMED_CONTRIBUTOR,
                    UNASSIGNED_CONTRIBUTOR,
                    NAMED_CONTRIBUTOR,
                    UNASSIGNED_CONTRIBUTOR,
                    NAMED_CONTRIBUTOR,
                    NAMED_CONTRIBUTOR,
                    UNASSIGNED_CONTRIBUTOR,
                    UNASSIGNED_CONTRIBUTOR,
                    CC0_LICENSE,
                    CC_BY_LICENSE,
                    CC0_LICENSE,
                    CC_BY_LICENSE,
                    CC0_LICENSE,
                    CC0_LICENSE,
                    CC0_LICENSE,
                    CC_BY_LICENSE,
                    snapshot_date,
                    snapshot_sha256,
                ),
            )
        )
        if invalid_rows:
            raise ValueError(f"{invalid_rows} example provenance rows are inconsistent")
        credit_mismatches = int(
            _scalar(
                database,
                """
                WITH expected AS (
                  SELECT contributor, count(*) AS side_count FROM (
                    SELECT japanese_contributor AS contributor FROM example_sentence_provenance
                    UNION ALL
                    SELECT english_contributor AS contributor FROM example_sentence_provenance
                  ) WHERE contributor IS NOT NULL GROUP BY contributor
                ), differences AS (
                  SELECT expected.contributor FROM expected
                  LEFT JOIN example_sentence_contributors AS actual ON actual.username = expected.contributor
                  WHERE actual.sentence_side_count IS NULL OR actual.sentence_side_count != expected.side_count
                  UNION ALL
                  SELECT actual.username FROM example_sentence_contributors AS actual
                  LEFT JOIN expected ON expected.contributor = actual.username
                  WHERE expected.contributor IS NULL
                ) SELECT count(*) FROM differences
                """,
            )
        )
        if credit_mismatches:
            raise ValueError(f"contributor credit table has {credit_mismatches} mismatches")
        sample_stats = _validate_reference_sample(
            database, inputs.reference_sample, source_manifest["reference_sample"]
        )
        not_supplied_sides = int(
            _scalar(
                database,
                """
                SELECT sum(japanese_contributor_status = 'not-supplied')
                     + sum(english_contributor_status = 'not-supplied')
                FROM example_sentence_provenance
                """,
            )
        )
        affected_pairs = int(
            _scalar(
                database,
                """
                SELECT count(DISTINCT pair_id) FROM example_sentence_provenance
                WHERE japanese_contributor_status = 'not-supplied'
                   OR english_contributor_status = 'not-supplied'
                """,
            )
        )
        posture = None if inspection else validate_release_posture(source_manifest)
        return {
            "mode": "inspection" if inspection else "release-owner-accepted-known-risk",
            "pairs": pair_count,
            "provenance_rows": provenance_count,
            "cc0_pairs": int(
                _scalar(
                    database,
                    "SELECT count(DISTINCT pair_id) FROM example_sentence_provenance WHERE pair_license = ?",
                    (CC0_LICENSE,),
                )
            ),
            "attributed_pairs": int(
                _scalar(
                    database,
                    "SELECT count(DISTINCT pair_id) FROM example_sentence_provenance WHERE pair_license = ?",
                    (CC_BY_LICENSE,),
                )
            ),
            "named_contributors": int(
                _scalar(database, "SELECT count(*) FROM example_sentence_contributors")
            ),
            "not_supplied_sides": not_supplied_sides,
            "affected_pairs": affected_pairs,
            "release_posture": "inspection" if posture is None else str(posture["status"]),
            "snapshot_date": snapshot_date,
            "snapshot_sha256": snapshot_sha256,
            **sample_stats,
        }
    finally:
        database.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("source_manifest", type=Path)
    parser.add_argument("import_manifest", type=Path)
    parser.add_argument("importer", type=Path)
    parser.add_argument("adapter", type=Path)
    parser.add_argument("reference_sample", type=Path)
    parser.add_argument("source_directory", type=Path)
    parser.add_argument("--inspection", action="store_true")
    arguments = parser.parse_args()
    try:
        report = verify_database(
            VerificationInputs(
                arguments.database,
                arguments.source_manifest,
                arguments.import_manifest,
                arguments.importer,
                arguments.adapter,
                arguments.reference_sample,
                arguments.source_directory,
            ),
            inspection=arguments.inspection,
        )
    except ValueError as error:
        parser.exit(1, f"error: {error}\n")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
