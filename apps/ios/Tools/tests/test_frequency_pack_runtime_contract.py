import json
import sqlite3
import unittest

from contract_checks import CATALOG, GENERATED, RESOURCES, ROOT, SOURCES, sha256

ANALYSIS = GENERATED / "Migaku-public-catalog-ja-ordered-json-v1.analysis.json"
JITEN_ANALYSIS = GENERATED / "Jiten-2026-09-27.analysis.json"
TUBELEX = RESOURCES / "TUBELEXFrequencyPack.sqlite3"
TUBELEX_REPORT = GENERATED / "TUBELEX-ja-310-lemma-pos.import.json"
LANGUAGE_DATA = RESOURCES / "LanguageReferenceData.sqlite3"
JLPT = RESOURCES / "JLPTLevelPack.sqlite3"
JLPT_RECORD = SOURCES / "JLPT-Waller-2025-08-26.source.json"
JLPT_REPORT = GENERATED / "JLPT-Waller-2025-08-26.import.json"
JLPT_IMPORTER = ROOT / "apps/ios/Tools/import_jlpt_level_pack.py"


class FrequencyPackRuntimeContractTests(unittest.TestCase):
    def test_optional_packs_are_downloadable_but_not_shipped_as_installed_artifacts(self) -> None:
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))

        bundled = [pack for pack in catalog["packs"] if pack["bundled"]]
        self.assertEqual(
            ["zenbu.jlpt.waller.levels", "zenbu.tubelex.youtube.ja.unidic-3.1"],
            [pack["packID"] for pack in bundled],
        )
        for pack in bundled:
            with self.subTest(pack=pack["packID"]):
                self.assertFalse(pack["removable"])
                artifact = RESOURCES / f"{pack['bundledResource']}.sqlite3"
                self.assertEqual(pack["bundledArtifactSHA256"], sha256(artifact))

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
                self.assertNotIn("kind", pack)
                self.assertNotIn("bundledResource", pack)
                self.assertRegex(pack["downloadURL"], r"^https://")

        bundled_sqlite = sorted(
            path.name
            for path in CATALOG.parent.glob("*FrequencyPack.sqlite3")
        )
        self.assertEqual(["TUBELEXFrequencyPack.sqlite3"], bundled_sqlite)
        self.assertTrue(JLPT.is_file())

    def test_every_selectable_pack_has_verified_evidence_smoke_test(self) -> None:
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        analysis = json.loads(ANALYSIS.read_text(encoding="utf-8"))
        analyzed = {candidate["packID"]: candidate for candidate in analysis["candidates"]}
        if JITEN_ANALYSIS.is_file():
            jiten = json.loads(JITEN_ANALYSIS.read_text(encoding="utf-8"))
            analyzed.update({candidate["packID"]: candidate for candidate in jiten["candidates"]})

        self.assertGreater(len(catalog["packs"]), 1)
        for pack in catalog["packs"]:
            with self.subTest(pack=pack["packID"]):
                smoke = pack.get("smokeTest")
                self.assertIsInstance(smoke, dict)
                self.assertRegex(smoke["languageReferenceID"], r"^[0-9a-f]{32}$")
                self.assertGreater(smoke["rank"], 0)
                if pack.get("orderedJSONSource") is not None:
                    self.assertEqual(smoke, analyzed[pack["packID"]]["analysis"]["smokeTest"])

        bundled = next(
            pack for pack in catalog["packs"] if pack["bundled"] and "kind" not in pack
        )
        smoke = bundled["smokeTest"]
        with sqlite3.connect(TUBELEX) as database:
            row = database.execute(
                "SELECT rank FROM frequency_evidence "
                "WHERE lower(hex(language_reference_id)) = ?",
                (smoke["languageReferenceID"],),
            ).fetchone()
        self.assertEqual((smoke["rank"],), row)

    def test_tubelex_pack_matches_its_import_report_and_ranks_shared_spellings(self) -> None:
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        report = json.loads(TUBELEX_REPORT.read_text(encoding="utf-8"))
        pack = next(p for p in catalog["packs"] if p["packID"] == report["sourceManifest"]["packID"])

        self.assertEqual(report["sourceManifest"]["mappingPolicyVersion"], pack["mappingPolicyVersion"])
        self.assertEqual(sha256(TUBELEX), report["artifactSHA256"])
        for key in (
            "mappedRows", "ambiguousRows", "unmappedRows", "duplicateMappings", "mappingSHA256",
            "artifactContentSHA256", "mappingPolicySHA256", "languageDataSHA256", "sourceSHA256",
        ):
            with self.subTest(key=key):
                self.assertEqual(report[key], pack[key])
        self.assertEqual(report["importerSHA256"], pack["offlineImporterSHA256"])

        with sqlite3.connect(TUBELEX) as database:
            database.execute("ATTACH DATABASE ? AS language", (str(LANGUAGE_DATA),))
            for headword, reading, rank in (
                ("事", "こと", 23), ("時", "とき", 57), ("上", "うえ", 127), ("先生", "せんせい", 359),
            ):
                with self.subTest(headword=headword):
                    row = database.execute(
                        "SELECT e.rank FROM frequency_evidence e "
                        "JOIN language.entries l ON l.id = e.language_reference_id "
                        "WHERE l.headword = ? AND l.reading = ?",
                        (headword, reading),
                    ).fetchone()
                    self.assertEqual((rank,), row)

    def test_jlpt_level_pack_matches_its_pinned_source_and_import_report(self) -> None:
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        record = json.loads(JLPT_RECORD.read_text(encoding="utf-8"))
        report = json.loads(JLPT_REPORT.read_text(encoding="utf-8"))
        pack = next(pack for pack in catalog["packs"] if pack.get("kind") == "level")

        self.assertEqual(record["packID"], pack["packID"])
        self.assertEqual(record["packVersion"], pack["packVersion"])
        self.assertEqual(record["source"]["snapshot"], pack["sourceSnapshot"])
        for file in record["source"]["files"]:
            with self.subTest(file=file["path"]):
                self.assertEqual(file["sha256"], sha256(JLPT_RECORD.parent / file["path"]))
        self.assertEqual(sha256(JLPT_IMPORTER), pack["offlineImporterSHA256"])
        for key in (
            "sourceBytes", "sourceSHA256", "coveredSourceRows", "mappedRows", "unmappedRows",
            "duplicateMappings", "mappingSHA256", "artifactContentSHA256",
            "offlineImporterSHA256", "languageDataSHA256", "bundledArtifactSHA256", "smokeTest",
        ):
            with self.subTest(key=key):
                self.assertEqual(report[key], pack[key])

        smoke = pack["smokeTest"]
        with sqlite3.connect(JLPT) as database:
            levels = dict(
                database.execute("SELECT level, count(*) FROM level_evidence GROUP BY level")
            )
            row = database.execute(
                "SELECT level FROM level_evidence WHERE lower(hex(language_reference_id)) = ?",
                (smoke["languageReferenceID"],),
            ).fetchone()
        self.assertEqual((smoke["rank"],), row)
        self.assertEqual(pack["mappedRows"], sum(levels.values()))
        self.assertEqual(
            report["levelCounts"], {f"N{level}": levels[level] for level in range(5, 0, -1)}
        )


if __name__ == "__main__":
    unittest.main()
