import json
import sqlite3
import sys
import unittest

from contract_checks import (
    GENERATED,
    RESOURCES,
    ROOT,
    SOURCES,
    artifact_metadata,
    assert_built_from_its_source,
)

sys.path.insert(0, str(ROOT / "apps/ios/Tools"))
import import_example_word_index as importer

(SOURCE_RECORD,) = SOURCES.glob("Tatoeba-jpn-indices-*.source.json")
IMPORT_REPORT = GENERATED / SOURCE_RECORD.name.replace(".source.json", ".import.json")
WORD_INDEX = RESOURCES / "ExampleWordIndex.sqlite3"
ENTRIES_EXAMPLES_USE = {
    "pen": {"ペン"},
    "head": {"頭"},
    "meat": {"肉"},
    "open": {"開ける", "開く"},
    "have": {"持つ", "有る"},
    "station": {"駅"},
    "home": {"家"},
    "money": {"お金", "金"},
    "time": {"時間", "時"},
    "car": {"車"},
    "key": {"鍵"},
    "dinner": {"夕食", "晩御飯"},
    "book": {"本"},
    "cat": {"猫"},
    "went": {"行く"},
    "ate": {"食べる"},
    "saw": {"見る"},
    "bought": {"買う"},
    "it": {"それ"},
}
WORDS_WITHOUT_AN_ENTRY = ("a", "an", "the", "of")


class ExampleWordIndexContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.database = sqlite3.connect(
            f"file:{RESOURCES / 'LanguageReferenceData.sqlite3'}?mode=ro", uri=True
        )
        cls.addClassCleanup(cls.database.close)
        cls.database.execute(f"ATTACH DATABASE 'file:{WORD_INDEX}?mode=ro' AS word_index")
        cls.rows = cls.database.execute(
            "SELECT word, place, entry_id, pairs_with_both, pairs_with_word, pairs_with_entry, "
            "meant_in_sense FROM word_index.english_word_entries ORDER BY word, place"
        ).fetchall()

    def test_word_index_matches_the_bundled_language_data_and_its_import_report(self) -> None:
        assert_built_from_its_source(
            self, WORD_INDEX, importer.ARTIFACT_SCHEMA, SOURCE_RECORD, IMPORT_REPORT
        )

    def test_the_import_report_counts_the_english_words_and_their_entries(self) -> None:
        transform = json.loads(IMPORT_REPORT.read_text(encoding="utf-8"))["transform"]
        metadata = artifact_metadata(WORD_INDEX)
        self.assertEqual(transform["english_word_entry_rows"], len(self.rows))
        self.assertEqual(transform["english_words_with_entries"], len({row[0] for row in self.rows}))
        self.assertEqual(str(transform["annotated_pairs"]), metadata["annotated_pairs"])
        self.assertEqual(str(importer.ENTRIES_PER_WORD), metadata["entries_per_word"])

    def test_each_english_word_lists_up_to_three_entries_from_its_best(self) -> None:
        places: dict[str, list[int]] = {}
        for word, place, *_ in self.rows:
            places.setdefault(word, []).append(place)
        for word, listed in places.items():
            self.assertEqual(listed, list(range(len(listed))), word)
            self.assertLessEqual(len(listed), importer.ENTRIES_PER_WORD, word)
            self.assertEqual({word}, importer.english_words(word))

    def test_every_listed_entry_is_one_a_search_lists_and_was_counted_often_enough(self) -> None:
        pairs = int(artifact_metadata(WORD_INDEX)["annotated_pairs"])
        listed = dict(
            self.database.execute(
                "SELECT id, (SELECT min(same.id) FROM entries same "
                "WHERE same.semantic_fingerprint = entries.semantic_fingerprint) FROM entries"
            )
        )
        for word, _, entry, both, with_word, with_entry, sense in self.rows:
            self.assertEqual(listed.get(entry), entry, word)
            self.assertTrue(
                importer.is_kept(both, with_word, with_entry, pairs, sense is not None), word
            )

    def test_the_words_the_table_was_tuned_on_list_the_entry_their_examples_use(self) -> None:
        first = dict(
            self.database.execute(
                "SELECT w.word, e.headword FROM word_index.english_word_entries w "
                "JOIN entries e ON e.id = w.entry_id WHERE w.place = 0"
            )
        )
        for word, headwords in ENTRIES_EXAMPLES_USE.items():
            self.assertIn(first.get(word), headwords, word)
        for word in WORDS_WITHOUT_AN_ENTRY:
            self.assertNotIn(word, first)


if __name__ == "__main__":
    unittest.main()
