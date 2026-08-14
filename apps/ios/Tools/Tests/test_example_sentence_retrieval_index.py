#!/usr/bin/env python3

from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
import json
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

from example_sentence_retrieval_index import (  # noqa: E402
    EXACT_TABLE,
    MAP_TABLE,
    PORTER_TABLE,
    build_indexes,
    file_checksum,
    rebuild_atomically,
    validate_indexes,
    validate_manifest,
)


ROWS = [
    ("pair-c", "怖がらせた？", "Did I scare you?"),
    ("pair-a", "怖かった？", "Did I scared you?"),
    ("pair-b", "驚かせた？", "Did I startle you?"),
    ("pair-d", "赤い", "I colored your red book."),
]


def database_with(rows: list[tuple[str, str, str]]) -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE example_sentences (
          id TEXT PRIMARY KEY,
          source_identity TEXT NOT NULL,
          source_record_id TEXT NOT NULL,
          japanese TEXT NOT NULL,
          english TEXT NOT NULL
        );
        """
    )
    database.executemany(
        "INSERT INTO example_sentences VALUES (?, 'fixture', ?, ?, ?)",
        [(pair_id, pair_id, japanese, english) for pair_id, japanese, english in rows],
    )
    return database


class ExampleSentenceRetrievalIndexTests(unittest.TestCase):
    def test_mapping_and_metadata_are_stable_across_source_insertion_order(self) -> None:
        left = database_with(ROWS)
        right = database_with(list(reversed(ROWS)))
        left_metadata = build_indexes(left)
        right_metadata = build_indexes(right)

        self.assertEqual(left_metadata, right_metadata)
        expected_mapping = [(1, "pair-a"), (2, "pair-b"), (3, "pair-c"), (4, "pair-d")]
        self.assertEqual(left.execute(f"SELECT * FROM {MAP_TABLE} ORDER BY fts_rowid").fetchall(), expected_mapping)
        self.assertEqual(right.execute(f"SELECT * FROM {MAP_TABLE} ORDER BY fts_rowid").fetchall(), expected_mapping)

    def test_porter_and_exact_indexes_keep_eligibility_and_surface_evidence_separate(self) -> None:
        database = database_with(ROWS)
        build_indexes(database)

        def ids(table: str, query: str) -> list[str]:
            return [
                row[0]
                for row in database.execute(
                    f"SELECT m.pair_id FROM {table} f "
                    f"JOIN {MAP_TABLE} m ON m.fts_rowid = f.docid "
                    f"WHERE {table} MATCH ? ORDER BY m.pair_id",
                    (f'"{query}"',),
                )
            ]

        self.assertEqual(ids(PORTER_TABLE, "scared you"), ["pair-a", "pair-c"])
        self.assertEqual(ids(EXACT_TABLE, "scared you"), ["pair-a"])
        self.assertEqual(ids(PORTER_TABLE, "red you"), [])

    def test_validation_fails_closed_on_incomplete_mapping_or_metadata(self) -> None:
        for mutation in ("mapping", "metadata"):
            with self.subTest(mutation=mutation):
                database = database_with(ROWS)
                build_indexes(database)
                if mutation == "mapping":
                    database.execute(f"DELETE FROM {MAP_TABLE} WHERE fts_rowid = 1")
                else:
                    database.execute(
                        "UPDATE metadata SET value = 'wrong' WHERE key = 'retrieval_policy_version'"
                    )
                with self.assertRaises(ValueError):
                    validate_indexes(database)

    def test_atomic_rebuild_is_logically_deterministic_for_unchanged_corpus(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "LanguageReferenceData.sqlite3"
            database = sqlite3.connect(path)
            database.executescript(
                """
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE example_sentences (
                  id TEXT PRIMARY KEY,
                  source_identity TEXT NOT NULL,
                  source_record_id TEXT NOT NULL,
                  japanese TEXT NOT NULL,
                  english TEXT NOT NULL
                );
                """
            )
            database.executemany(
                "INSERT INTO example_sentences VALUES (?, 'fixture', ?, ?, ?)",
                [(pair_id, pair_id, japanese, english) for pair_id, japanese, english in ROWS],
            )
            database.commit()
            database.close()

            rebuild_atomically(path)
            first_database = sqlite3.connect(path)
            first_metadata = validate_indexes(first_database)
            first_mapping = first_database.execute(
                f"SELECT fts_rowid, pair_id FROM {MAP_TABLE} ORDER BY fts_rowid"
            ).fetchall()
            first_database.close()
            rebuild_atomically(path)
            second_database = sqlite3.connect(path)
            self.assertEqual(validate_indexes(second_database), first_metadata)
            self.assertEqual(
                second_database.execute(
                    f"SELECT fts_rowid, pair_id FROM {MAP_TABLE} ORDER BY fts_rowid"
                ).fetchall(),
                first_mapping,
            )
            second_database.close()

    def test_manifest_validation_fails_on_artifact_disagreement(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "LanguageReferenceData.sqlite3"
            source = database_with(ROWS)
            source.commit()
            target = sqlite3.connect(path)
            source.backup(target)
            source.close()
            metadata = build_indexes(target)
            target.execute("VACUUM")
            target.close()

            manifest_path = Path(directory) / "import.json"
            manifest = {
                "transform": {
                    "example_sentence_retrieval": metadata,
                    "database_sha256": file_checksum(path),
                    "database_bytes": path.stat().st_size,
                }
            }
            manifest_path.write_text(json.dumps(manifest))
            validate_manifest(path, manifest_path, metadata)

            manifest["transform"]["database_sha256"] = "0" * 64
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                validate_manifest(path, manifest_path, metadata)


if __name__ == "__main__":
    unittest.main()
