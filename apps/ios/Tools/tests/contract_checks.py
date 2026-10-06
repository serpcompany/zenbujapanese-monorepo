import hashlib
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
RESOURCES = ROOT / "apps/ios/Modules/Sources/SearchExperience/Resources"
CATALOG = RESOURCES / "FrequencyPackCatalog.json"
GENERATED = ROOT / "apps/ios/LanguageData/Generated"
SOURCES = ROOT / "apps/ios/LanguageData/Sources"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def artifact_metadata(artifact: Path) -> dict[str, str]:
    database = sqlite3.connect(f"file:{artifact}?mode=ro", uri=True)
    try:
        return dict(database.execute("SELECT key, value FROM metadata"))
    finally:
        database.close()


def assert_built_from_its_source(
    test: unittest.TestCase, artifact: Path, schema: str, source_record: Path, import_report: Path
) -> None:
    metadata = artifact_metadata(artifact)
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    test.assertEqual(
        {metadata["language_data_sha256"]},
        {pack["languageDataSHA256"] for pack in catalog["packs"]},
    )
    test.assertEqual(schema, metadata["artifact_schema"])
    record = json.loads(source_record.read_text(encoding="utf-8"))
    report = json.loads(import_report.read_text(encoding="utf-8"))
    test.assertEqual(record["sha256"], metadata["source_sha256"])
    test.assertEqual(record, report["source"])
    test.assertEqual(sha256(artifact), report["transform"]["artifact_sha256"])
