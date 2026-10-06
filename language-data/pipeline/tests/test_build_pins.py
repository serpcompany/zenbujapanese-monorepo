from __future__ import annotations

import copy
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from scratch_release import ScratchBuildTestCase, sha256


class BuildPinTests(ScratchBuildTestCase):
    def test_refuses_suites_that_pin_a_file_differently(self):
        suite = json.loads(self.scratch.plain["data/conf/one.json"])
        suite["artifact"]["sha256"] = "2" * 64
        self.scratch.plain["data/conf/one.json"] = json.dumps(suite).encode()
        self.scratch.commit()
        self.refused(r"two\.json pins Language\.sqlite3 at .* but one\.json pins it at 2{64}")

    def test_refuses_a_file_that_differs_from_every_suites_pin(self):
        for path in ("data/conf/one.json", "data/conf/two.json"):
            self.scratch.plain[path] = self.scratch.plain[path].replace(
                self.scratch.language_sha.encode(), b"3" * 64
            )
        self.scratch.commit()
        self.refused(r"Language\.sqlite3: SHA-256 .* but one\.json pins 3{64}")

    def test_refuses_a_pin_on_a_file_read_but_not_packaged(self):
        self.scratch.drop("Catalog.json")
        self.scratch.set_suite_two()
        suite = json.loads(self.scratch.plain["data/conf/two.json"])
        next(a for a in suite["artifacts"] if a["name"] == "Catalog.json")["sha256"] = "c" * 64
        self.scratch.plain["data/conf/two.json"] = json.dumps(suite).encode()
        self.scratch.commit()
        self.refused(r"Catalog\.json: SHA-256 .* but two\.json pins c{64}")

    def test_accepts_a_catalog_read_but_not_packaged_that_matches_its_pin(self):
        self.scratch.drop("Catalog.json")
        manifest = self.scratch.build(self.out)
        self.assertNotIn("Catalog.json", [f["name"] for f in manifest["files"]])
        self.assertEqual(len(manifest["sources"]), 1)

    def test_refuses_a_bundled_pack_outside_the_release(self):
        self.scratch.drop("Pack.sqlite3")
        self.refused(r"zenbu\.pack is bundled as Pack\.sqlite3, which isn't in the release")

    def test_refuses_a_language_data_pin_on_another_release_file(self):
        self.scratch.bundle_pack(self.scratch.mapping_sha)
        self.scratch.set_suite_two()
        self.scratch.commit()
        self.refused(r"Pack\.sqlite3: language_data_sha256 pins [0-9a-f]{64}, not Language")

    def test_refuses_a_catalog_language_data_pin_on_another_file(self):
        self.scratch.catalog["packs"][1]["languageDataSHA256"] = self.scratch.pack_sha
        self.scratch.set_catalog()
        self.scratch.set_suite_two()
        self.scratch.commit()
        self.refused(r"zenbu\.wiki: languageDataSHA256 pins [0-9a-f]{64}, not Language")

    def test_refuses_a_ranking_contract_that_disagrees_with_the_database(self):
        changes = {
            "databaseBytes": lambda c: c.update(databaseBytes=1),
            "policy": lambda c: c.update(policy="other"),
            "schemaVersion": lambda c: c.update(schemaVersion="zenbu.dictionary-ranking.v2"),
            "mappingSHA256": lambda c: c.update(mappingSHA256="d" * 64),
            "evidenceCounts": lambda c: c["evidenceCounts"].update(gloss_atoms=3),
            "searchIndex": lambda c: c["searchIndex"].update(form_rows=3),
            r"toolSHA256\.shared_tooling_sha256": lambda c: c["toolSHA256"].update(
                shared_tooling_sha256="e" * 64
            ),
            "semanticEquivalence": lambda c: c["semanticEquivalence"].update(source_rows=3),
            r"semanticEquivalence\.normalization": lambda c: c["semanticEquivalence"].update(
                normalization="other"
            ),
        }
        original = copy.deepcopy(self.scratch.contract)
        for what, change in changes.items():
            with self.subTest(what):
                self.scratch.contract = copy.deepcopy(original)
                change(self.scratch.contract)
                self.scratch.set_contract()
                self.scratch.commit()
                self.refused(rf"Contract\.json: {what} disagrees with Language\.sqlite3")

    def test_refuses_a_ranking_contract_whose_counts_differ_from_the_tables(self):
        language = self.scratch.lfs["data/res/Language.sqlite3"]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "db.sqlite3"
            path.write_bytes(language)
            with closing(sqlite3.connect(path)) as connection:
                connection.execute("INSERT INTO canonical_senses VALUES (2)")
                connection.commit()
            changed = path.read_bytes()
        self.scratch.lfs["data/res/Language.sqlite3"] = changed
        self.scratch.language_sha = sha256(changed)
        self.scratch.contract.update(databaseSHA256=sha256(changed), databaseBytes=len(changed))
        self.scratch.set_contract()
        for pack in self.scratch.catalog["packs"]:
            pack["languageDataSHA256"] = sha256(changed)
        self.scratch.bundle_pack(sha256(changed))
        self.scratch.plain["data/conf/one.json"] = json.dumps(
            {"suite": "one", "artifact": {"name": "Language.sqlite3", "sha256": sha256(changed)}}
        ).encode()
        self.scratch.set_suite_two()
        self.scratch.commit()
        self.refused(r"the row count of canonical_senses disagrees")

    def test_refuses_a_catalog_that_disagrees_with_the_bundled_pack(self):
        self.scratch.catalog["packs"][0]["bundledArtifactSHA256"] = "5" * 64
        self.scratch.set_catalog()
        self.scratch.set_suite_two()
        self.scratch.commit()
        self.refused(r"zenbu\.pack pins Pack\.sqlite3 at 5{64}")

    def test_refuses_a_source_archive_that_differs_from_the_catalog(self):
        self.scratch.lfs["data/src/Wiki.tsv.xz"] = b"another archive"
        self.scratch.commit()
        self.refused(r"zenbu\.wiki: the catalog names")


if __name__ == "__main__":
    unittest.main()
