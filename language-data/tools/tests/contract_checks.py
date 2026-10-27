import hashlib
import json
import sqlite3
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RESOURCES = ROOT / "apps/ios/Modules/Sources/SearchExperience/Resources"
CATALOG = RESOURCES / "FrequencyPackCatalog.json"
GENERATED = ROOT / "language-data/generated"
SOURCES = ROOT / "language-data/sources"
FIXTURES = Path(__file__).with_name("fixtures")


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


def unidic_archive(lexicon_rows: Path, folder: Path) -> Path:
    archive = folder / "unidic-cwj-3.1.0.zip"
    with zipfile.ZipFile(archive, "w") as lexicon:
        lexicon.write(lexicon_rows, "unidic-cwj-3.1.0/lex_3_1.csv")
    return archive
