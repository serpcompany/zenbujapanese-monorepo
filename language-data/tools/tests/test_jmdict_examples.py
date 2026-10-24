from __future__ import annotations

import gzip
import hashlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from contract_checks import ROOT

sys.path.insert(0, str(ROOT / "language-data/tools"))
from import_jmdict import create_schema
from jmdict_entries import import_entries
from jmdict_examples import (
    check_without_examples,
    link_sense_examples,
    sense_examples,
    without_example_blocks,
)
from jmdict_normalization import language_reference_id, word_note_identity
from jmdict_previous import PreviousDatabase
from jmdict_relationships import assign_note_identities
from tatoeba_adapter import app_owned_example_pair_storage_id

FIXTURES = Path(__file__).with_name("fixtures")
WITH_EXAMPLES = FIXTURES / "jmdict-e-examp-2026-10-23-excerpt.xml"
WITHOUT_EXAMPLES = FIXTURES / "jmdict-e-2026-10-23-excerpt.xml"
CD_PLAYER, KARE, SAE_MO, TANMARI, KAGAKUSHIKI = 1000110, 1483070, 2532990, 2008860, 1186830
FIXTURE_EVIDENCE = {
    "form_priority_profiles": 4,
    "canonical_senses": 6,
    "gloss_atoms": 7,
    "sense_form_restrictions": 0,
    "reading_form_restrictions": 2,
}
BUNDLED_PAIRS = (
    (162365, 252149, "私は、このＣＤプレイヤーをただで得ました。", "I got this CD player for free."),
    (75797, 327921, "彼のスイングは実に見事だ。", "He has a perfect swing."),
    (
        81333,
        322382,
        "毎朝朝食をとっている間、彼の犬は彼をじっと見つめていた。",
        "His dog stared at him every morning while he had his breakfast.",
    ),
    (163186, 251326, "私の前の彼はポルトガル育ちでした。", "My ex-boyfriend was brought up in Portugal."),
    (123363, 280634, "読書をする時間さえもない。", "I have no time even for reading."),
    (143792, 270773, "水の化学式は、Ｈ—Ｏ—Ｈである。", "The chemical formula for water is H-O-H."),
)
ENTRY_TABLES = (
    "entries",
    "forms",
    "form_priority_profiles",
    "canonical_senses",
    "sense_form_restrictions",
    "gloss_atoms",
    "reading_form_restrictions",
)


def pair_id(japanese_id: int) -> bytes:
    _, _, japanese, english = next(pair for pair in BUNDLED_PAIRS if pair[0] == japanese_id)
    return app_owned_example_pair_storage_id(japanese, english)


def entry_id(ent_seq: int) -> bytes:
    return language_reference_id("edrdg.jmdict", str(ent_seq))


class Excerpts:
    def __init__(self, test: unittest.TestCase) -> None:
        self.test = test
        self.directory = tempfile.TemporaryDirectory()
        test.addCleanup(self.directory.cleanup)
        folder = Path(self.directory.name)
        self.with_examples = folder / "JMdict_e_examp.gz"
        self.without_examples = folder / "JMdict_e.gz"
        for fixture, compressed in (
            (WITH_EXAMPLES, self.with_examples),
            (WITHOUT_EXAMPLES, self.without_examples),
        ):
            compressed.write_bytes(gzip.compress(fixture.read_bytes(), mtime=0))

    def imported(self, source: Path) -> tuple[sqlite3.Connection, list[dict[str, object]]]:
        database = sqlite3.connect(":memory:")
        self.test.addCleanup(database.close)
        create_schema(database)
        entries = import_entries(database, source, FIXTURE_EVIDENCE)
        return database, entries.records


def rows(database: sqlite3.Connection, table: str) -> list[tuple[object, ...]]:
    return database.execute(f"SELECT * FROM {table} ORDER BY 1, 2, 3").fetchall()


def add_bundled_pairs(database: sqlite3.Connection) -> None:
    for japanese_id, english_id, japanese, english in BUNDLED_PAIRS:
        stored = app_owned_example_pair_storage_id(japanese, english)
        database.execute("INSERT INTO example_sentences VALUES (?, ?, ?)", (stored, japanese, english))
        database.execute(
            "INSERT INTO example_sentence_provenance VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)",
            (
                stored,
                "tatoeba.weekly-export",
                japanese_id,
                english_id,
                "not-supplied",
                "not-supplied",
                "CC BY 2.0 FR",
                "CC BY 2.0 FR",
                "CC BY 2.0 FR",
                "2026-10-03",
                "0" * 64,
            ),
        )


class ExampleBlockTests(unittest.TestCase):
    def test_removing_the_example_blocks_leaves_the_same_days_export_without_examples(self) -> None:
        stripped = without_example_blocks(WITH_EXAMPLES.read_bytes())
        self.assertEqual(WITHOUT_EXAMPLES.read_bytes(), stripped)

    def test_an_example_tag_inside_the_header_comment_is_not_a_block(self) -> None:
        header_line = b"        Delete <info> and <example> elements. (The <example> element was\n"
        self.assertIn(header_line, WITH_EXAMPLES.read_bytes())
        stripped = without_example_blocks(WITH_EXAMPLES.read_bytes())
        self.assertIn(header_line, stripped)
        self.assertIn(b"<!ELEMENT example (ex_srce,ex_text,ex_sent+)>", stripped)
        self.assertNotIn(b"<ex_srce", stripped)

    def test_the_import_refuses_a_snapshot_that_is_not_its_day_with_examples(self) -> None:
        excerpts = Excerpts(self)
        without = WITHOUT_EXAMPLES.read_bytes()
        recorded = {
            "identity": "JMdict English export",
            "xml_bytes": len(without),
            "xml_sha256": hashlib.sha256(without).hexdigest(),
        }
        check_without_examples(excerpts.with_examples, recorded)
        with self.assertRaises(ValueError):
            check_without_examples(excerpts.with_examples, {**recorded, "xml_sha256": "0" * 64})


class EntriesIgnoreExamplesTests(unittest.TestCase):
    def test_every_entry_row_is_the_same_with_or_without_the_example_blocks(self) -> None:
        excerpts = Excerpts(self)
        with_examples, _ = excerpts.imported(excerpts.with_examples)
        without_examples, _ = excerpts.imported(excerpts.without_examples)
        for table in ENTRY_TABLES:
            self.assertEqual(rows(without_examples, table), rows(with_examples, table), table)
        self.assertEqual(5, len(rows(with_examples, "entries")))


class SenseExampleLinkTests(unittest.TestCase):
    def setUp(self) -> None:
        excerpts = Excerpts(self)
        self.database, _ = excerpts.imported(excerpts.with_examples)
        add_bundled_pairs(self.database)
        self.summary = link_sense_examples(self.database, sense_examples(excerpts.with_examples))

    def linked(self, ent_seq: int) -> list[tuple[int, int, bytes]]:
        return self.database.execute(
            "SELECT sense_order, example_order, pair_id FROM sense_examples "
            "WHERE entry_id = ? ORDER BY sense_order, example_order",
            (entry_id(ent_seq),),
        ).fetchall()

    def test_each_example_is_linked_to_its_own_meaning_in_source_order(self) -> None:
        self.assertEqual([(0, 0, pair_id(162365))], self.linked(CD_PLAYER))
        self.assertEqual(
            [(0, 0, pair_id(75797)), (0, 1, pair_id(81333)), (1, 0, pair_id(163186))],
            self.linked(KARE),
        )

    def test_an_example_whose_pair_differs_or_is_missing_is_counted_and_not_linked(self) -> None:
        self.assertEqual([], self.linked(SAE_MO))
        self.assertEqual([], self.linked(TANMARI))
        self.assertEqual([], self.linked(KAGAKUSHIKI))
        self.assertEqual(
            {
                "english_differs_from_the_bundled_pair": 1,
                "japanese_differs_from_the_bundled_pair": 1,
                "sentence_not_bundled": 1,
            },
            self.summary["unlinked_examples"],
        )
        self.assertEqual(
            (7, 4, 4, 3),
            (
                self.summary["source_examples"],
                self.summary["linked_examples"],
                self.summary["rows"],
                self.summary["senses"],
            ),
        )


class PreviousDatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.excerpts = Excerpts(self)
        self.database, self.records = self.excerpts.imported(self.excerpts.with_examples)

    def identities(self) -> dict[int, str]:
        return dict(self.database.execute("SELECT source_record_id, note_identity FROM entries"))

    def test_an_entry_keeps_its_note_identity_and_a_new_one_never_takes_a_used_one(self) -> None:
        tanmari = next(record for record in self.records if record["source_record_id"] == str(TANMARI))
        computed = word_note_identity(tanmari)
        previous = {
            entry_id(CD_PLAYER): "wn1:saved-by-an-earlier-release",
            entry_id(9_999_999): computed,
        }
        assign_note_identities(self.database, self.records, previous)
        identities = self.identities()
        self.assertEqual("wn1:saved-by-an-earlier-release", identities[CD_PLAYER])
        self.assertEqual(f"{computed}:1", identities[TANMARI])
        kare = next(record for record in self.records if record["source_record_id"] == str(KARE))
        self.assertEqual(word_note_identity(kare), identities[KARE])

    def test_the_row_delta_names_what_was_added_changed_and_deleted(self) -> None:
        assign_note_identities(self.database, self.records, {})
        with tempfile.TemporaryDirectory() as directory:
            earlier = Path(directory) / "Earlier.sqlite3"
            self.database.commit()
            self.database.execute("VACUUM INTO ?", (str(earlier),))
            stored = sqlite3.connect(earlier)
            stored.execute("DELETE FROM entries WHERE source_record_id = ?", (TANMARI,))
            stored.execute("UPDATE entries SET summary = 'earlier' WHERE source_record_id = ?", (KARE,))
            stored.execute(
                "INSERT INTO entries SELECT ?, source_identity, 1000000, 'wn1:gone', headword, reading, "
                "summary, meanings_json, parts_of_speech_json, written_forms_json, reading_forms_json, "
                "senses_json, cross_references_json, relationships_json, pitch_accent_json, gloss_search, "
                "is_common, rank_score, semantic_fingerprint FROM entries WHERE source_record_id = ?",
                (entry_id(1_000_000), CD_PLAYER),
            )
            stored.commit()
            stored.close()
            delta = PreviousDatabase.read(earlier).row_delta(self.database, "unused")
        self.assertEqual(
            (1, 1, 1, [1_000_000]),
            (delta["added"], delta["changed"], delta["deleted"], delta["deleted_source_record_ids"]),
        )


if __name__ == "__main__":
    unittest.main()
