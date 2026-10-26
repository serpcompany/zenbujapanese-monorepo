import sys
import unittest

from contract_checks import ROOT

sys.path.insert(0, str(ROOT / "language-data/tools"))
from jmdict_normalization import FORM_KIND_ROMAJI, FORM_KIND_SHOWN_ROMAJI, FORM_KIND_UNMARKED_ROMAJI
from jmdict_romaji import core_search_forms

DIGIT_KANA = "かきくけこさしすせそ"
DIGIT_ROMAJI = ("ka", "ki", "ku", "ke", "ko", "sa", "shi", "su", "se", "so")


class CoreSearchFormsTests(unittest.TestCase):
    def test_every_reading_and_text_of_a_batch_larger_than_a_pipe_reaches_the_core_whole(self) -> None:
        numbers = [str(number) for number in range(30_000)]
        readings = [("".join(DIGIT_KANA[int(digit)] for digit in number),) for number in numbers]
        texts = [f"Gloss {number}" for number in numbers]
        forms = core_search_forms(readings, texts)
        for number, reading in zip(numbers, readings, strict=True):
            spelled = "".join(DIGIT_ROMAJI[int(digit)] for digit in number)
            self.assertEqual([(spelled, FORM_KIND_ROMAJI)], forms.romaji[reading], reading)
            self.assertEqual(f"gloss {number}", forms.fold(f"Gloss {number}"))

    def test_labels_the_ascii_spelling_the_shown_romaji_and_that_romaji_without_macrons(self) -> None:
        self.assertEqual(
            {
                ("ラーメン", "らーめん"): [
                    ("raamen", FORM_KIND_ROMAJI),
                    ("rāmen", FORM_KIND_SHOWN_ROMAJI),
                    ("ramen", FORM_KIND_UNMARKED_ROMAJI),
                ],
                ("きんえん",): [("kinen", FORM_KIND_ROMAJI), ("kin'en", FORM_KIND_SHOWN_ROMAJI)],
            },
            core_search_forms([("ラーメン", "らーめん"), ("きんえん",)], []).romaji,
        )

    def test_a_form_and_a_gloss_are_stored_as_the_core_folds_a_query_not_as_python_casefolds(self) -> None:
        forms = core_search_forms([], ["ς", "Σ", "Ein Musikalischer Spaß (Mozart)", "ＡＢＣ　 ｶﾞ"])
        self.assertEqual(
            ["ς", "σ", "ein musikalischer spaß (mozart)", "abc ガ"],
            [forms.fold(text) for text in ("ς", "Σ", "Ein Musikalischer Spaß (Mozart)", "ＡＢＣ　 ｶﾞ")],
        )

    def test_a_text_the_import_never_handed_the_core_fails_rather_than_being_stored_unfolded(self) -> None:
        with self.assertRaisesRegex(ValueError, "never folded"):
            core_search_forms([], ["Spaß"]).fold("SPASS")


if __name__ == "__main__":
    unittest.main()
