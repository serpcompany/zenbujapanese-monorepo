from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from contract_checks import FIXTURES, ROOT, unidic_archive

sys.path.insert(0, str(ROOT / "language-data/tools"))
from jmdict_normalization import normalized_text
from unidic_adapter import apply_unidic_pitch

LEXICON_ROWS = FIXTURES / "unidic-cwj-3.1.0-hashi-kami.csv"
SOURCE = {"identity": "UniDic for Contemporary Written Japanese 3.1.0"}
BRIDGE, CHOPSTICKS, EDGE = 1237410, 1476410, 1581610
PAPER, HAIR, GOD, ABOVE = 1311530, 1477950, 1364440, 1352150
KANA_ONLY_KAMI, PLACE_KAMI = 9000001, 9000002
ENTRIES = {
    BRIDGE: ("橋", "はし", ["橋"], ["はし"]),
    CHOPSTICKS: ("箸", "はし", ["箸"], ["はし"]),
    EDGE: ("端", "はし", ["端"], ["はし", "はじ", "はな"]),
    PAPER: ("紙", "かみ", ["紙"], ["かみ"]),
    HAIR: ("髪", "かみ", ["髪", "髮"], ["かみ"]),
    GOD: ("神", "かみ", ["神"], ["かみ"]),
    ABOVE: ("上", "かみ", ["上"], ["かみ"]),
    KANA_ONLY_KAMI: ("かみ", "かみ", [], ["かみ"]),
    PLACE_KAMI: ("加美", "かみ", ["加美"], ["かみ"]),
}


def stored_pitch() -> dict[int, tuple[int, int]]:
    records = [
        {"id": entry_id, "headword": headword, "reading": reading, "written_values": written, "reading_values": readings}
        for entry_id, (headword, reading, written, readings) in ENTRIES.items()
    ]
    database = sqlite3.connect(":memory:")
    try:
        database.execute("CREATE TABLE entries (id INTEGER PRIMARY KEY, pitch_accent_json TEXT)")
        database.executemany("INSERT INTO entries (id) VALUES (?)", [(entry_id,) for entry_id in ENTRIES])
        with tempfile.TemporaryDirectory() as scratch:
            archive = unidic_archive(LEXICON_ROWS, Path(scratch))
            apply_unidic_pitch(database, records, archive, SOURCE, normalized_text)
        rows = database.execute("SELECT id, pitch_accent_json FROM entries WHERE pitch_accent_json IS NOT NULL")
        stored_json = dict(rows.fetchall())
    finally:
        database.close()
    pitches = {entry_id: json.loads(pitch_json) for entry_id, pitch_json in stored_json.items()}
    assert {pitch["sourceIdentity"] for pitch in pitches.values()} == {SOURCE["identity"]}
    return {entry_id: (pitch["downstep"], pitch["moraCount"]) for entry_id, pitch in pitches.items()}


class UniDicPitchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pitch = stored_pitch()

    def test_each_hashi_homophone_takes_its_own_words_accent(self) -> None:
        self.assertEqual(
            {BRIDGE: (2, 2), CHOPSTICKS: (1, 2), EDGE: (0, 2)},
            {entry_id: self.pitch.get(entry_id) for entry_id in (BRIDGE, CHOPSTICKS, EDGE)},
        )

    def test_paper_and_hair_keep_their_odaka_beside_god(self) -> None:
        self.assertEqual(
            {PAPER: (2, 2), HAIR: (2, 2), GOD: (1, 2)},
            {entry_id: self.pitch.get(entry_id) for entry_id in (PAPER, HAIR, GOD)},
        )

    def test_a_proper_noun_spelled_like_a_common_word_never_overrides_it(self) -> None:
        self.assertEqual((1, 2), self.pitch.get(ABOVE))

    def test_a_place_spelled_only_as_a_proper_noun_takes_that_nouns_accent(self) -> None:
        self.assertEqual((0, 2), self.pitch.get(PLACE_KAMI))

    def test_a_kana_spelling_shared_by_several_words_gives_none_of_their_accents(self) -> None:
        self.assertNotIn(KANA_ONLY_KAMI, self.pitch)


if __name__ == "__main__":
    unittest.main()
