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
          PRIMARY KEY(pair_id, source_identity, source_japanese_record_id, source_english_record_id)
        ) WITHOUT ROWID;
        """
    )
    return database


def compressed(path: Path, text: str) -> Path:
    with bz2.open(path, "wt", encoding="utf-8") as output:
        output.write(text)
    return path


class TatoebaAdapterTests(unittest.TestCase):
    def test_pair_identity_depends_only_on_normalized_semantic_text(self) -> None:
        composed = tatoeba_adapter.app_owned_example_pair_id("が", "Café")
        decomposed = tatoeba_adapter.app_owned_example_pair_id("か\N{COMBINING KATAKANA-HIRAGANA VOICED SOUND MARK}", "Cafe\N{COMBINING ACUTE ACCENT}")
        self.assertEqual(composed, decomposed)
        self.assertRegex(composed, r"^esp1_[0-9a-f]{32}$")
        self.assertNotIn("tatoeba", composed)

    def test_import_retains_provider_coordinates_only_as_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            japanese = compressed(root / "jpn.bz2", "17\tjpn\t猫です。\n")
            english = compressed(root / "eng.bz2", "29\teng\tIt is a cat.\n")
            links = compressed(root / "links.bz2", "17\t29\n")
            database = schema()

            self.assertEqual(
                tatoeba_adapter.import_tatoeba_examples(database, japanese, english, links),
                1,
            )
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

    def test_distinct_semantic_pairs_fail_closed_on_id_collision(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            japanese = compressed(root / "jpn.bz2", "17\tjpn\t猫です。\n18\tjpn\t犬です。\n")
            english = compressed(root / "eng.bz2", "29\teng\tIt is a cat.\n30\teng\tIt is a dog.\n")
            links = compressed(root / "links.bz2", "17\t29\n18\t30\n")
            database = schema()

            with mock.patch.object(
                tatoeba_adapter,
                "app_owned_example_pair_storage_id",
                return_value=b"\0" * 16,
            ):
                with self.assertRaisesRegex(ValueError, "collision"):
                    tatoeba_adapter.import_tatoeba_examples(
                        database, japanese, english, links
                    )
            self.assertEqual(database.execute("SELECT count(*) FROM example_sentences").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
