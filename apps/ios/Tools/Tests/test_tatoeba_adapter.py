from __future__ import annotations

import bz2
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

from tatoeba_adapter import import_tatoeba_examples  # noqa: E402
from verify_tatoeba_provenance import verify_database  # noqa: E402


SCHEMA = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE example_sentences (
  id TEXT PRIMARY KEY,
  source_identity TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  japanese_source_record_id INTEGER NOT NULL,
  english_source_record_id INTEGER NOT NULL,
  japanese_contributor TEXT,
  english_contributor TEXT,
  japanese_contributor_status TEXT NOT NULL,
  english_contributor_status TEXT NOT NULL,
  japanese_license TEXT NOT NULL,
  english_license TEXT NOT NULL,
  pair_license TEXT NOT NULL,
  source_snapshot_date TEXT NOT NULL,
  source_snapshot_sha256 TEXT NOT NULL,
  japanese TEXT NOT NULL,
  english TEXT NOT NULL
);
CREATE TABLE example_sentence_contributors (
  username TEXT PRIMARY KEY,
  sentence_side_count INTEGER NOT NULL
);
"""


class TatoebaAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def compressed(self, name: str, contents: str) -> Path:
        path = self.root / name
        with bz2.open(path, "wt", encoding="utf-8") as output:
            output.write(contents)
        return path

    def sources(self, *, japanese_detail_override: str | None = None) -> dict[str, Path]:
        japanese_details = japanese_detail_override or (
            "1\tjpn\t病は気から。\tjapanese_user\t2020-01-01\t2020-01-02\n"
            "2\tjpn\t野菜を食べたら？\t\\N\t2020-01-01\t2020-01-02\n"
            "3\tjpn\t散れ！\tother_user\t2020-01-01\t2020-01-02\n"
        )
        return {
            "japanese": self.compressed(
                "jpn.tsv.bz2",
                "1\tjpn\t病は気から。\n2\tjpn\t野菜を食べたら？\n3\tjpn\t散れ！\n",
            ),
            "english": self.compressed(
                "eng.tsv.bz2",
                "19\teng\tCare killed a cat.\n20\teng\tWhy don't you eat some vegetables?\n21\teng\tScatter!\n22\teng\tA higher-ID translation.\n",
            ),
            "links": self.compressed("links.tsv.bz2", "1\t22\n1\t19\n2\t20\n3\t21\n"),
            "japanese_detailed": self.compressed("jpn-detailed.tsv.bz2", japanese_details),
            "english_detailed": self.compressed(
                "eng-detailed.tsv.bz2",
                "19\teng\tCare killed a cat.\tenglish_user\t2020-01-01\t2020-01-02\n"
                "20\teng\tWhy don't you eat some vegetables?\tenglish_user\t2020-01-01\t2020-01-02\n"
                "21\teng\tScatter!\t\\N\t2020-01-01\t2020-01-02\n"
                "22\teng\tA higher-ID translation.\tunused_user\t2020-01-01\t2020-01-02\n",
            ),
            "japanese_cc0": self.compressed("jpn-cc0.tsv.bz2", "1\tjpn\t病は気から。\t2020-01-02\n"),
            "english_cc0": self.compressed("eng-cc0.tsv.bz2", "19\teng\tCare killed a cat.\t2020-01-02\n"),
        }

    def import_sources(self, database: sqlite3.Connection, sources: dict[str, Path]) -> dict[str, int]:
        database.executescript(SCHEMA)
        return import_tatoeba_examples(
            database,
            sources["japanese"],
            sources["english"],
            sources["links"],
            sources["japanese_detailed"],
            sources["english_detailed"],
            sources["japanese_cc0"],
            sources["english_cc0"],
            "2026-08-08",
            "snapshot-hash",
        )

    def test_import_retains_both_ids_contributors_and_license(self) -> None:
        database = sqlite3.connect(":memory:")
        stats = self.import_sources(database, self.sources())

        self.assertEqual(
            stats,
            {
                "retained_pairs": 3,
                "cc0_pairs": 1,
                "attributed_pairs": 2,
                "named_contributors": 3,
                "unassigned_sentence_sides": 2,
            },
        )
        self.assertEqual(
            database.execute(
                """
                SELECT japanese_source_record_id, english_source_record_id,
                       japanese_contributor, english_contributor,
                       japanese_license, english_license, pair_license
                FROM example_sentences WHERE japanese_source_record_id = 1
                """
            ).fetchone(),
            (1, 19, "japanese_user", "english_user", "CC0 1.0", "CC0 1.0", "CC0 1.0"),
        )
    def test_import_rejects_general_and_detailed_text_mismatch(self) -> None:
        database = sqlite3.connect(":memory:")
        sources = self.sources(
            japanese_detail_override=(
                "1\tjpn\t違う。\tjapanese_user\t2020-01-01\t2020-01-02\n"
                "2\tjpn\t野菜を食べたら？\t\\N\t2020-01-01\t2020-01-02\n"
                "3\tjpn\t散れ！\tother_user\t2020-01-01\t2020-01-02\n"
            )
        )
        with self.assertRaisesRegex(ValueError, "Japanese detailed/general text mismatch"):
            self.import_sources(database, sources)

    def test_release_validator_rejects_tampered_provenance(self) -> None:
        database_path = self.root / "LanguageReferenceData.sqlite3"
        database = sqlite3.connect(database_path)
        self.import_sources(database, self.sources())
        database.execute(
            "INSERT INTO metadata(key, value) VALUES ('example_source_sha256', ?)",
            (json.dumps("snapshot-hash"),),
        )
        database.commit()
        database.close()
        manifest = self.root / "Tatoeba.source.json"
        manifest.write_text(json.dumps({"snapshot_date": "2026-08-08", "aggregate_sha256": "snapshot-hash"}))

        self.assertEqual(verify_database(database_path, manifest)["pairs"], 3)

        database = sqlite3.connect(database_path)
        database.execute(
            "UPDATE example_sentences SET english_contributor_status = 'named' WHERE english_contributor IS NULL"
        )
        database.commit()
        database.close()
        with self.assertRaisesRegex(ValueError, "incomplete or inconsistent provenance"):
            verify_database(database_path, manifest)


if __name__ == "__main__":
    unittest.main()
