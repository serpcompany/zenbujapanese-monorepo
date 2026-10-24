from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from contract_checks import FIXTURES, ROOT, unidic_archive

sys.path.insert(0, str(ROOT / "language-data/tools"))
from compound_accent import (
    CompoundEstimate,
    CompoundSplitter,
    compound_downstep,
    lexicon_parts,
    off_special_morae,
    two_part_c2_downstep,
    two_part_lexemes,
)
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
    1198560: ("会社員", "かいしゃいん", NOUN, None),
    1146200: ("レンタルビデオ", "レンタルビデオ", NOUN, None),
    1172980: ("運動不足", "うんどうぶそく", ["noun", "noAdjective"], None),
    2011360: ("少人数", "しょうにんずう", ["noun", "noAdjective"], None),
    1500400: ("副作用", "ふくさよう", NOUN, None),
    1484370: ("被害者", "ひがいしゃ", NOUN, None),
    1461820: ("二酸化炭素", "にさんかたんそ", NOUN, None),
    1156120: ("委員長", "いいんちょう", NOUN, None),
    1283510: ("高校生", "こうこうせい", NOUN, None),
    1215880: ("関心事", "かんしんじ", NOUN, None),
    1336180: ("重工業", "じゅうこうぎょう", NOUN, None),
    1767840: ("私生児", "しせいじ", NOUN, None),
    1824520: ("選挙運動", "せんきょうんどう", NOUN, None),
    1214870: ("観光客", "かんこうきゃく", NOUN, None),
    1191080: ("可能性", "かのうせい", NOUN, None),
    1324880: ("弱肉強食", "じゃくにくきょうしょく", NOUN, ["yojijukugo"]),
    1361030: ("心理学的", "しんりがくてき", ["naAdjective"], None),
    1597010: ("立ち入り禁止", "たちいりきんし", ["expression", "noAdjective", "noun"], None),
    1264890: ("個人的", "こじんてき", ["naAdjective"], None),
    2215430: ("には", "には", ["expression", "particle"], None),
    1194290: ("火曜日", "かようび", ["noun", "adverb"], None),
    1347870: ("小学校", "しょうがっこう", NOUN, None),
    1188950: ("何時間", "なんじかん", ["expression"], None),
    1408090: ("多目的", "たもくてき", ["naAdjective"], None),
    1534350: ("盲目的", "もうもくてき", ["naAdjective"], None),
}
WORD_WITH_ITS_OWN_PITCH = (1534340, ("盲目", "もうもく", ["noun", "noAdjective", "naAdjective"], None))
OWN_PITCH = json.dumps({"downstep": 0, "moraCount": 4, "sourceIdentity": "UniDic"})
READING = {headword: reading for headword, reading, *_ in ENTRIES.values()}


def sense(parts_of_speech: list[str], usage: list[str] | None) -> dict:
    return {"partsOfSpeech": parts_of_speech, **({"usage": usage} if usage else {})}


def entry_row(entry_id: int, entry: tuple, pitch: str | None) -> tuple:
    headword, reading, pos, usage = entry
    written = json.dumps([{"value": headword}])
    return entry_id, headword, reading, written, json.dumps(pos), json.dumps([sense(pos, usage)]), pitch


def language_data(folder: Path) -> Path:
    path = folder / "LanguageReferenceData.sqlite3"
    database = sqlite3.connect(path)
    try:
        database.execute(
            "CREATE TABLE entries (id INTEGER PRIMARY KEY, headword TEXT, reading TEXT, written_forms_json TEXT, "
            "is_common INTEGER, parts_of_speech_json TEXT, senses_json TEXT, pitch_accent_json TEXT)"
        )
        database.executemany(
            "INSERT INTO entries VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
            [entry_row(entry_id, entry, None) for entry_id, entry in ENTRIES.items()]
            + [entry_row(*WORD_WITH_ITS_OWN_PITCH, OWN_PITCH)],
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
            cls.lexemes = two_part_lexemes(lexicon_rows(archive))
            output = folder / "CompoundPitch.sqlite3"
            cls.report = import_pitch(archive, {"sha256": file_sha256(archive)}, language_data(folder), output)
            cls.pitch = stored_pitch(output)

    def downsteps(self, *words: str) -> dict[str, int | None]:
        return {word: self.pitch.get(word, (None,))[0] for word in words}

    def estimate(self, headword: str) -> CompoundEstimate | None:
        return self.splitter.estimate(headword, READING[headword])

    def c2_downstep(self, headword: str) -> int | None:
        return two_part_c2_downstep(headword, READING[headword], self.lexemes)

    def test_each_combination_type_gives_the_downstep_its_rule_does(self) -> None:
        self.assertEqual(
            {
                "運転免許": 5, "万葉仮名": 0, "株式会社": 5, "洗濯物": 0, "少林寺拳法": 6,
                "クレジットカード": 6, "レンタルビデオ": 5, "押し問答": 3,
            },
            self.downsteps(
                "運転免許", "万葉仮名", "株式会社", "洗濯物", "少林寺拳法", "クレジットカード", "レンタルビデオ", "押し問答"
            ),
        )

    def test_suffix_rows_and_rendaku_forms_count_as_parts(self) -> None:
        self.assertEqual({"警察官": 4, "会社員": 3, "運動不足": 5}, self.downsteps("警察官", "会社員", "運動不足"))

    def test_a_prefix_combines_by_its_own_type(self) -> None:
        self.assertEqual({"少人数": 3, "副作用": 3}, self.downsteps("少人数", "副作用"))

    def test_three_parts_combine_left_to_right(self) -> None:
        self.assertEqual((5, 7), self.pitch.get("二酸化炭素"))

    def test_the_downstep_moves_off_a_special_mora_but_stays_within_a_part(self) -> None:
        committee = self.splitter.fewest_part_splits("委員長", READING["委員長"])[0]
        concern = self.splitter.fewest_part_splits("関心事", READING["関心事"])[0]
        self.assertEqual((2, 3), (off_special_morae(committee, 3), off_special_morae(concern, 4)))
        self.assertEqual(
            {"委員長": 2, "高校生": 3, "被害者": 2, "関心事": 3, "重工業": 3, "私生児": 2, "選挙運動": 4},
            self.downsteps("委員長", "高校生", "被害者", "関心事", "重工業", "私生児", "選挙運動"),
        )

    def test_a_split_that_gives_no_downstep_is_left_out_and_the_others_decide(self) -> None:
        for headword, downstep in (("クレジットカード", 6), ("洗濯物", 0)):
            with self.subTest(headword=headword):
                splits = self.splitter.fewest_part_splits(headword, READING[headword])
                self.assertEqual({downstep, None}, {compound_downstep(split) for split in splits})
                self.assertEqual(downstep, self.estimate(headword).downstep)
                self.assertEqual(downstep, self.downsteps(headword)[headword])

    def test_the_gate_leaves_out_estimates_in_groups_below_ninety_percent(self) -> None:
        for headword, downstep, group in (
            ("観光客", 3, "kanji, C3, 2 parts"),
            ("可能性", 0, "kanji, C4, 2 parts"),
        ):
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

    def test_where_the_rule_gives_none_a_two_part_c2_compound_keeps_c2s_downstep(self) -> None:
        self.assertEqual("kanji, C2/C3, 2 parts", self.estimate("火曜日").group.label())
        self.assertNotIn(self.estimate("火曜日").group, SHIPPED_GROUPS)
        self.assertIsNone(self.estimate("小学校"))
        self.assertEqual({"火曜日": 2, "小学校": 3}, self.downsteps("火曜日", "小学校"))

    def test_the_fallback_leaves_out_what_the_rule_does(self) -> None:
        for headword in ("何時間", "弱肉強食", "個人的"):
            with self.subTest(headword=headword):
                self.assertIsNotNone(self.c2_downstep(headword))
                self.assertNotIn(headword, self.pitch)

    def test_the_suffix_teki_is_left_out_but_the_noun_mokuteki_is_not(self) -> None:
        self.assertEqual({"多目的": 2, "盲目的": None, "心理学的": None}, self.downsteps("多目的", "盲目的", "心理学的"))
        self.assertIsNotNone(self.c2_downstep("盲目的"))

    def test_a_word_whose_splits_disagree_and_a_particle_get_no_estimate(self) -> None:
        self.assertEqual({"個人的": None, "には": None}, {word: self.estimate(word) for word in ("個人的", "には")})
        self.assertEqual({"個人的": None, "には": None}, self.downsteps("個人的", "には"))

    def test_the_report_counts_what_each_step_left_out(self) -> None:
        self.assertEqual(
            {
                "estimated": 22,
                "estimated_by_the_c2_fallback": 2,
                "estimated_in_a_group_below_the_gate": 2,
                "left_out_as_a_four_character_idiom": 1,
                "left_out_as_ending_in_the_suffix_teki": 3,
                "left_out_as_listed_first_as_a_function_word_or_affix": 2,
                "no_estimate": 1,
            },
            {outcome: count for outcome, count in self.report["outcomes"].items() if not outcome.startswith("common_")},
        )
        self.assertEqual(24, len(self.pitch))


if __name__ == "__main__":
    unittest.main()
