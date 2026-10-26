import sys
import unittest

from contract_checks import ROOT

sys.path.insert(0, str(ROOT / "language-data/tools"))
from jmdict_normalization import FORM_KIND_ROMAJI, FORM_KIND_SHOWN_ROMAJI, FORM_KIND_UNMARKED_ROMAJI
from jmdict_romaji import core_romaji_search_forms

DIGIT_KANA = "かきくけこさしすせそ"
DIGIT_ROMAJI = ("ka", "ki", "ku", "ke", "ko", "sa", "shi", "su", "se", "so")


class CoreRomajiSearchFormsTests(unittest.TestCase):
    def test_every_reading_of_a_batch_larger_than_a_pipe_reaches_the_core_whole(self) -> None:
        numbers = [str(number) for number in range(30_000)]
        readings = [("".join(DIGIT_KANA[int(digit)] for digit in number),) for number in numbers]
        forms = core_romaji_search_forms(readings)
        for number, reading in zip(numbers, readings, strict=True):
            spelled = "".join(DIGIT_ROMAJI[int(digit)] for digit in number)
            self.assertEqual([(spelled, FORM_KIND_ROMAJI)], forms[reading], reading)

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
            core_romaji_search_forms([("ラーメン", "らーめん"), ("きんえん",)]),
        )


if __name__ == "__main__":
    unittest.main()
