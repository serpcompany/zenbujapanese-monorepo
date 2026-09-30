from __future__ import annotations

import fnmatch
import io
import json
import re
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import committed_files
import package
import release_inputs
from locations import REPO_ROOT as REPO


class RealInputsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = release_inputs.load_inputs(REPO / "language-data" / "release-inputs.json")

    def test_every_input_is_committed(self):
        paths = [f["path"] for f in self.inputs.files] + [self.inputs.catalog]
        paths += list(self.inputs.source_archives.values()) + self.inputs.conformance
        committed_files.committed(REPO, paths)

    def test_release_one_holds_the_planned_files(self):
        names = [f["name"] for f in self.inputs.files]
        kuromoji = [
            name for name in names if name.startswith("Kuromoji/") and name != "Kuromoji/NOTICE.md"
        ]
        self.assertEqual(len(kuromoji), 14)
        for name in (
            "LanguageReferenceData.sqlite3",
            "CompoundPitch.sqlite3",
            "ExampleWordIndex.sqlite3",
            "JLPTLevelPack.sqlite3",
            "TUBELEXFrequencyPack.sqlite3",
            "KanjiStrokeData.sqlite3",
            "KanjiReferenceData.json",
            "KanjiElementReferenceData.json",
            "RadicalReferenceData.json",
            "DictionaryRankingArtifactContract.json",
            "FrequencyPackCatalog.json",
            "FrequencyPackMappingV1.sql",
            "FrequencyPackMappingV2.sql",
            "EDRDG-ATTRIBUTION.md",
            "TATOEBA-NOTICE.txt",
            "KANJIVG-CC-BY-SA-3.0.txt",
            "Kuromoji/NOTICE.md",
            "KANJIUM-NOTICE.txt",
        ):
            self.assertIn(name, names)
        self.assertNotIn("LanguageTechnologyPackCatalog.json", names)
        planned = {
            f["name"]: f.get("artifact_schema")
            for f in self.inputs.files
            if f.get("artifact_schema")
        }
        self.assertEqual(
            planned,
            {
                "LanguageReferenceData.sqlite3": "zenbu.language-reference.v2",
                "KanjiReferenceData.json": "zenbu.kanji-reference.v1",
                "RadicalReferenceData.json": "zenbu.radical-reference.v1",
                "DictionaryRankingArtifactContract.json": "zenbu.dictionary-ranking-contract.v1",
            },
        )

    def test_the_lfs_files_are_the_databases_and_the_kuromoji_dictionary(self):
        paths = committed_files.lfs_paths(REPO, self.inputs)
        self.assertEqual(len(paths), 18)
        self.assertTrue(
            all(re.search(r"(\.sqlite3|/Kuromoji/[a-z_]+\.dat\.gz)$", p) for p in paths)
        )

    def test_release_json_names_only_the_release(self):
        release = json.loads((REPO / "language-data" / "release.json").read_text())
        self.assertEqual(list(release), ["release"])
        self.assertEqual(release_inputs.load_release(REPO / "language-data" / "release.json"), release)

    def test_the_build_workflow_runs_when_any_input_changes(self):
        workflow = (REPO / ".github" / "workflows" / "language-data-build.yml").read_text()
        filters = set(re.findall(r"^ {6}- '?([^'\n]+)'?$", workflow, re.MULTILINE))
        self.assertIn("language-data/**", filters)
        paths = [f["path"] for f in self.inputs.files] + [self.inputs.catalog]
        paths += list(self.inputs.source_archives.values()) + self.inputs.conformance
        for path in paths:
            with self.subTest(path):
                self.assertTrue(any(fnmatch.fnmatch(path, pattern) for pattern in filters), filters)

    def test_lfs_paths_prints_a_comma_separated_list(self):
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(package.main(["lfs-paths"]), 0)
        self.assertEqual(output.getvalue().strip().split(","), committed_files.lfs_paths(REPO, self.inputs))


if __name__ == "__main__":
    unittest.main()
