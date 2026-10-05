import hashlib
import json
import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
RESOURCES = ROOT / "apps/ios/Modules/Sources/SearchExperience/Resources"
WORD_INDEX = RESOURCES / "ExampleWordIndex.sqlite3"
CATALOG = RESOURCES / "FrequencyPackCatalog.json"
(SOURCE_RECORD,) = (ROOT / "apps/ios/LanguageData/Sources").glob("Tatoeba-jpn-indices-*.source.json")
IMPORT_REPORT = ROOT / "apps/ios/LanguageData/Generated" / SOURCE_RECORD.name.replace(".source.json", ".import.json")


class ExampleWordIndexContractTests(unittest.TestCase):
    def test_word_index_matches_the_bundled_language_data_and_its_import_report(self) -> None:
        database = sqlite3.connect(f"file:{WORD_INDEX}?mode=ro", uri=True)
        try:
            metadata = dict(database.execute("SELECT key, value FROM metadata"))
        finally:
            database.close()
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        language_data_hashes = {pack["languageDataSHA256"] for pack in catalog["packs"]}
        self.assertEqual({metadata["language_data_sha256"]}, language_data_hashes)
        self.assertEqual("zenbu.example-word-index.v1", metadata["artifact_schema"])

        record = json.loads(SOURCE_RECORD.read_text(encoding="utf-8"))
        report = json.loads(IMPORT_REPORT.read_text(encoding="utf-8"))
        self.assertEqual(record["sha256"], metadata["source_sha256"])
        self.assertEqual(record, report["source"])
        self.assertEqual(sha256(WORD_INDEX), report["transform"]["artifact_sha256"])


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    unittest.main()
