from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
import unittest
import zlib
from pathlib import Path


MYSQL_TOOL = Path(__file__).resolve().parents[1]
IOS_TOOLS = MYSQL_TOOL.parents[0]
sys.path.insert(0, str(MYSQL_TOOL))
sys.path.insert(0, str(IOS_TOOLS))

import import_jpdb  # noqa: E402
import jpdb_extract  # noqa: E402
import warehouse  # noqa: E402


class MySQLWarehouseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.snapshot = self.root / "snapshot"
        body = (
            "<html><body><div><h6 class='subsection-label'>Keyword</h6><div>rest</div></div>"
            "<div><h6 class='subsection-label'>Info</h6><table><tr><th>Stroke count</th><td>6</td></tr></table>"
            "<a href='/kanji-reading/%E4%BC%91/%E3%82%84%E3%81%99'>やす</a></div></body></html>"
        ).encode()
        digest = warehouse.sha256_bytes(body)
        self.snapshot.mkdir(parents=True)
        document = jpdb_extract.extract_page("https://jpdb.io/kanji/%E4%BC%91", body)
        document_json = warehouse.canonical_json(document)
        document_bytes = document_json.encode()
        extracted_digest = warehouse.sha256_bytes(document_bytes)
        structured_blob = self.snapshot / "structured" / "sha256" / extracted_digest[:2] / extracted_digest[2:]
        structured_blob.parent.mkdir(parents=True)
        structured_blob.write_bytes(zlib.compress(document_bytes, level=9))
        self.snapshot_json = {
            "schema": "zenbu.jpdb-structured-snapshot.v2",
            "complete": True,
            "discoveryMode": "public-frontend-closure-v1",
            "authorizationSHA256": "11" * 32,
            "authorization": {"scope": "Owner-authorized public frontend"},
            "frontendClosure": {
                "closed": True,
                "listings": {
                    "/anime-difficulty-list": {
                        "expected": 1,
                        "coveredPositions": 1,
                        "observedIDs": 1,
                        "closed": True,
                    }
                },
            },
            "responses": [
                {
                    "url": "https://jpdb.io/kanji/%E4%BC%91",
                    "finalURL": "https://jpdb.io/kanji/%E4%BC%91",
                    "retrievedAt": "2026-09-25T00:00:00+00:00",
                    "status": 200,
                    "contentType": "text/html; charset=utf-8",
                    "sourceBytes": len(body),
                    "sourceSHA256": digest,
                    "extractedBytes": len(document_bytes),
                    "extractedSHA256": extracted_digest,
                    "extractedCompression": "zlib",
                    "extractionSchema": document["schema"],
                    "etag": "fixture",
                    "lastModified": None,
                    "attempts": 1,
                    "discoveredFrom": "https://jpdb.io/anime/1/example/vocabulary-list",
                }
            ],
        }
        snapshot_manifest = self.snapshot / "snapshot.json"
        snapshot_manifest.write_text(warehouse.canonical_json(self.snapshot_json) + "\n", encoding="utf-8")
        self.sqlite = self.root / "JPDB.sqlite"
        database = sqlite3.connect(self.sqlite)
        try:
            import_jpdb.create_schema(database)
            database.execute(
                "INSERT INTO source_resources VALUES (1,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    self.snapshot_json["responses"][0]["url"],
                    self.snapshot_json["responses"][0]["finalURL"],
                    self.snapshot_json["responses"][0]["retrievedAt"],
                    200,
                    "text/html; charset=utf-8",
                    len(body), digest, len(document_bytes), extracted_digest,
                    "zlib", document["schema"],
                ),
            )
            database.execute(
                "INSERT INTO extracted_documents VALUES (1,?,?,?)",
                (document["routeType"], document["contentSHA256"], document_json),
            )
            database.execute("INSERT INTO vocabulary VALUES (1,1,'別','べつ')")
            database.execute("INSERT INTO spellings VALUES (1,'別','べつ',0.99,1)")
            database.execute("INSERT INTO readings VALUES (1,'べつ',1)")
            database.execute("INSERT INTO meanings VALUES (1,0,'difference')")
            database.execute("INSERT INTO meaning_parts_of_speech VALUES (1,0,'Noun')")
            database.execute(
                "INSERT INTO frequencies VALUES (1,'global',48600,'top-band-upper-bound','Top 48600')"
            )
            database.execute("INSERT INTO zenbu_mappings VALUES (1,NULL,'unmapped',0)")
            database.execute(
                "INSERT INTO field_provenance VALUES ('vocabulary','1','headword',1,'.primary-spelling')"
            )
            database.execute(
                "INSERT INTO source_licenses VALUES (1,'JPDB',?,'internal',0,'not distributable')",
                ("11" * 32,),
            )
            database.commit()
        finally:
            database.close()
        self.artifact_manifest = self.root / "JPDB.import.json"
        self.artifact_manifest.write_text(
            warehouse.canonical_json(
                {
                    "artifactSHA256": warehouse.file_sha256(self.sqlite),
                    "snapshotManifestSHA256": warehouse.file_sha256(snapshot_manifest),
                }
            )
            + "\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def export(self, name: str) -> tuple[Path, dict[str, object]]:
        output = self.root / name
        manifest = warehouse.export_warehouse(
            argparse.Namespace(
                sqlite=self.sqlite,
                artifact_manifest=self.artifact_manifest,
                snapshot=self.snapshot,
                output=output,
            )
        )
        return output, manifest

    def test_export_is_deterministic_and_includes_extracted_document(self) -> None:
        first, first_manifest = self.export("first")
        second, second_manifest = self.export("second")
        self.assertEqual(first_manifest, second_manifest)
        for spec in warehouse.TABLE_SPECS:
            self.assertEqual(
                (first / f"{spec.export_name}.tsv").read_bytes(),
                (second / f"{spec.export_name}.tsv").read_bytes(),
            )
        document_fields = (first / "extracted_documents.tsv").read_text(encoding="utf-8").rstrip().split("\t")
        self.assertEqual("zenbu.jpdb-frontend-extract.v1", document_fields[1])
        self.assertEqual("kanji-detail", document_fields[3])
        self.assertNotIn("<html>", document_fields[4])
        resource_fields = (first / "source_resources.tsv").read_text(encoding="utf-8").rstrip().split("\t")
        self.assertEqual(self.snapshot_json["responses"][0]["sourceSHA256"], resource_fields[9])
        self.assertEqual(document_fields[0], resource_fields[10])
        self.assertEqual("zlib", resource_fields[11])
        self.assertEqual("zenbu.jpdb-frontend-extract.v1", resource_fields[12])
        self.assertEqual(1, first_manifest["tables"]["kanji_details"]["rows"])
        self.assertEqual(1, first_manifest["tables"]["kanji_readings"]["rows"])
        self.assertEqual(1, first_manifest["tables"]["kanji_attributes"]["rows"])
        sql = (first / "load.sql.template").read_text(encoding="utf-8")
        self.assertIn("START TRANSACTION", sql)
        self.assertIn("jpdb_current_snapshot", sql)
        self.assertIn("LOAD DATA LOCAL INFILE '__LOAD_DIR__/extracted_documents.tsv'", sql)
        self.assertIn("INSERT INTO jpdb_extracted_documents", sql)
        self.assertIn("@already_published=0", sql)
        self.assertIn("@@warning_count=0", sql)

    def test_export_rejects_tampered_extracted_document(self) -> None:
        database = sqlite3.connect(self.sqlite)
        try:
            database.execute("UPDATE extracted_documents SET document_json='{}'")
            database.commit()
        finally:
            database.close()
        with self.assertRaisesRegex(ValueError, "extracted document checksum mismatch"):
            database = sqlite3.connect(self.sqlite)
            try:
                warehouse.read_extracted_documents(database)
            finally:
                database.close()

    def test_export_rejects_tampered_compressed_structured_blob(self) -> None:
        response = self.snapshot_json["responses"][0]
        path = self.snapshot / "structured" / "sha256" / response["extractedSHA256"][:2] / response["extractedSHA256"][2:]
        path.write_bytes(b"not-zlib")
        with self.assertRaisesRegex(ValueError, "invalid compressed structured"):
            self.export("compressed-tamper")

    def test_migration_has_snapshot_publication_and_binary_unicode_contract(self) -> None:
        migration = (warehouse.MIGRATIONS / "0001_initial.sql").read_text(encoding="utf-8")
        self.assertIn("DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS jpdb_extracted_documents", migration)
        self.assertNotIn("jpdb_source_blobs", migration)
        self.assertNotIn("LONGBLOB", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS jpdb_current_snapshot", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS jpdb_kanji_reading_details", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS jpdb_kanji_reading_vocabulary", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS jpdb_deck_listing_rows", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS jpdb_kanji_readings", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS jpdb_document_diagnostics", migration)
        self.assertIn("PRIMARY KEY(snapshot_id,deck_key_sha,source_document_sha)", migration)
        self.assertIn("UNIQUE(snapshot_id,upstream_vid)", migration)
        self.assertIn("PRIMARY KEY(snapshot_id,observation_sha)", migration)
        self.assertIn("PRIMARY KEY(snapshot_id,conflict_sha)", migration)
        self.assertIn("PRIMARY KEY(snapshot_id,issue_sha)", migration)

    def test_mysql_command_rejects_password_arguments(self) -> None:
        with self.assertRaisesRegex(ValueError, "login path"):
            warehouse.mysql_command(
                argparse.Namespace(
                    mysql_binary="mysql",
                    mysql_arg=["--password=secret"],
                    database="zenbu_jpdb",
                )
            )

    def test_mysql_command_places_login_path_first(self) -> None:
        command = warehouse.mysql_command(
            argparse.Namespace(
                mysql_binary="mysql",
                mysql_arg=["--host=127.0.0.1", "--login-path=zenbu-jpdb"],
                database="zenbu_jpdb",
            ),
            local_infile=True,
        )
        self.assertEqual(
            [
                "mysql",
                "--login-path=zenbu-jpdb",
                "--batch",
                "--skip-column-names",
                "--local-infile=1",
                "--host=127.0.0.1",
                "zenbu_jpdb",
            ],
            command,
        )

    def test_load_rejects_tampered_sql_template_before_invoking_mysql(self) -> None:
        output, _ = self.export("template-tamper")
        (output / "load.sql.template").write_text("SELECT 'tampered';\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "does not match"):
            warehouse.load(
                argparse.Namespace(
                    export=output,
                    extract_root_uri="file:///extracted",
                    mysql_binary="mysql",
                    mysql_arg=[],
                    database="zenbu_jpdb",
                )
            )

    def test_export_rejects_inconsistent_snapshot_and_sqlite_extraction_metadata(self) -> None:
        database = sqlite3.connect(self.sqlite)
        try:
            database.execute("UPDATE source_resources SET extracted_byte_count=extracted_byte_count+1")
            database.commit()
            by_resource, documents = warehouse.read_extracted_documents(database)
            rows = warehouse.export_rows(database, self.snapshot_json, by_resource, documents)
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                list(rows["source_resources"])
        finally:
            database.close()

    def test_diagnostics_reject_inconsistent_visible_text_hash(self) -> None:
        document = {
            "schema": "zenbu.jpdb-frontend-extract.v1",
            "schemaVersion": 1,
            "routeType": "generic-public-page",
            "sourceURL": "https://jpdb.io/",
            "contentSHA256": "00" * 32,
            "evidence": {"visibleTextSHA256": "zz" * 32},
        }
        with self.assertRaisesRegex(ValueError, "invalid visible text checksum"):
            warehouse.extracted_observation_rows([document])

    def test_deck_observations_from_multiple_documents_are_preserved(self) -> None:
        empty_text_sha = warehouse.sha256_bytes(b"")
        media_document = {
            "contentSHA256": "21" * 32,
            "sourceURL": "https://jpdb.io/anime/1/example",
            "routeType": "media-detail",
            "evidence": {"visibleTextSHA256": empty_text_sha},
            "media": {"category": "anime", "id": 1, "slug": "example"},
            "decks": [
                {
                    "key": "/anime/1/example",
                    "kind": "aggregate",
                    "ordinal": None,
                    "slug": None,
                    "title": "Example",
                    "vocabularyListURL": "https://jpdb.io/anime/1/example/vocabulary-list",
                }
            ],
        }
        list_document = {
            "contentSHA256": "22" * 32,
            "sourceURL": "https://jpdb.io/anime/1/example/vocabulary-list",
            "routeType": "vocabulary-list",
            "evidence": {"visibleTextSHA256": empty_text_sha},
            "media": {"category": "anime", "id": 1, "slug": "example"},
            "deck": {
                "key": "/anime/1/example",
                "kind": "aggregate",
                "ordinal": None,
                "slug": None,
            },
            "vocabulary": [],
        }
        rows = warehouse.extracted_observation_rows([media_document, list_document])
        self.assertEqual(2, len(rows["frontend_decks"]))
        self.assertEqual({"21" * 32, "22" * 32}, {row[-1] for row in rows["frontend_decks"]})


if __name__ == "__main__":
    unittest.main()
