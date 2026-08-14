#!/usr/bin/env python3
"""Release-blocking validation for the shipped Tatoeba example corpus."""

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
REQUIRED_COLUMNS = {
    "id",
    "source_identity",
    "source_record_id",
    "japanese_source_record_id",
    "english_source_record_id",
    "japanese_contributor",
    "english_contributor",
    "japanese_contributor_status",
    "english_contributor_status",
    "japanese_license",
    "english_license",
    "pair_license",
    "source_snapshot_date",
    "source_snapshot_sha256",
    "japanese",
    "english",
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


def _validate_artifact_identity(
    inputs: VerificationInputs,
    database: sqlite3.Connection,
) -> tuple[dict[str, object], dict[str, object]]:
    source_manifest = json.loads(inputs.source_manifest.read_text())
    import_document = json.loads(inputs.import_manifest.read_text())
    transform = import_document["transform"]
    sources = source_manifest["sources"]

    roles = {str(source["role"]) for source in sources}
    if roles != REQUIRED_SOURCE_ROLES or len(sources) != len(REQUIRED_SOURCE_ROLES):
        raise ValueError(f"pinned Tatoeba source roles differ: {sorted(roles)}")
    source_hashes = [str(source["sha256"]) for source in sources]
    if any(not SHA256_RE.fullmatch(value) for value in source_hashes):
        raise ValueError("a pinned Tatoeba input lacks a valid SHA-256")
    for source in sources:
        role = str(source["role"])
        source_path = inputs.source_directory / SOURCE_FILENAMES[role]
        if _file_sha256(source_path) != source["sha256"]:
            raise ValueError(f"pinned Tatoeba input file hash differs for {role}")
    aggregate = _ordered_sha256(source_hashes)
    if aggregate != source_manifest["aggregate_sha256"]:
        raise ValueError("pinned Tatoeba input hashes do not produce the declared aggregate")
    if transform["example_source_inputs"] != sources or transform["example_source_sha256"] != aggregate:
        raise ValueError("generated manifest does not retain the exact pinned Tatoeba inputs")

    importer_sha256 = _file_sha256(inputs.importer)
    adapter_sha256 = _file_sha256(inputs.adapter)
    transform_sha256 = _ordered_sha256([importer_sha256, adapter_sha256])
    expected_hashes = {
        "import_tool_sha256": importer_sha256,
        "tatoeba_adapter_sha256": adapter_sha256,
        "example_transform_sha256": transform_sha256,
    }
    for key, expected in expected_hashes.items():
        if transform.get(key) != expected:
            raise ValueError(f"generated manifest {key} does not match the current transform code")
        if _metadata(database, key) != expected:
            raise ValueError(f"database metadata {key} does not match the current transform code")

    database_sha256 = _file_sha256(inputs.database)
    if transform.get("database_sha256") != database_sha256:
        raise ValueError("generated database SHA-256 does not match the import manifest")
    if transform.get("database_bytes") != inputs.database.stat().st_size:
        raise ValueError("generated database byte count does not match the import manifest")
    if _metadata(database, "example_source_inputs") != sources:
        raise ValueError("database metadata does not retain the exact pinned Tatoeba inputs")

    sample_record = source_manifest["reference_sample"]
    if sample_record["sha256"] != _file_sha256(inputs.reference_sample):
        raise ValueError("reference sample SHA-256 does not match the source manifest")
    classification_inputs = sample_record["classification_inputs"]
    for key in ("japanese_indices_archive_sha256", "japanese_indices_extracted_sha256"):
        if not SHA256_RE.fullmatch(str(classification_inputs[key])):
            raise ValueError(f"reference sample classification input lacks {key}")

    return source_manifest, transform


def _validate_reference_sample(
    database: sqlite3.Connection,
    sample_path: Path,
    sample_record: dict[str, object],
) -> dict[str, int]:
    with sample_path.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source, delimiter="\t"))
    expected_pair_count = int(sample_record["pair_count"])
    if len(rows) != expected_pair_count:
        raise ValueError(f"reference sample must contain {expected_pair_count} rows, found {len(rows)}")

    query_counts: dict[str, int] = {}
    not_supplied_sides = 0
    japanese_indices = 0
    for row in rows:
        query = row["query"]
        query_counts[query] = query_counts.get(query, 0) + 1
        expected_rank = query_counts[query]
        if int(row["observed_rank"]) != expected_rank:
            raise ValueError(f"reference sample rank is not contiguous for {query}")
        if not row["internal_evidence_pointer"].startswith("private://issue-140/"):
            raise ValueError(f"reference sample {row['sample_id']} lacks an internal-only evidence pointer")
        if not SHA256_RE.fullmatch(row["evidence_sha256"]):
            raise ValueError(f"reference sample {row['sample_id']} lacks an evidence hash")
        if any(row[field] != "true" for field in ("general_japanese", "general_english", "direct_link", "zenbu_exact_pair")):
            raise ValueError(f"reference sample {row['sample_id']} is not classified as an exact general/direct pair")

        record = database.execute(
            """
            SELECT japanese, english,
                   japanese_contributor, japanese_contributor_status,
                   english_contributor, english_contributor_status,
                   japanese_license, english_license, pair_license
            FROM example_sentences
            WHERE japanese_source_record_id = ? AND english_source_record_id = ?
            """,
            (int(row["japanese_id"]), int(row["english_id"])),
        ).fetchone()
        if record is None:
            raise ValueError(f"reference sample {row['sample_id']} is absent from the generated database")
        expected_record = (
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
        if record != expected_record:
            raise ValueError(f"reference sample {row['sample_id']} differs from generated provenance")
        not_supplied_sides += int(row["japanese_contributor_status"] == UNASSIGNED_CONTRIBUTOR)
        not_supplied_sides += int(row["english_contributor_status"] == UNASSIGNED_CONTRIBUTOR)
        japanese_indices += int(row["japanese_indices"] == "true")

    expected_query_counts = {str(key): int(value) for key, value in sample_record["query_counts"].items()}
    if query_counts != expected_query_counts:
        raise ValueError(f"reference sample query coverage differs: {query_counts}")
    return {
        "sample_pairs": len(rows),
        "sample_not_supplied_sides": not_supplied_sides,
        "sample_japanese_indices": japanese_indices,
    }


def verify_database(inputs: VerificationInputs, *, allow_unresolved: bool = False) -> dict[str, int | str]:
    database = sqlite3.connect(f"file:{inputs.database}?mode=ro", uri=True)
    try:
        source_manifest, _transform = _validate_artifact_identity(inputs, database)
        snapshot_date = str(source_manifest["snapshot_date"])
        snapshot_sha256 = str(source_manifest["aggregate_sha256"])
        columns = {str(row[1]) for row in database.execute("PRAGMA table_info(example_sentences)")}
        missing_columns = REQUIRED_COLUMNS.difference(columns)
        if missing_columns:
            raise ValueError(f"example_sentences lacks provenance columns: {sorted(missing_columns)}")

        pair_count = int(_scalar(database, "SELECT count(*) FROM example_sentences"))
        if pair_count == 0:
            raise ValueError("example corpus is empty")

        invalid_rows = int(
            _scalar(
                database,
                """
                SELECT count(*)
                FROM example_sentences
                WHERE source_identity != 'tatoeba.weekly-export'
                   OR id != printf('tatoeba:%d:%d', japanese_source_record_id, english_source_record_id)
                   OR source_record_id != CAST(japanese_source_record_id AS TEXT)
                   OR japanese_source_record_id <= 0 OR english_source_record_id <= 0
                   OR japanese = '' OR english = ''
                   OR japanese_contributor_status NOT IN (?, ?)
                   OR english_contributor_status NOT IN (?, ?)
                   OR (japanese_contributor_status = ? AND (japanese_contributor IS NULL OR japanese_contributor = ''))
                   OR (english_contributor_status = ? AND (english_contributor IS NULL OR english_contributor = ''))
                   OR (japanese_contributor_status = ? AND japanese_contributor IS NOT NULL)
                   OR (english_contributor_status = ? AND english_contributor IS NOT NULL)
                   OR japanese_license NOT IN (?, ?) OR english_license NOT IN (?, ?)
                   OR pair_license != CASE
                        WHEN japanese_license = ? AND english_license = ? THEN ? ELSE ? END
                   OR source_snapshot_date != ? OR source_snapshot_sha256 != ?
                """,
                (
                    NAMED_CONTRIBUTOR, UNASSIGNED_CONTRIBUTOR,
                    NAMED_CONTRIBUTOR, UNASSIGNED_CONTRIBUTOR,
                    NAMED_CONTRIBUTOR, NAMED_CONTRIBUTOR,
                    UNASSIGNED_CONTRIBUTOR, UNASSIGNED_CONTRIBUTOR,
                    CC0_LICENSE, CC_BY_LICENSE, CC0_LICENSE, CC_BY_LICENSE,
                    CC0_LICENSE, CC0_LICENSE, CC0_LICENSE, CC_BY_LICENSE,
                    snapshot_date, snapshot_sha256,
                ),
            )
        )
        if invalid_rows:
            raise ValueError(f"{invalid_rows} shipped example pairs have incomplete or inconsistent provenance")

        credit_mismatches = int(
            _scalar(
                database,
                """
                WITH expected AS (
                  SELECT contributor, count(*) AS side_count
                  FROM (
                    SELECT japanese_contributor AS contributor FROM example_sentences
                    UNION ALL
                    SELECT english_contributor AS contributor FROM example_sentences
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
        if _metadata(database, "example_source_sha256") != snapshot_sha256:
            raise ValueError("database metadata does not identify the pinned Tatoeba aggregate")

        sample_stats = _validate_reference_sample(
            database,
            inputs.reference_sample,
            source_manifest["reference_sample"],
        )
        not_supplied_sides = int(
            _scalar(
                database,
                """
                SELECT sum(japanese_contributor_status = 'not-supplied')
                     + sum(english_contributor_status = 'not-supplied')
                FROM example_sentences
                """,
            )
        )
        if not_supplied_sides and not allow_unresolved:
            affected_pairs = int(
                _scalar(
                    database,
                    """
                    SELECT count(*) FROM example_sentences
                    WHERE japanese_contributor_status = 'not-supplied'
                       OR english_contributor_status = 'not-supplied'
                    """,
                )
            )
            raise ValueError(
                "release blocked: "
                f"{not_supplied_sides} unresolved contributor sides affect {affected_pairs} example pairs"
            )

        return {
            "mode": "inspection" if allow_unresolved else "release",
            "pairs": pair_count,
            "cc0_pairs": int(_scalar(database, "SELECT count(*) FROM example_sentences WHERE pair_license = ?", (CC0_LICENSE,))),
            "attributed_pairs": int(_scalar(database, "SELECT count(*) FROM example_sentences WHERE pair_license = ?", (CC_BY_LICENSE,))),
            "named_contributors": int(_scalar(database, "SELECT count(*) FROM example_sentence_contributors")),
            "not_supplied_sides": not_supplied_sides,
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
    parser.add_argument(
        "--inspection",
        action="store_true",
        help="report unresolved rows for investigation; never use this mode as a Release gate",
    )
    arguments = parser.parse_args()
    inputs = VerificationInputs(
        database=arguments.database,
        source_manifest=arguments.source_manifest,
        import_manifest=arguments.import_manifest,
        importer=arguments.importer,
        adapter=arguments.adapter,
        reference_sample=arguments.reference_sample,
        source_directory=arguments.source_directory,
    )
    try:
        report = verify_database(inputs, allow_unresolved=arguments.inspection)
    except ValueError as error:
        parser.exit(1, f"error: {error}\n")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
