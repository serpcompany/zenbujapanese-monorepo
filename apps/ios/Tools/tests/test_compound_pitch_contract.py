import hashlib
import json
import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
RESOURCES = ROOT / "apps/ios/Modules/Sources/SearchExperience/Resources"
ARTIFACT = RESOURCES / "CompoundPitch.sqlite3"
CATALOG = RESOURCES / "FrequencyPackCatalog.json"
SOURCE_RECORD = ROOT / "apps/ios/LanguageData/Sources/UniDic-CWJ-3.1.0.source.json"
IMPORT_REPORT = ROOT / "apps/ios/LanguageData/Generated/UniDic-CWJ-3.1.0-compound-pitch.import.json"


class CompoundPitchContractTests(unittest.TestCase):
    def test_compound_pitch_matches_the_bundled_language_data_and_its_import_report(self) -> None:
        database = sqlite3.connect(f"file:{ARTIFACT}?mode=ro", uri=True)
        try:
            metadata = dict(database.execute("SELECT key, value FROM metadata"))
        finally:
            database.close()
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        self.assertEqual(
            {metadata["language_data_sha256"]},
            {pack["languageDataSHA256"] for pack in catalog["packs"]},
        )
        self.assertEqual("zenbu.compound-pitch.v1", metadata["artifact_schema"])

        record = json.loads(SOURCE_RECORD.read_text(encoding="utf-8"))
        report = json.loads(IMPORT_REPORT.read_text(encoding="utf-8"))
        self.assertEqual(record["sha256"], metadata["source_sha256"])
        self.assertEqual(record, report["source"])
        self.assertEqual(
            hashlib.sha256(ARTIFACT.read_bytes()).hexdigest(), report["transform"]["artifact_sha256"]
        )


if __name__ == "__main__":
    unittest.main()
