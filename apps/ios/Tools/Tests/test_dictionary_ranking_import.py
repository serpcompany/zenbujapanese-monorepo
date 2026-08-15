#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import import_jmdict  # noqa: E402
import validate_dictionary_ranking_data  # noqa: E402


class DictionaryRankingImportTests(unittest.TestCase):
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
