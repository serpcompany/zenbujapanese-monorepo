import json
import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
CATALOG = (
    ROOT
    / "apps/ios/Modules/Sources/SearchExperience/Resources/FrequencyPackCatalog.json"
)
ANALYSIS = (
    ROOT
    / "apps/ios/LanguageData/Generated/Migaku-public-catalog-ja-ordered-json-v1.analysis.json"
)
TUBELEX = (
    ROOT
    / "apps/ios/Modules/Sources/SearchExperience/Resources/TUBELEXFrequencyPack.sqlite3"
)


class FrequencyPackRuntimeContractTests(unittest.TestCase):
    def test_optional_packs_are_downloadable_but_not_shipped_as_installed_artifacts(self) -> None:
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))

        bundled = [pack for pack in catalog["packs"] if pack["bundled"]]
        self.assertEqual(
            ["zenbu.tubelex.youtube.ja.unidic-3.1"],
            [pack["packID"] for pack in bundled],
        )

        optional = [pack for pack in catalog["packs"] if not pack["bundled"]]
        self.assertGreater(len(optional), 0)
        for pack in catalog["packs"]:
            with self.subTest(pack=pack["packID"]):
                self.assertNotIn("licenseIdentifier", pack)
                self.assertNotIn("licenseURL", pack)
                self.assertNotIn("licenseResource", pack)
        for pack in optional:
            with self.subTest(pack=pack["packID"]):
                self.assertTrue(pack["removable"])
                self.assertIsNone(pack["bundledArtifactSHA256"])
                self.assertRegex(pack["downloadURL"], r"^https://")

        bundled_sqlite = sorted(
            path.name
            for path in CATALOG.parent.glob("*FrequencyPack.sqlite3")
        )
        self.assertEqual(["TUBELEXFrequencyPack.sqlite3"], bundled_sqlite)

    def test_every_selectable_pack_has_verified_evidence_smoke_test(self) -> None:
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        analysis = json.loads(ANALYSIS.read_text(encoding="utf-8"))
        analyzed = {candidate["packID"]: candidate for candidate in analysis["candidates"]}

        self.assertGreater(len(catalog["packs"]), 1)
        for pack in catalog["packs"]:
            with self.subTest(pack=pack["packID"]):
                smoke = pack.get("smokeTest")
                self.assertIsInstance(smoke, dict)
                self.assertRegex(smoke["languageReferenceID"], r"^[0-9a-f]{32}$")
                self.assertGreater(smoke["rank"], 0)
                if pack.get("orderedJSONSource") is not None:
                    self.assertEqual(smoke, analyzed[pack["packID"]]["analysis"]["smokeTest"])

        bundled = next(pack for pack in catalog["packs"] if pack["bundled"])
        smoke = bundled["smokeTest"]
        with sqlite3.connect(TUBELEX) as database:
            row = database.execute(
                "SELECT rank FROM frequency_evidence "
                "WHERE lower(hex(language_reference_id)) = ?",
                (smoke["languageReferenceID"],),
            ).fetchone()
        self.assertEqual((smoke["rank"],), row)


if __name__ == "__main__":
    unittest.main()
