#!/usr/bin/env python3
"""Release-blocking validation for the shipped Tatoeba example corpus."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from tatoeba_adapter import CC0_LICENSE, CC_BY_LICENSE, NAMED_CONTRIBUTOR, UNASSIGNED_CONTRIBUTOR


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


def _scalar(database: sqlite3.Connection, sql: str, parameters: tuple[object, ...] = ()) -> object:
    row = database.execute(sql, parameters).fetchone()
    if row is None:
        raise ValueError(f"validation query returned no row: {sql}")
    return row[0]


def verify_database(database_path: Path, source_manifest_path: Path) -> dict[str, int | str]:
    source_manifest = json.loads(source_manifest_path.read_text())
    snapshot_date = str(source_manifest["snapshot_date"])
    snapshot_sha256 = str(source_manifest["aggregate_sha256"])

    database = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
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
                   OR japanese_source_record_id <= 0
                   OR english_source_record_id <= 0
                   OR japanese = '' OR english = ''
                   OR japanese_contributor_status NOT IN (?, ?)
                   OR english_contributor_status NOT IN (?, ?)
                   OR (japanese_contributor_status = ? AND (japanese_contributor IS NULL OR japanese_contributor = ''))
                   OR (english_contributor_status = ? AND (english_contributor IS NULL OR english_contributor = ''))
                   OR (japanese_contributor_status = ? AND japanese_contributor IS NOT NULL)
                   OR (english_contributor_status = ? AND english_contributor IS NOT NULL)
                   OR japanese_license NOT IN (?, ?)
                   OR english_license NOT IN (?, ?)
                   OR pair_license != CASE
                        WHEN japanese_license = ? AND english_license = ? THEN ?
                        ELSE ?
                      END
                   OR source_snapshot_date != ?
                   OR source_snapshot_sha256 != ?
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
                  )
                  WHERE contributor IS NOT NULL
                  GROUP BY contributor
                ), differences AS (
                  SELECT expected.contributor
                  FROM expected
                  LEFT JOIN example_sentence_contributors AS actual
                    ON actual.username = expected.contributor
                  WHERE actual.sentence_side_count IS NULL OR actual.sentence_side_count != expected.side_count
                  UNION ALL
                  SELECT actual.username
                  FROM example_sentence_contributors AS actual
                  LEFT JOIN expected ON expected.contributor = actual.username
                  WHERE expected.contributor IS NULL
                )
                SELECT count(*) FROM differences
                """,
            )
        )
        if credit_mismatches:
            raise ValueError(f"contributor credit table has {credit_mismatches} mismatches")

        metadata_source_sha = json.loads(
            str(_scalar(database, "SELECT value FROM metadata WHERE key = 'example_source_sha256'"))
        )
        if metadata_source_sha != snapshot_sha256:
            raise ValueError("database metadata does not identify the pinned Tatoeba aggregate")

        return {
            "pairs": pair_count,
            "cc0_pairs": int(_scalar(database, "SELECT count(*) FROM example_sentences WHERE pair_license = ?", (CC0_LICENSE,))),
            "attributed_pairs": int(
                _scalar(database, "SELECT count(*) FROM example_sentences WHERE pair_license = ?", (CC_BY_LICENSE,))
            ),
            "named_contributors": int(_scalar(database, "SELECT count(*) FROM example_sentence_contributors")),
            "not_supplied_sides": int(
                _scalar(
                    database,
                    """
                    SELECT
                      sum(japanese_contributor_status = 'not-supplied')
                      + sum(english_contributor_status = 'not-supplied')
                    FROM example_sentences
                    """,
                )
            ),
            "snapshot_date": snapshot_date,
            "snapshot_sha256": snapshot_sha256,
        }
    finally:
        database.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("source_manifest", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(verify_database(arguments.database, arguments.source_manifest), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
