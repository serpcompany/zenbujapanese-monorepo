#!/usr/bin/env python3

from __future__ import annotations

import bz2
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import tatoeba_adapter  # noqa: E402
from verify_tatoeba_provenance import validate_release_posture  # noqa: E402


def schema() -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE example_sentences (
          id BLOB PRIMARY KEY,
          japanese TEXT NOT NULL,
          english TEXT NOT NULL
        );
        CREATE TABLE example_sentence_provenance (
          pair_id BLOB NOT NULL REFERENCES example_sentences(id),
          source_identity TEXT NOT NULL,
          source_japanese_record_id INTEGER NOT NULL,
          source_english_record_id INTEGER NOT NULL,
          japanese_contributor TEXT,
          english_contributor TEXT,
          japanese_contributor_status TEXT NOT NULL,
          english_contributor_status TEXT NOT NULL,
          japanese_license TEXT NOT NULL,
          english_license TEXT NOT NULL,
          pair_license TEXT NOT NULL,
          source_snapshot_date TEXT NOT NULL,
          source_snapshot_sha256 TEXT NOT NULL,
          PRIMARY KEY(pair_id, source_identity, source_japanese_record_id, source_english_record_id)
        ) WITHOUT ROWID;
        CREATE TABLE example_sentence_contributors (
          username TEXT PRIMARY KEY,
          sentence_side_count INTEGER NOT NULL
        ) WITHOUT ROWID;
        """
    )
    return database


def compressed(path: Path, text: str) -> Path:
    with bz2.open(path, "wt", encoding="utf-8") as output:
        output.write(text)
    return path


def snapshot(root: Path, japanese_rows: str, english_rows: str, links_rows: str):
    japanese = compressed(root / "jpn.bz2", japanese_rows)
    english = compressed(root / "eng.bz2", english_rows)
    links = compressed(root / "links.bz2", links_rows)
    japanese_details = compressed(
        root / "jpn-detailed.bz2",
        "".join(
            f"{row.split(chr(9), 1)[0]}\tjpn\t{row.rstrip().split(chr(9), 2)[2]}\tAlice\t2020-01-01\t2020-01-02\n"
            for row in japanese_rows.splitlines()
        ),
    )
    english_details = compressed(
        root / "eng-detailed.bz2",
        "".join(
            f"{row.split(chr(9), 1)[0]}\teng\t{row.rstrip().split(chr(9), 2)[2]}\tBob\t2020-01-01\t2020-01-02\n"
            for row in english_rows.splitlines()
        ),
    )
    japanese_cc0 = compressed(root / "jpn-cc0.bz2", "")
    english_cc0 = compressed(root / "eng-cc0.bz2", "")
    return tatoeba_adapter.TatoebaSnapshotInputs(
        japanese,
        english,
        links,
        japanese_details,
        english_details,
        japanese_cc0,
        english_cc0,
        "2026-08-08",
        "a" * 64,
    )


class TatoebaAdapterTests(unittest.TestCase):
    def test_release_posture_requires_the_exact_owner_decision(self) -> None:
        with self.assertRaisesRegex(ValueError, "owner-approved release posture is missing"):
            validate_release_posture({})
        posture = {
            "status": "owner-accepted-known-attribution-risk",
            "scope": "version-1.0-full-example-corpus",
            "decision_issue": 140,
            "decision_comment_url": (
                "https://github.com/serpcompany/zenbujapanese-monorepo/issues/140"
                "#issuecomment-5303558635"
            ),
            "statement": "Preserve the full corpus and disclose the known uncertainty.",
        }
        self.assertEqual(validate_release_posture({"release_posture": posture}), posture)

    def test_pair_identity_depends_only_on_normalized_semantic_text(self) -> None:
        composed = tatoeba_adapter.app_owned_example_pair_id("が", "Café")
        decomposed = tatoeba_adapter.app_owned_example_pair_id("か\N{COMBINING KATAKANA-HIRAGANA VOICED SOUND MARK}", "Cafe\N{COMBINING ACUTE ACCENT}")
        self.assertEqual(composed, decomposed)
        self.assertRegex(composed, r"^esp1_[0-9a-f]{32}$")
        self.assertNotIn("tatoeba", composed)

    def test_import_retains_provider_coordinates_only_as_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            inputs = snapshot(root, "17\tjpn\t猫です。\n", "29\teng\tIt is a cat.\n", "17\t29\n")
            database = schema()

            result = tatoeba_adapter.import_tatoeba_examples(database, inputs)
            self.assertEqual(result["retained_pairs"], 1)
            self.assertEqual(result["named_contributors"], 2)
            pair_id, stored_japanese, stored_english = database.execute(
                "SELECT id, japanese, english FROM example_sentences"
            ).fetchone()
            self.assertEqual(
                pair_id,
                tatoeba_adapter.app_owned_example_pair_storage_id(stored_japanese, stored_english),
            )
            self.assertNotIn(b"17", pair_id)
            self.assertNotIn(b"29", pair_id)
            self.assertEqual(
                database.execute(
                    """
                    SELECT pair_id, source_identity,
                           source_japanese_record_id, source_english_record_id
                    FROM example_sentence_provenance
                    """
                ).fetchone(),
                (pair_id, "tatoeba.weekly-export", 17, 29),
            )
            self.assertEqual(
                database.execute(
                    """
                    SELECT japanese_contributor, english_contributor,
                           japanese_contributor_status, english_contributor_status,
                           pair_license, source_snapshot_date, source_snapshot_sha256
                    FROM example_sentence_provenance
                    """
                ).fetchone(),
                ("Alice", "Bob", "named", "named", "CC BY 2.0 FR", "2026-08-08", "a" * 64),
            )

    def test_distinct_semantic_pairs_fail_closed_on_id_collision(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            inputs = snapshot(
                root,
                "17\tjpn\t猫です。\n18\tjpn\t犬です。\n",
                "29\teng\tIt is a cat.\n30\teng\tIt is a dog.\n",
                "17\t29\n18\t30\n",
            )
            database = schema()

            with mock.patch.object(
                tatoeba_adapter,
                "app_owned_example_pair_storage_id",
                return_value=b"\0" * 16,
            ):
                with self.assertRaisesRegex(ValueError, "collision"):
                    tatoeba_adapter.import_tatoeba_examples(database, inputs)
            self.assertEqual(database.execute("SELECT count(*) FROM example_sentences").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
