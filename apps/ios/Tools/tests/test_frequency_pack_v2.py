from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import export_jpdb_frequency_pack  # noqa: E402
import import_frequency_pack  # noqa: E402


class FrequencyPackV2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.jpdb = self.root / "JPDB.sqlite"
        database = sqlite3.connect(self.jpdb)
        try:
            database.executescript(
                "CREATE TABLE vocabulary(id INTEGER PRIMARY KEY,upstream_vid INTEGER UNIQUE NOT NULL);"
                "CREATE TABLE frequencies(vocabulary_id INTEGER NOT NULL,corpus TEXT NOT NULL,rank INTEGER NOT NULL);"
            )
            database.executemany(
                "INSERT INTO vocabulary VALUES (?,?)", [(1, 100), (2, 200), (3, 300)]
            )
            database.executemany(
                "INSERT INTO frequencies VALUES (?,'global',?)", [(1, 1), (2, 1), (3, 3)]
            )
            database.commit()
        finally:
            database.close()
        self.language = self.root / "LanguageReference.sqlite"
        database = sqlite3.connect(self.language)
        try:
            database.execute(
                "CREATE TABLE entries(id BLOB PRIMARY KEY,source_identity TEXT NOT NULL,"
                "source_record_id INTEGER NOT NULL,headword TEXT NOT NULL)"
            )
            database.executemany(
                "INSERT INTO entries VALUES (?,?,?,?)",
                [
                    (bytes.fromhex("00" * 15 + "01"), "edrdg.jmdict", 100, "一"),
                    (bytes.fromhex("00" * 15 + "02"), "edrdg.jmdict", 200, "二"),
                ],
            )
            database.commit()
        finally:
            database.close()
        self.authorization = self.root / "authorization.json"
        self.authorization.write_text(
            json.dumps({"scope": "Internal evaluation", "redistributionAllowed": False}),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def export(self, prefix: str) -> tuple[Path, Path, Path]:
        source = self.root / f"{prefix}.tsv.xz"
        manifest = self.root / f"{prefix}.source.json"
        draft = self.root / f"{prefix}.catalog-draft.json"
        export_jpdb_frequency_pack.export(
            argparse.Namespace(
                jpdb_sqlite=self.jpdb,
                input_tsv=None,
                corpus="global",
                pack_id="zenbu.jpdb.global.ja",
                pack_version="fixture",
                display_name="JPDB Global",
                domain="mixed.jpdb",
                domain_description="JPDB indexed public media corpus.",
                source_identity="JPDB global rank",
                source_snapshot="fixture-snapshot",
                retrieved_at="2026-09-25",
                total_tokens=None,
                authorization=self.authorization,
                output_source=source,
                output_manifest=manifest,
                output_catalog_draft=draft,
            )
        )
        return source, manifest, draft

    def test_exports_tied_explicit_ranks_without_fabricated_counts(self) -> None:
        source, manifest_path, draft_path = self.export("first")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(2, manifest["schemaVersion"])
        self.assertIsNone(manifest["source"]["totalTokens"])
        self.assertIsNone(manifest["format"]["countColumn"])
        self.assertEqual(
            [
                "explicitTiedRank",
                "rankBandUpperBound",
                "sourceRecordIDMapping",
                "numericTopPercentile",
            ],
            manifest["presentationCapabilities"],
        )
        self.assertFalse(manifest["distributionAllowed"])
        draft = json.loads(draft_path.read_text(encoding="utf-8"))
        self.assertFalse(draft["distributionAllowed"])
        rows = import_frequency_pack.source_rows_v2(
            source, import_frequency_pack.read_manifest_v2(manifest_path)
        )
        self.assertEqual([(1, 100, None), (1, 200, None), (3, 300, None)], [row[:3] for row in rows])

    def test_builds_direct_source_record_mapping_and_deterministic_v2_artifact(self) -> None:
        source, manifest, _ = self.export("build")
        outputs = []
        for suffix in ("a", "b"):
            output = self.root / f"pack-{suffix}.sqlite3"
            report = self.root / f"pack-{suffix}.import.json"
            import_frequency_pack.import_pack_versioned(
                argparse.Namespace(
                    source=source,
                    source_manifest=manifest,
                    language_data=self.language,
                    output=output,
                    output_manifest=report,
                )
            )
            outputs.append(output)
            import_report = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual("zenbu.frequency-pack-import.v2", import_report["schema"])
            self.assertEqual((2, 1), (import_report["mappedRows"], import_report["unmappedRows"]))
        self.assertEqual(
            import_frequency_pack.sha256(outputs[0]), import_frequency_pack.sha256(outputs[1])
        )
        database = sqlite3.connect(outputs[0])
        try:
            rows = list(
                database.execute(
                    "SELECT rank,source_count,mapping_relation,source_record_id "
                    "FROM frequency_evidence ORDER BY source_record_id"
                )
            )
            self.assertEqual(
                [(1, None, "sourceRecordID", 100), (1, None, "sourceRecordID", 200)], rows
            )
            metadata = dict(database.execute("SELECT key,value FROM metadata"))
            self.assertEqual("zenbu.frequency-pack.v2", metadata["artifact_schema"])
            self.assertEqual("0", metadata["source_count_available"])
            self.assertNotIn("source_total_tokens", metadata)
            self.assertEqual("3", metadata["ranked_source_records"])
        finally:
            database.close()

    def test_v2_content_digest_contract_vector(self) -> None:
        vector = json.loads(
            (
                TOOLS.parent
                / "Modules/Sources/SearchExperience/Resources/FrequencyPackContentDigestV2.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(
            vector["sha256"],
            import_frequency_pack.artifact_content_sha256_v2(vector["metadata"]),
        )

    def test_v1_content_digest_contract_remains_unchanged(self) -> None:
        vector = json.loads(
            (
                TOOLS.parent
                / "Modules/Sources/SearchExperience/Resources/FrequencyPackContentDigestV1.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(
            vector["sha256"],
            import_frequency_pack.artifact_content_sha256(vector["metadata"]),
        )

    def test_count_and_total_are_preserved_only_when_supplied(self) -> None:
        input_tsv = self.root / "counts.tsv"
        input_tsv.write_text(
            "rank\tsource_record_id\tsource_count\n1\t100\t50\n1\t200\t50\n3\t300\t10\n",
            encoding="utf-8",
        )
        source = self.root / "counts.tsv.xz"
        manifest = self.root / "counts.source.json"
        export_jpdb_frequency_pack.export(
            argparse.Namespace(
                jpdb_sqlite=None,
                input_tsv=input_tsv,
                corpus="global",
                pack_id="zenbu.jpdb.counts.ja",
                pack_version="fixture",
                display_name="JPDB Counts",
                domain="mixed.jpdb",
                domain_description="Fixture",
                source_identity="JPDB count fixture",
                source_snapshot="fixture",
                retrieved_at="2026-09-25",
                total_tokens=110,
                authorization=self.authorization,
                output_source=source,
                output_manifest=manifest,
                output_catalog_draft=self.root / "counts.catalog.json",
            )
        )
        manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertEqual(110, manifest_data["source"]["totalTokens"])
        self.assertIn("count", manifest_data["presentationCapabilities"])
        rows = import_frequency_pack.source_rows_v2(
            source, import_frequency_pack.read_manifest_v2(manifest)
        )
        self.assertEqual([50, 50, 10], [row[2] for row in rows])

    def test_mixed_missing_counts_are_rejected(self) -> None:
        source = self.root / "mixed.tsv"
        source.write_text(
            "rank\tsource_record_id\tsource_count\n1\t100\t50\n2\t200\t\n",
            encoding="utf-8",
        )
        manifest = {
            "format": {
                "rankColumn": "rank",
                "sourceRecordIDColumn": "source_record_id",
                "countColumn": "source_count",
            },
            "source": {"coveredRows": 2},
        }
        with self.assertRaisesRegex(ValueError, "every row"):
            import_frequency_pack.source_rows_v2(source, manifest)

    def test_malformed_headers_widths_and_negative_totals_are_rejected(self) -> None:
        source = self.root / "malformed.tsv"
        source.write_text("rank\trank\tsource_record_id\n1\t1\t100\n", encoding="utf-8")
        manifest = {
            "format": {"rankColumn": "rank", "sourceRecordIDColumn": "source_record_id"},
            "source": {"coveredRows": 1},
        }
        with self.assertRaisesRegex(ValueError, "columns"):
            import_frequency_pack.source_rows_v2(source, manifest)
        source.write_text("rank\tsource_record_id\n1\t100\textra\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "width"):
            import_frequency_pack.source_rows_v2(source, manifest)
        arguments = argparse.Namespace(
            jpdb_sqlite=self.jpdb,
            input_tsv=None,
            corpus="global",
            total_tokens=-1,
        )
        with self.assertRaisesRegex(ValueError, "positive"):
            export_jpdb_frequency_pack.export(arguments)


if __name__ == "__main__":
    unittest.main()
