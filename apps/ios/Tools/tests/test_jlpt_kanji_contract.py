import json
import unittest
from collections import Counter

from contract_checks import GENERATED, RESOURCES, SOURCES, sha256

RECORD = SOURCES / "Kanji-JLPT-Waller-2020-08-06.source.json"
KANJI_REFERENCE = RESOURCES / "KanjiReferenceData.json"
KANJIDIC2_REPORT = GENERATED / "KANJIDIC2-2026-10-05.import.json"


class JlptKanjiContractTests(unittest.TestCase):
    def test_each_kanji_has_the_level_wallers_list_gives_it(self) -> None:
        record = json.loads(RECORD.read_text(encoding="utf-8"))
        reference = json.loads(KANJI_REFERENCE.read_text(encoding="utf-8"))
        levels = Counter(
            entry["wallerJlptLevel"]
            for entry in reference["entries"]
            if entry["wallerJlptLevel"] is not None
        )
        self.assertEqual({file["level"]: file["kanji"] for file in record["files"]}, dict(levels))

    def test_the_kanji_reference_records_the_lists_it_was_built_from(self) -> None:
        report = json.loads(KANJIDIC2_REPORT.read_text(encoding="utf-8"))["transform"]
        self.assertEqual(sha256(RECORD), report["jlpt_kanji_levels"]["record_sha256"])
        self.assertEqual(sha256(KANJI_REFERENCE), report["artifact_sha256"])


if __name__ == "__main__":
    unittest.main()
