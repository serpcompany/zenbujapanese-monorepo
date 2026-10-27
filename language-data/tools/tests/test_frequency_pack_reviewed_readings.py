from __future__ import annotations

import csv
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from contract_checks import ROOT, sha256, unidic_archive

sys.path.insert(0, str(ROOT / "language-data/tools"))
from import_frequency_pack import REVIEWED_READINGS_SCHEMA, source_readings

NOUN = "名詞-普通名詞-一般"
IE, UCHI = b"\x01" * 16, b"\x02" * 16
ENTRIES = ((IE, 1191730, "家", "いえ"), (UCHI, 1191740, "家", "うち"))


def language_data(folder: Path) -> Path:
    path = folder / "LanguageReferenceData.sqlite3"
    database = sqlite3.connect(path)
    database.executescript(
        "CREATE TABLE entries (id BLOB PRIMARY KEY, source_record_id INTEGER, headword TEXT, "
        "reading TEXT, parts_of_speech_json TEXT);"
        "CREATE TABLE forms (entry_id BLOB, form TEXT, kind INTEGER);"
        "CREATE TABLE reading_form_restrictions (entry_id BLOB, reading TEXT, written_form TEXT);"
    )
    database.executemany(
        "INSERT INTO entries VALUES (?, ?, ?, ?, '[\"noun\"]')", ENTRIES
    )
    database.commit()
    database.close()
    return path


def unidic(folder: Path) -> Path:
    lexicon = folder / "lex.csv"
    with lexicon.open("w", encoding="utf-8", newline="") as handle:
        for reading in ("イエ", "ウチ"):
            csv.writer(handle).writerow(["家", 0, 0, 0, "名詞", "普通名詞", "一般", "*", "*", "*", reading, "家"])
    return unidic_archive(lexicon, folder)


def source_row(rank: int, form: str) -> tuple[int, str, int, str, str]:
    return (rank, form, 1000 - rank, NOUN, "{}")


class ReviewedReadingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.language = language_data(self.folder)
        self.unidic = unidic(self.folder)

    def readings(self, rows: list[tuple[int, str, int, str, str]], reviewed: list[dict]) -> list[str]:
        review = self.folder / "reviewed.json"
        review.write_text(json.dumps({"schema": REVIEWED_READINGS_SCHEMA, "rows": reviewed}), encoding="utf-8")
        manifest = {
            "mappingPolicyVersion": 2,
            "readingSource": {"sha256": sha256(self.unidic), "reviewedReadings": str(review)},
        }
        return source_readings(rows, manifest, self.language, self.unidic)

    def test_a_kept_row_takes_its_reading_and_a_row_left_out_none(self) -> None:
        rows = [source_row(1, "家"), source_row(2, "うち")]
        readings = self.readings(rows, [
            {"rank": 1, "form": "家", "pos": NOUN, "reading": "いえ", "entry": 1191730},
            {"rank": 2, "form": "うち", "pos": NOUN, "reading": None, "entry": None},
        ])
        self.assertEqual(["いえ", ""], readings)

    def test_a_row_the_source_numbers_otherwise_is_refused(self) -> None:
        with self.assertRaisesRegex(ValueError, "isn't source row 3"):
            self.readings([source_row(1, "家")], [
                {"rank": 3, "form": "家", "pos": NOUN, "reading": "いえ", "entry": 1191730},
            ])

    def test_a_row_placed_without_the_review_is_refused(self) -> None:
        with self.assertRaisesRegex(ValueError, "placed without its review"):
            self.readings([source_row(1, "うち")], [
                {"rank": 1, "form": "うち", "pos": NOUN, "reading": "うち", "entry": 1191740},
            ])

    def test_a_reading_that_ranks_another_entry_is_refused(self) -> None:
        with self.assertRaisesRegex(ValueError, "doesn't rank JMdict entry 1191740"):
            self.readings([source_row(1, "家")], [
                {"rank": 1, "form": "家", "pos": NOUN, "reading": "いえ", "entry": 1191740},
            ])

    def test_a_reading_that_worsens_an_entrys_rank_is_refused(self) -> None:
        rows = [source_row(1, "いえ"), source_row(2, "家")]
        with self.assertRaisesRegex(ValueError, r"cost the entries ranked \[1\] their rank"):
            self.readings(rows, [
                {"rank": 2, "form": "家", "pos": NOUN, "reading": "いえ", "entry": 1191730},
            ])


if __name__ == "__main__":
    unittest.main()
