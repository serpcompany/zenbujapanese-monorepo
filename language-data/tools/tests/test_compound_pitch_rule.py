from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from contract_checks import FIXTURES, ROOT, unidic_archive

sys.path.insert(0, str(ROOT / "language-data/tools"))
from compound_accent import CompoundEstimate, CompoundSplitter, lexicon_parts, off_special_morae
from import_compound_pitch import SHIPPED_GROUPS, SOURCE_IDENTITY, import_pitch
from language_data_tools import file_sha256
from unidic_adapter import lexicon_rows

LEXICON_ROWS = FIXTURES / "unidic-cwj-3.1.0-compound-parts.csv"
NOUN = ["noun"]
ENTRIES = {
    1208980: ("株式会社", "かぶしきがいしゃ", NOUN, None),
    1172900: ("運転免許", "うんてんめんきょ", NOUN, None),
    1526540: ("万葉仮名", "まんようがな", NOUN, None),
    1045340: ("クレジットカード", "クレジットカード", NOUN, None),
    1180420: ("押し問答", "おしもんどう", ["noun", "takesSuru", "intransitive"], None),
    1391020: ("洗濯物", "せんたくもの", NOUN, None),
    2211340: ("少林寺拳法", "しょうりんじけんぽう", NOUN, None),
    1252400: ("警察官", "けいさつかん", NOUN, None),
    1172980: ("運動不足", "うんどうぶそく", ["noun", "noAdjective"], None),
    2011360: ("少人数", "しょうにんずう", ["noun", "noAdjective"], None),
    1500400: ("副作用", "ふくさよう", NOUN, None),
    1484370: ("被害者", "ひがいしゃ", NOUN, None),
    1461820: ("二酸化炭素", "にさんかたんそ", NOUN, None),
    1156120: ("委員長", "いいんちょう", NOUN, None),
    1283510: ("高校生", "こうこうせい", NOUN, None),
    1824520: ("選挙運動", "せんきょうんどう", NOUN, None),
    1214870: ("観光客", "かんこうきゃく", NOUN, None),
    1191080: ("可能性", "かのうせい", NOUN, None),
    1324880: ("弱肉強食", "じゃくにくきょうしょく", NOUN, ["yojijukugo"]),
    1361030: ("心理学的", "しんりがくてき", ["naAdjective"], None),
    1597010: ("立ち入り禁止", "たちいりきんし", ["expression", "noAdjective", "noun"], None),
    1264890: ("個人的", "こじんてき", ["naAdjective"], None),
    2215430: ("には", "には", ["expression", "particle"], None),
}
READING = {headword: reading for headword, reading, *_ in ENTRIES.values()}


def sense(parts_of_speech: list[str], usage: list[str] | None) -> dict:
    return {"partsOfSpeech": parts_of_speech, **({"usage": usage} if usage else {})}


def language_data(folder: Path) -> Path:
    path = folder / "LanguageReferenceData.sqlite3"
    database = sqlite3.connect(path)
    try:
        database.execute(
            "CREATE TABLE entries (id INTEGER PRIMARY KEY, headword TEXT, reading TEXT, is_common INTEGER, "
            "parts_of_speech_json TEXT, senses_json TEXT, pitch_accent_json TEXT)"
        )
        database.executemany(
            "INSERT INTO entries VALUES (?, ?, ?, 1, ?, ?, NULL)",
            [
                (entry_id, headword, reading, json.dumps(pos), json.dumps([sense(pos, usage)]))
                for entry_id, (headword, reading, pos, usage) in ENTRIES.items()
            ],
        )
        database.commit()
    finally:
        database.close()
    return path


def stored_pitch(artifact: Path) -> dict[str, tuple[int, int]]:
    database = sqlite3.connect(artifact)
    try:
        stored = dict(database.execute("SELECT entry_id, pitch_accent_json FROM entry_pitch"))
    finally:
        database.close()
    pitches = {ENTRIES[entry_id][0]: json.loads(pitch) for entry_id, pitch in stored.items()}
    assert {pitch["sourceIdentity"] for pitch in pitches.values()} == {SOURCE_IDENTITY}
    return {word: (pitch["downstep"], pitch["moraCount"]) for word, pitch in pitches.items()}


class CompoundPitchRuleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            folder = Path(scratch)
            archive = unidic_archive(LEXICON_ROWS, folder)
            cls.splitter = CompoundSplitter(lexicon_parts(lexicon_rows(archive)))
            output = folder / "CompoundPitch.sqlite3"
            cls.report = import_pitch(archive, {"sha256": file_sha256(archive)}, language_data(folder), output)
            cls.pitch = stored_pitch(output)

    def downsteps(self, *words: str) -> dict[str, int | None]:
        return {word: self.pitch.get(word, (None,))[0] for word in words}

    def estimate(self, headword: str) -> CompoundEstimate | None:
        return self.splitter.estimate(headword, READING[headword])

    def test_each_combination_type_gives_the_downstep_its_rule_does(self) -> None:
        self.assertEqual(
            {"運転免許": 5, "万葉仮名": 0, "株式会社": 5, "洗濯物": 0, "少林寺拳法": 6, "クレジットカード": 6, "押し問答": 3},
            self.downsteps("運転免許", "万葉仮名", "株式会社", "洗濯物", "少林寺拳法", "クレジットカード", "押し問答"),
        )

    def test_suffix_rows_and_rendaku_forms_count_as_parts(self) -> None:
        self.assertEqual({"警察官": 4, "運動不足": 5}, self.downsteps("警察官", "運動不足"))

    def test_a_prefix_combines_by_its_own_type(self) -> None:
        self.assertEqual({"少人数": 3, "副作用": 3}, self.downsteps("少人数", "副作用"))

    def test_three_parts_combine_left_to_right(self) -> None:
        self.assertEqual((5, 7), self.pitch.get("二酸化炭素"))

    def test_the_downstep_moves_off_a_special_mora_but_stays_within_a_part(self) -> None:
        committee = self.splitter.fewest_part_splits("委員長", READING["委員長"])[0]
        self.assertEqual(2, off_special_morae(committee, 3))
        self.assertEqual(
            {"委員長": 2, "高校生": 3, "被害者": 2, "選挙運動": 4},
            self.downsteps("委員長", "高校生", "被害者", "選挙運動"),
        )

    def test_the_gate_leaves_out_estimates_in_groups_below_ninety_percent(self) -> None:
        for headword, downstep, group in (("観光客", 3, "kanji, C3, 2 parts"), ("可能性", 0, "kanji, C4, 2 parts")):
            with self.subTest(headword=headword):
                estimate = self.estimate(headword)
                self.assertEqual((downstep, group), (estimate.downstep, estimate.group.label()))
                self.assertNotIn(estimate.group, SHIPPED_GROUPS)
                self.assertNotIn(headword, self.pitch)

    def test_idioms_words_ending_in_teki_and_expressions_get_none_where_the_gate_would_ship_one(self) -> None:
        for headword in ("弱肉強食", "心理学的", "立ち入り禁止"):
            with self.subTest(headword=headword):
                self.assertIn(self.estimate(headword).group, SHIPPED_GROUPS)
                self.assertNotIn(headword, self.pitch)

    def test_a_word_whose_splits_disagree_and_a_particle_get_no_estimate(self) -> None:
        self.assertEqual({"個人的": None, "には": None}, {word: self.estimate(word) for word in ("個人的", "には")})
        self.assertEqual({"個人的": None, "には": None}, self.downsteps("個人的", "には"))

    def test_the_report_counts_what_each_step_left_out(self) -> None:
        self.assertEqual(
            {
                "estimated": 16,
                "estimated_in_a_group_below_the_gate": 2,
                "left_out_as_a_four_character_idiom": 1,
                "left_out_as_ending_in_teki": 1,
                "left_out_as_listed_first_as_a_function_word_or_affix": 1,
                "no_estimate": 2,
            },
            {outcome: count for outcome, count in self.report["outcomes"].items() if not outcome.startswith("common_")},
        )
        self.assertEqual(16, len(self.pitch))


if __name__ == "__main__":
    unittest.main()
