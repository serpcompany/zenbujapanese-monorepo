#!/usr/bin/env python3

from __future__ import annotations

import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import import_jmdict  # noqa: E402
import validate_dictionary_ranking_data  # noqa: E402


class DictionaryRankingImportTests(unittest.TestCase):
    def test_generated_runtime_contract_binds_manifest_artifact_and_current_tools(self) -> None:
        ios = TOOLS.parent
        manifest = json.loads(
            (ios / "LanguageData/Generated/JMdict_e-2026-08-10.import.json").read_text()
        )["transform"]
        contract_path = (
            ios
            / "Modules/Sources/SearchExperience/Resources/DictionaryRankingArtifactContract.json"
        )
        self.assertTrue(contract_path.exists())
        contract = json.loads(contract_path.read_text())
        self.assertEqual(contract["databaseSHA256"], manifest["database_sha256"])
        self.assertEqual(
            contract["mappingSHA256"], manifest["dictionary_ranking_mapping_sha256"]
        )
        self.assertEqual(contract["evidenceCounts"], manifest["dictionary_ranking_evidence"])
        self.assertEqual(contract["semanticEquivalence"], manifest["semantic_equivalence"])
        self.assertEqual(
            contract["toolSHA256"],
            {
                key: manifest[key]
                for key in validate_dictionary_ranking_data.TOOL_FILES
            },
        )
        lookup_source = (
            ios / "Modules/Sources/SearchExperience/LookupClient.swift"
        ).read_text()
        self.assertNotIn(manifest["database_sha256"], lookup_source)
        self.assertNotIn(manifest["dictionary_ranking_mapping_sha256"], lookup_source)

    def test_release_validator_rejects_count_preserving_ranking_evidence_drift(self) -> None:
        ios = TOOLS.parent
        database = ios / "Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3"
        source = ios / "LanguageData/Sources/JMdict_e-2026-08-10.gz"
        manifest = json.loads(
            (ios / "LanguageData/Generated/JMdict_e-2026-08-10.import.json").read_text()
        )
        with tempfile.TemporaryDirectory() as temporary:
            changed_database = Path(temporary) / "LanguageReferenceData.sqlite3"
            shutil.copyfile(database, changed_database)
            connection = sqlite3.connect(changed_database)
            try:
                entry_id, sense_order, gloss_order, text = connection.execute(
                    "SELECT entry_id, sense_order, gloss_order, text FROM gloss_atoms "
                    "ORDER BY entry_id, sense_order, gloss_order LIMIT 1"
                ).fetchone()
                connection.execute(
                    "UPDATE gloss_atoms SET text = ? "
                    "WHERE entry_id = ? AND sense_order = ? AND gloss_order = ?",
                    (text + " drift", entry_id, sense_order, gloss_order),
                )
                connection.commit()
            finally:
                connection.close()
            manifest["transform"]["database_sha256"] = (
                validate_dictionary_ranking_data.file_sha256(changed_database)
            )
            manifest["transform"]["database_bytes"] = changed_database.stat().st_size
            changed_manifest = Path(temporary) / "manifest.json"
            changed_manifest.write_text(json.dumps(manifest))

            with self.assertRaisesRegex(RuntimeError, "mapping"):
                validate_dictionary_ranking_data.validate(
                    changed_database, changed_manifest, source
                )

    def test_release_validator_binds_current_importer_and_adapter_checksums(self) -> None:
        ios = TOOLS.parent
        database = ios / "Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3"
        source = ios / "LanguageData/Sources/JMdict_e-2026-08-10.gz"
        manifest = json.loads(
            (ios / "LanguageData/Generated/JMdict_e-2026-08-10.import.json").read_text()
        )
        for key in (
            "import_tool_sha256",
            "dictionary_ranking_adapter_sha256",
            "dictionary_ranking_contract_sha256",
            "shared_tooling_sha256",
            "unidic_adapter_sha256",
            "tatoeba_adapter_sha256",
        ):
            changed = json.loads(json.dumps(manifest))
            changed["transform"][key] = "0" * 64
            with self.subTest(key=key), tempfile.TemporaryDirectory() as temporary:
                changed_path = Path(temporary) / "manifest.json"
                changed_path.write_text(json.dumps(changed))
                with self.assertRaisesRegex(RuntimeError, key):
                    validate_dictionary_ranking_data.validate(database, changed_path, source)

    def test_release_validator_requires_semantic_fingerprint_lookup_index(self) -> None:
        ios = TOOLS.parent
        database = ios / "Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3"
        source = ios / "LanguageData/Sources/JMdict_e-2026-08-10.gz"
        manifest = json.loads(
            (ios / "LanguageData/Generated/JMdict_e-2026-08-10.import.json").read_text()
        )
        with tempfile.TemporaryDirectory() as temporary:
            changed_database = Path(temporary) / "LanguageReferenceData.sqlite3"
            shutil.copyfile(database, changed_database)
            connection = sqlite3.connect(changed_database)
            try:
                connection.execute("DROP INDEX entries_semantic_fingerprint_index")
                connection.commit()
            finally:
                connection.close()
            manifest["transform"]["database_sha256"] = (
                validate_dictionary_ranking_data.file_sha256(changed_database)
            )
            manifest["transform"]["database_bytes"] = changed_database.stat().st_size
            changed_manifest = Path(temporary) / "manifest.json"
            changed_manifest.write_text(json.dumps(manifest))

            with self.assertRaisesRegex(RuntimeError, "semantic fingerprint lookup index"):
                validate_dictionary_ranking_data.validate(
                    changed_database, changed_manifest, source
                )

    def test_validator_count_contract_matches_importer_fail_closed_contract(self) -> None:
        self.assertEqual(
            validate_dictionary_ranking_data.EXPECTED_COUNTS,
            {
                "form_priority_profiles": import_jmdict.EXPECTED_PRIORITY_PROFILE_COUNT,
                "canonical_senses": import_jmdict.EXPECTED_SENSE_COUNT,
                "gloss_atoms": import_jmdict.EXPECTED_GLOSS_ATOM_COUNT,
                "sense_form_restrictions": import_jmdict.EXPECTED_SENSE_RESTRICTION_COUNT,
                "reading_form_restrictions": import_jmdict.EXPECTED_READING_RESTRICTION_COUNT,
            },
        )

    def test_priority_profile_retains_every_app_owned_marker_dimension(self) -> None:
        self.assertEqual(
            import_jmdict.normalized_priority_profile(
                ["spec1", "ichi1", "news1", "gai1", "spec2", "ichi2", "news2", "gai2", "nf05"]
            ),
            (0b1111, 0b1111, 5),
        )

    def test_priority_profile_rejects_unknown_and_out_of_range_markers(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown"):
            import_jmdict.normalized_priority_profile(["provider-order"])
        with self.assertRaisesRegex(ValueError, "out-of-range"):
            import_jmdict.normalized_priority_profile(["nf00"])

    def test_semantic_fingerprint_changes_for_gloss_boundaries_and_applicability(self) -> None:
        base = {
            "headword": "この間",
            "reading": "このあいだ",
            "meanings": ["the other day"],
            "parts_of_speech": ["Noun"],
            "written_forms": [{"value": "この間", "kind": "written", "labels": []}],
            "reading_forms": [{"value": "このあいだ", "kind": "reading", "labels": []}],
            "canonical_senses": [{
                "senseOrder": 0,
                "partsOfSpeech": ["Noun"],
                "restrictedWrittenForms": [],
                "restrictedReadingForms": [],
            }],
            "gloss_atoms": [{"senseOrder": 0, "glossOrder": 0, "text": "the other day"}],
        }
        restricted = {**base, "canonical_senses": [{
            **base["canonical_senses"][0], "restrictedReadingForms": ["このかん"]
        }]}
        split = {**base, "gloss_atoms": [
            {"senseOrder": 0, "glossOrder": 0, "text": "the other"},
            {"senseOrder": 0, "glossOrder": 1, "text": "day"},
        ]}

        self.assertNotEqual(import_jmdict.semantic_fingerprint(base), import_jmdict.semantic_fingerprint(restricted))
        self.assertNotEqual(import_jmdict.semantic_fingerprint(base), import_jmdict.semantic_fingerprint(split))


if __name__ == "__main__":
    unittest.main()
