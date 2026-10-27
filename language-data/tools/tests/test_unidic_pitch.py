from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from contract_checks import FIXTURES, ROOT, unidic_archive

sys.path.insert(0, str(ROOT / "language-data/tools"))
from jmdict_normalization import casefolded_text
from unidic_adapter import apply_unidic_pitch

HOMOPHONE_ROWS = FIXTURES / "unidic-cwj-3.1.0-hashi-kami.csv"
OTHER_PRONUNCIATION_ROWS = FIXTURES / "unidic-cwj-3.1.0-other-pronunciations.csv"
SOURCE = {"identity": "UniDic for Contemporary Written Japanese 3.1.0"}
BRIDGE, CHOPSTICKS, EDGE = 1237410, 1476410, 1581610
PAPER, HAIR, GOD, ABOVE = 1311530, 1477950, 1364440, 1352150
KANA_ONLY_KAMI, PLACE_KAMI = 9000001, 9000002
HOMOPHONES = {
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
KONO_AIDA, MOCHI, MON, AYA, SUMA, MARSH = 1004690, 2577400, 2145190, 2034990, 2865741, 2827028
OTHER_PRONUNCIATIONS = {
    KONO_AIDA: ("この間", "このあいだ", ["この間", "此の間"], ["このあいだ", "このかん"]),
    MOCHI: ("もち", "もち", [], ["もち"]),
    MON: ("文", "もん", ["文"], ["もん"]),
    AYA: ("綾", "あや", ["綾", "文"], ["あや"]),
    SUMA: ("スマ", "スマ", ["須万", "須萬"], ["スマ", "すま"]),
    MARSH: ("マーシュ", "マーシュ", [], ["マーシュ"]),
}


def stored_pitch(lexicon_rows: Path, entries: dict[int, tuple]) -> dict[int, tuple[int, int]]:
    records = [
        {"id": entry_id, "headword": headword, "reading": reading, "written_values": written, "reading_values": readings}
        for entry_id, (headword, reading, written, readings) in entries.items()
    ]
    database = sqlite3.connect(":memory:")
    try:
        database.execute("CREATE TABLE entries (id INTEGER PRIMARY KEY, pitch_accent_json TEXT)")
        database.executemany("INSERT INTO entries (id) VALUES (?)", [(entry_id,) for entry_id in entries])
        with tempfile.TemporaryDirectory() as scratch:
            archive = unidic_archive(lexicon_rows, Path(scratch))
            apply_unidic_pitch(database, records, archive, SOURCE, casefolded_text)
        rows = database.execute("SELECT id, pitch_accent_json FROM entries WHERE pitch_accent_json IS NOT NULL")
        stored_json = dict(rows.fetchall())
    finally:
        database.close()
    pitches = {entry_id: json.loads(pitch_json) for entry_id, pitch_json in stored_json.items()}
    assert {pitch["sourceIdentity"] for pitch in pitches.values()} <= {SOURCE["identity"]}
    return {entry_id: (pitch["downstep"], pitch["moraCount"]) for entry_id, pitch in pitches.items()}


class UniDicPitchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pitch = stored_pitch(HOMOPHONE_ROWS, HOMOPHONES)

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


class OtherPronunciationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pitch = stored_pitch(OTHER_PRONUNCIATION_ROWS, OTHER_PRONUNCIATIONS)

    def test_a_flat_accent_holds_for_the_reading_over_the_morae_it_draws(self) -> None:
        self.assertEqual((0, 5), self.pitch.get(KONO_AIDA))

    def test_a_later_downstep_of_another_pronunciation_gives_the_reading_none(self) -> None:
        self.assertNotIn(MOCHI, self.pitch)

    def test_an_accent_past_its_own_last_mora_is_none_so_the_next_row_gives_it(self) -> None:
        self.assertEqual({MON: (1, 2), AYA: (2, 2)}, {entry_id: self.pitch.get(entry_id) for entry_id in (MON, AYA)})

    def test_the_first_of_several_accents_that_fits_is_taken(self) -> None:
        self.assertEqual((0, 2), self.pitch.get(SUMA))

    def test_a_word_whose_only_accent_lands_past_its_last_mora_has_none(self) -> None:
        self.assertNotIn(MARSH, self.pitch)


if __name__ == "__main__":
    unittest.main()
