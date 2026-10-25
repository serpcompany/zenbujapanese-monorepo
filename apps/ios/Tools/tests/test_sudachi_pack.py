import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prepare_sudachi_core

REPOSITORY = Path(__file__).resolve().parents[4]
CATALOG = (
    REPOSITORY
    / "apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json"
)
SUITE = REPOSITORY / "language-data/conformance/sudachi-pack.json"


class BundledSudachiPackTests(unittest.TestCase):
    def test_the_build_bundles_the_pack_the_shared_cases_name(self):
        committed = json.loads(CATALOG.read_text(encoding="utf-8"))
        cases = json.loads(SUITE.read_text(encoding="utf-8"))["cases"]
        self.assertGreater(len(cases), 5)
        with tempfile.TemporaryDirectory() as folder:
            manifest = Path(folder) / CATALOG.name
            for case in cases:
                with self.subTest(case["covers"]):
                    catalog = dict(committed)
                    catalog["schemaVersion"] = case.get("schemaVersion", committed["schemaVersion"])
                    catalog["packs"] = [committed["packs"][0] | fields for fields in case["packs"]]
                    manifest.write_text(json.dumps(catalog), encoding="utf-8")
                    try:
                        chosen = prepare_sudachi_core._bundled_pack(manifest)["packID"]
                    except prepare_sudachi_core.PreparationError:
                        chosen = None
                    self.assertEqual(chosen, case["analyzesWith"])


if __name__ == "__main__":
    unittest.main()
