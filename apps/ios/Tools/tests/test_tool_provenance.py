import json
import subprocess
import sys
import unittest

from contract_checks import CATALOG, GENERATED, RESOURCES, ROOT, sha256

TOOLS = ROOT / "apps/ios/Tools"
SHARED = "language_data_tools.py"
JMDICT_TOOLS = "the jmdict importer's files"
RANKING_TOOLS = {
    "import_tool_sha256": JMDICT_TOOLS,
    "tatoeba_adapter_sha256": "tatoeba_adapter.py",
    "unidic_adapter_sha256": "unidic_adapter.py",
    "dictionary_ranking_adapter_sha256": "dictionary_ranking_adapter.py",
    "dictionary_ranking_contract_sha256": "dictionary_ranking_contract.py",
    "shared_tooling_sha256": SHARED,
}
REPORTS = {
    "JMdict_e-*.import.json": {
        **RANKING_TOOLS,
        "retrieval_importer_sha256": "example_sentence_retrieval_index.py",
    },
    "EDRDG-radicals-*.import.json": {
        "import_tool_sha256": "import_radicals.py",
        "shared_tooling_sha256": SHARED,
    },
    "KANJIDIC2-*.import.json": {"import_tool_sha256": "import_kanjidic.py", "shared_tooling_sha256": SHARED},
    "KanjiVG-*.import.json": {"import_tool_sha256": "import_kanjivg.py", "shared_tooling_sha256": SHARED},
    "Kanjium-*.import.json": {
        "importToolSha256": "import_kanji_elements.py",
        "sharedToolingSha256": SHARED,
    },
    "Tatoeba-jpn-indices-*.import.json": {
        "import_tool_sha256": "import_example_word_index.py",
        "shared_tooling_sha256": SHARED,
    },
    "UniDic-CWJ-*-compound-pitch.import.json": {
        "import_tool_sha256": "import_compound_pitch.py",
        "shared_tooling_sha256": SHARED,
    },
    "JLPT-Waller-*.import.json": {"offlineImporterSHA256": "import_jlpt_level_pack.py"},
    "TUBELEX-*.import.json": {"importerSHA256": "import_frequency_pack.py"},
    "Wikipedia-*.import.json": {"importerSHA256": "import_frequency_pack.py"},
    "RankedLists.import.json": {"importerSHA256": "build_ranked_lists.py"},
}
PACK_BUILDERS = {
    "zenbu.jlpt.": "import_jlpt_level_pack.py",
    "zenbu.tubelex.": "import_frequency_pack.py",
    "zenbu.wikipedia.": "import_frequency_pack.py",
    "zenbu.jiten.": "build_jiten_frequency_packs.py",
}


def recorded_values(value: object, key: str) -> list[object]:
    if isinstance(value, dict):
        found = [value[key]] if key in value else []
        return found + [item for child in value.values() for item in recorded_values(child, key)]
    if isinstance(value, list):
        return [item for child in value for item in recorded_values(child, key)]
    return []


def jmdict_tools_sha256() -> str:
    result = subprocess.run(
        [sys.executable, "-c", "import import_jmdict; print(import_jmdict.import_tool_files_sha256())"],
        cwd=TOOLS,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


class ToolProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.current = {JMDICT_TOOLS: jmdict_tools_sha256()}

    def current_sha256(self, tool: str) -> str:
        if tool not in self.current:
            self.current[tool] = sha256(TOOLS / tool)
        return self.current[tool]

    def assert_records_current_tools(self, name: str, record: object, tools: dict[str, str]) -> None:
        for key, tool in tools.items():
            values = recorded_values(record, key)
            with self.subTest(record=name, key=key):
                self.assertTrue(values, f"{name} records no {key}")
                for value in values:
                    self.assertEqual(
                        self.current_sha256(tool),
                        value,
                        f"{name}'s {key} isn't {tool}'s SHA-256: rebuild the language data "
                        "(apps/ios/Tools/README.md)",
                    )

    def test_every_import_report_is_checked(self) -> None:
        for report in GENERATED.glob("*.import.json"):
            with self.subTest(report=report.name):
                self.assertEqual(
                    1,
                    sum(report.match(pattern) for pattern in REPORTS),
                    f"{report.name} matches no pattern in REPORTS: add the tools it records",
                )

    def test_each_import_report_records_the_tools_as_they_are(self) -> None:
        for pattern, tools in REPORTS.items():
            (report,) = GENERATED.glob(pattern)
            self.assert_records_current_tools(
                report.name, json.loads(report.read_text(encoding="utf-8")), tools
            )

    def test_the_ranking_contract_records_the_tools_as_they_are(self) -> None:
        contract = RESOURCES / "DictionaryRankingArtifactContract.json"
        recorded = json.loads(contract.read_text(encoding="utf-8"))["toolSHA256"]
        self.assert_records_current_tools(contract.name, recorded, RANKING_TOOLS)

    def test_each_pack_in_the_catalog_records_the_tool_that_built_it(self) -> None:
        for pack in json.loads(CATALOG.read_text(encoding="utf-8"))["packs"]:
            (tool,) = [tool for prefix, tool in PACK_BUILDERS.items() if pack["packID"].startswith(prefix)]
            self.assert_records_current_tools(
                pack["packID"], pack, {"offlineImporterSHA256": tool}
            )


if __name__ == "__main__":
    unittest.main()
