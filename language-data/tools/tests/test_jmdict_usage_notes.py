import sys
import unittest

from contract_checks import ROOT, SOURCES

sys.path.insert(0, str(ROOT / "language-data/tools"))
from jmdict_normalization import USAGE_NOTES, jmdict_entity_codes, normalize_usage_notes

(EXPORT,) = SOURCES.glob("JMdict_e_examp-*.gz")


class UsageNotesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.codes = jmdict_entity_codes(EXPORT)

    def test_every_note_names_an_entity_the_pinned_export_declares(self) -> None:
        self.assertEqual(set(USAGE_NOTES), set(USAGE_NOTES) & set(self.codes.values()))

    def test_a_meaning_marked_colloquial_shows_the_note_as_jmdict_spells_it_now(self) -> None:
        self.assertEqual("col", self.codes["colloquial"])
        self.assertEqual(["Colloquial"], normalize_usage_notes(["colloquial"], self.codes))

    def test_a_meaning_keeps_each_note_once_in_its_labels_order(self) -> None:
        self.assertEqual(
            ["Humble", "Usually written in kana"],
            normalize_usage_notes(
                ["humble (kenjougo) language", "word usually written using kana alone", "humble (kenjougo) language"],
                self.codes,
            ),
        )


if __name__ == "__main__":
    unittest.main()
