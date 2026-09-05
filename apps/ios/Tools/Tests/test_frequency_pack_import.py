#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
IMPORTER = TOOLS / "import_frequency_pack.py"
RESOURCES = TOOLS.parent / "Modules/Sources/SearchExperience/Resources"
sys.path.insert(0, str(TOOLS))
from import_frequency_pack import artifact_content_sha256  # noqa: E402


class FrequencyPackImportTests(unittest.TestCase):
    def test_python_digest_matches_shared_cross_language_vector(self) -> None:
        vector = json.loads(
            (RESOURCES / "FrequencyPackContentDigestV1.json").read_text(encoding="utf-8")
        )
        self.assertEqual(vector["schema"], "zenbu.frequency-pack-content-digest-vector.v1")
        self.assertEqual(artifact_content_sha256(vector["metadata"]), vector["sha256"])

    def test_curated_production_packs_match_pinned_sources_and_anchor_evidence(self) -> None:
        ios = TOOLS.parent
        resources = ios / "Modules/Sources/SearchExperience/Resources"
        generated = ios / "LanguageData/Generated"
        sources = ios / "LanguageData/Sources"
        language_data = resources / "LanguageReferenceData.sqlite3"
        catalog = json.loads((resources / "FrequencyPackCatalog.json").read_text())
        self.assertEqual(catalog["trustedHistoricalManifests"], [])
        cases = [
            {
                "id": "zenbu.tubelex.youtube.ja.unidic-3.1",
                "source": sources / "TUBELEX-ja-310-lemma-pos.tsv.xz",
                "source_manifest": sources / "TUBELEX-ja-310-lemma-pos.source.json",
                "import_manifest": generated / "TUBELEX-ja-310-lemma-pos.import.json",
                "artifact": resources / "TUBELEXFrequencyPack.sqlite3",
                "source_bytes": 3_658_276,
                "source_sha": "39d4edb2ccac4405b47d0f93e9ec7b11678b3b305d1a37c877dd76588817c8e9",
                "artifact_bytes": 8_122_368,
                "artifact_sha": "d4a9e84b8a2c359394015a01f82307ea68c1a61c32597b7d7cab82ee5d4a6d87",
                "artifact_content_sha": "6bca297060aa04a90063623e21892fa7e2fd0ef6432126e4e8b0ab3979f8d52d",
                "mapping_sha": "279354f9187441d0958ec31461fc4765b432dd46ce971c91348946b2409203e9",
                "counts": (56_678, 4_925, 286_683, 3_167),
                "relations": [
                    ("exactReadingPOS", 29),
                    ("exactWrittenPOS", 345),
                    ("uniqueFormFallback", 56_304),
                ],
                "anchors": [
                    ("7f490a9c9c0da94f4e9474f4efe74be1", 41, 552_294, "見る"),
                    ("c89bc8d79270f34f8646a9661817fc20", 11_497, 501, "蝶々"),
                    ("e3e60b5ae69897299cc1ec0b30857201", 14_728, 335, "茨"),
                ],
            },
            {
                "id": "zenbu.wikipedia.written.ja.unidic-3.1",
                "source": sources / "Wikipedia-ja-20221020-310-nfkc.tsv.xz",
                "source_manifest": sources / "Wikipedia-ja-20221020-310-nfkc.source.json",
                "import_manifest": generated / "Wikipedia-ja-20221020-310-nfkc.import.json",
                "source_bytes": 3_452_188,
                "source_sha": "2524bd18fa54ac15125c60cf137fb3ea2b0473ba7f7cb95e8eff7657fdf808ca",
                "artifact_bytes": 8_884_224,
                "artifact_sha": "d3dba5c4902b9323799d5c0ac53af2dd84a0c1bd208d047176a4a6a703f31eea",
                "artifact_content_sha": "113b634cd32936e069a60dce0504c8e77d64de1cc4e108393d80a20fdd63591e",
                "mapping_sha": "d6b32880509a0a033f97f476b833846cac609190f52edcf85d68fdd91de5b24e",
                "counts": (73_453, 9_448, 455_351, 22_569),
                "relations": [("uniqueFormFallback", 73_453)],
                "anchors": [
                    ("7f490a9c9c0da94f4e9474f4efe74be1", 1_423, 40_878, "見る"),
                    ("c89bc8d79270f34f8646a9661817fc20", 28_808, 925, "蝶々"),
                    ("e3e60b5ae69897299cc1ec0b30857201", 43_637, 479, "茨"),
                ],
            },
        ]
        for case in cases:
            with self.subTest(pack=case["id"]), tempfile.TemporaryDirectory() as temporary:
                source = case["source"]
                self.assertEqual(source.stat().st_size, case["source_bytes"])
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), case["source_sha"])
                source_manifest = json.loads(case["source_manifest"].read_text())
                imported = json.loads(case["import_manifest"].read_text())
                self.assertEqual(imported["sourceManifest"], source_manifest)
                self.assertEqual(imported["importerSHA256"], hashlib.sha256(IMPORTER.read_bytes()).hexdigest())
                self.assertEqual(imported["languageDataSHA256"], hashlib.sha256(language_data.read_bytes()).hexdigest())
                self.assertEqual(imported["artifactBytes"], case["artifact_bytes"])
                self.assertEqual(imported["artifactSHA256"], case["artifact_sha"])
                self.assertEqual(
                    imported["artifactContentSHA256"], case["artifact_content_sha"]
                )
                self.assertEqual(imported["mappingSHA256"], case["mapping_sha"])
                self.assertEqual(
                    imported["mappingPolicySHA256"],
                    "7cf8ee196cd98c9683ac35f3214bc149ce6bfae55a1ee5f9c854c02816d2ecae",
                )
                self.assertEqual(
                    (
                        imported["mappedRows"], imported["ambiguousRows"],
                        imported["unmappedRows"], imported["duplicateMappings"],
                    ),
                    case["counts"],
                )
                artifact = case.get("artifact") or Path(temporary) / "FrequencyPack.sqlite3"
                if "artifact" not in case:
                    output_manifest = Path(temporary) / "import.json"
                    result = subprocess.run(
                        [
                            sys.executable, str(IMPORTER), "--source", str(source),
                            "--source-manifest", str(case["source_manifest"]),
                            "--language-data", str(language_data), "--output", str(artifact),
                            "--output-manifest", str(output_manifest),
                        ],
                        text=True, capture_output=True, check=False,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    current_import = json.loads(output_manifest.read_text())
                    self.assertEqual(
                        current_import["artifactContentSHA256"], case["artifact_content_sha"]
                    )
                    self.assertEqual(
                        current_import["artifactSHA256"],
                        hashlib.sha256(artifact.read_bytes()).hexdigest(),
                    )
                self.assertEqual(artifact.stat().st_size, case["artifact_bytes"])
                if "artifact" in case:
                    self.assertEqual(
                        hashlib.sha256(artifact.read_bytes()).hexdigest(), case["artifact_sha"]
                    )
                with sqlite3.connect(artifact) as database:
                    actual = database.execute(
                        "SELECT lower(hex(language_reference_id)), rank, source_count, matched_form "
                        "FROM frequency_evidence WHERE lower(hex(language_reference_id)) IN "
                        "('7f490a9c9c0da94f4e9474f4efe74be1','c89bc8d79270f34f8646a9661817fc20',"
                        "'e3e60b5ae69897299cc1ec0b30857201') ORDER BY rank"
                    ).fetchall()
                    absent = database.execute(
                        "SELECT count(*) FROM frequency_evidence WHERE lower(hex(language_reference_id)) IN "
                        "('df87bd3681d3cb3d33d2aa1e2987d460','8647047758cffbea50d72922fad277e0')"
                    ).fetchone()[0]
                    relations = database.execute(
                        "SELECT mapping_relation, count(*) FROM frequency_evidence "
                        "GROUP BY mapping_relation ORDER BY mapping_relation"
                    ).fetchall()
                self.assertEqual(actual, case["anchors"])
                self.assertEqual(absent, 0)
                self.assertEqual(relations, case["relations"])
                catalog_pack = next(pack for pack in catalog["packs"] if pack["packID"] == case["id"])
                self.assertEqual(catalog_pack["sourceSHA256"], case["source_sha"])
                self.assertEqual(catalog_pack["mappingSHA256"], case["mapping_sha"])
                self.assertEqual(
                    catalog_pack["artifactContentSHA256"], case["artifact_content_sha"]
                )
                self.assertEqual(catalog_pack["mappedRows"], case["counts"][0])
                self.assertEqual(
                    catalog_pack["mappingPolicySHA256"], imported["mappingPolicySHA256"]
                )
                self.assertEqual(catalog_pack["offlineImporterSHA256"], imported["importerSHA256"])
                self.assertEqual(catalog_pack["languageDataSHA256"], imported["languageDataSHA256"])
                self.assertEqual(
                    catalog_pack["rankTiePolicy"], source_manifest["rankTiePolicy"]
                )

    def test_command_emits_byte_stable_app_owned_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_output = self._run_valid_import(Path(first))
            second_output = self._run_valid_import(Path(second))

            self.assertEqual(first_output.read_bytes(), second_output.read_bytes())
            with sqlite3.connect(first_output) as database:
                rows = database.execute(
                    "SELECT lower(hex(language_reference_id)), rank, source_count, "
                    "covered_source_rows, mapping_relation FROM frequency_evidence "
                    "ORDER BY rank"
                ).fetchall()
                metadata = dict(database.execute("SELECT key, value FROM metadata"))

            self.assertEqual(
                rows,
                [
                    ("00000000000000000000000000000001", 1, 80, 4, "uniqueFormFallback"),
                    ("00000000000000000000000000000002", 2, 20, 4, "uniqueFormFallback"),
                ],
            )
            self.assertEqual(metadata["pack_id"], "fixture.media")
            self.assertEqual(metadata["mapped_rows"], "2")
            self.assertEqual(metadata["ambiguous_rows"], "1")
            self.assertEqual(metadata["unmapped_rows"], "1")

    def test_command_rejects_checksum_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = self._run_import(Path(temporary), source_sha256="0" * 64)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("source SHA-256 mismatch", result.stderr)

    def test_command_rejects_missing_attribution(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = self._run_import(Path(temporary), attribution="")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("attribution", result.stderr)

    def test_command_rejects_total_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = self._run_import(Path(temporary), expected_total_tokens=101)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("total token mismatch", result.stderr)

    def _run_valid_import(self, directory: Path) -> Path:
        result = self._run_import(directory)
        self.assertEqual(result.returncode, 0, result.stderr)
        return directory / "FrequencyPack.sqlite3"

    def _run_import(
        self,
        directory: Path,
        *,
        source_sha256: str | None = None,
        attribution: str = "Fixture authors",
        expected_total_tokens: int = 100,
    ) -> subprocess.CompletedProcess[str]:
        source = directory / "source.tsv"
        source.write_text(
            "word\tcount\tdocuments\n"
            "見る\t80\t8\n"
            "蝶々\t20\t4\n"
            "いる\t5\t3\n"
            "未収録\t1\t1\n"
            "[TOTAL]\t100\t10\n",
            encoding="utf-8",
        )
        source_digest = hashlib.sha256(source.read_bytes()).hexdigest()
        language_data = directory / "LanguageReferenceData.sqlite3"
        with sqlite3.connect(language_data) as database:
            database.executescript(
                "CREATE TABLE entries (id BLOB PRIMARY KEY, headword TEXT, reading TEXT, "
                "parts_of_speech_json TEXT);"
                "CREATE TABLE forms (entry_id BLOB, form TEXT, kind INTEGER);"
            )
            entries = [
                (bytes.fromhex("00" * 15 + "01"), "見る", "みる", '["Ichidan Verb"]'),
                (bytes.fromhex("00" * 15 + "02"), "蝶々", "ちょうちょう", '["Noun"]'),
                (bytes.fromhex("00" * 15 + "03"), "居る", "いる", '["Ichidan Verb"]'),
                (bytes.fromhex("00" * 15 + "04"), "要る", "いる", '["Godan Verb"]'),
            ]
            database.executemany("INSERT INTO entries VALUES (?, ?, ?, ?)", entries)
            for entry_id, headword, reading, _ in entries:
                database.execute("INSERT INTO forms VALUES (?, ?, 0)", (entry_id, headword))
                database.execute("INSERT INTO forms VALUES (?, ?, 1)", (entry_id, reading))

        notice = directory / "LICENSE.txt"
        notice.write_text("Fixture license\n", encoding="utf-8")
        manifest = {
            "schemaVersion": 1,
            "packID": "fixture.media",
            "packVersion": "1.0.0",
            "displayName": "Fixture Media",
            "domain": "spoken.media",
            "source": {
                "identity": "fixture",
                "snapshot": "fixture-1",
                "url": "https://example.invalid/fixture.tsv",
                "bytes": source.stat().st_size,
                "sha256": source_sha256 or source_digest,
                "totalTokens": expected_total_tokens,
                "coveredRows": 4,
            },
            "format": {
                "wordColumn": "word",
                "countColumn": "count",
                "totalMarker": "[TOTAL]",
            },
            "license": {
                "identifier": "BSD-3-Clause",
                "attribution": attribution,
                "notice": str(notice),
            },
            "mappingPolicyVersion": 1,
            "rankTiePolicy": (
                "One-based source row ordinal after the header; equal counts retain pinned "
                "source artifact order and receive distinct ranks."
            ),
            "presentationPolicyVersion": 1,
        }
        manifest_path = directory / "source.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        return subprocess.run(
            [
                sys.executable,
                str(IMPORTER),
                "--source",
                str(source),
                "--source-manifest",
                str(manifest_path),
                "--language-data",
                str(language_data),
                "--output",
                str(directory / "FrequencyPack.sqlite3"),
                "--output-manifest",
                str(directory / "FrequencyPack.import.json"),
            ],
            text=True,
            capture_output=True,
            check=False,
        )


if __name__ == "__main__":
    unittest.main()
