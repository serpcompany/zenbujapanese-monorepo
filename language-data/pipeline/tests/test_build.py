from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ranking_contract
import release_manifest
from refusal import Refusal
from scratch_release import Scratch, ScratchBuildTestCase, pointer, sha256


class BuildTests(ScratchBuildTestCase):
    def test_builds_the_manifest_and_the_staging_directory(self):
        manifest = self.scratch.build(self.out)
        files = {f["name"]: f for f in manifest["files"]}

        language = files["Language.sqlite3"]
        self.assertEqual(language["sha256"], self.scratch.language_sha)
        self.assertEqual(
            (language["artifact_schema"], language["schema_source"]),
            ("zenbu.language-reference.v2", "plan"),
        )
        self.assertEqual(
            language["row_counts"],
            {
                "canonical_senses": 1,
                "dictionary_form_fts": 2,
                "dictionary_gloss_fts": 2,
                "entries": 3,
                "example_fts": 1,
                "form_priority_profiles": 1,
                "forms": 2,
                "gloss_atoms": 2,
                "metadata": len(ranking_contract.TOOL_KEYS) + 5,
                "reading_form_restrictions": 0,
                "sense_form_restrictions": 0,
            },
        )
        self.assertEqual(language["depends_on"], [])

        pack = files["Pack.sqlite3"]
        self.assertEqual(
            (pack["artifact_schema"], pack["schema_source"]), ("zenbu.frequency-pack.v1", "file")
        )
        self.assertEqual(pack["depends_on"], ["Language.sqlite3", "Mapping.sql"])
        self.assertEqual(files["Elements.json"]["schema_source"], "file")
        self.assertEqual(
            (files["Contract.json"]["artifact_schema"], files["Contract.json"]["schema_source"]),
            ("zenbu.dictionary-ranking-contract.v1", "plan"),
        )
        self.assertEqual(files["Contract.json"]["depends_on"], ["Language.sqlite3"])
        self.assertEqual(
            files["Catalog.json"]["depends_on"], ["Language.sqlite3", "Pack.sqlite3", "Mapping.sql"]
        )
        self.assertEqual(files["Radicals.json"]["schema_source"], "plan")
        notice = files["Notices/NOTICE.txt"]
        self.assertEqual((notice["artifact_schema"], notice["schema_source"]), (None, "undeclared"))
        self.assertNotIn("row_counts", notice)

        expected_ids = "".join(f"{seq}\n" for seq in sorted(Scratch.ENT_SEQS)).encode()
        self.assertEqual(
            manifest["ids"],
            {
                "file": "Language.sqlite3",
                "ent_seq_count": 3,
                "ent_seq_digest": "sha256-ascending-decimal-lf",
                "ent_seq_sha256": sha256(expected_ids),
            },
        )
        self.assertEqual(
            manifest["sources"],
            [
                {
                    "name": "zenbu.wiki",
                    "version": "2022-10-20",
                    "url": "https://cdn.example.com/wiki.tsv.xz",
                    "sha256": sha256(b"source archive bytes"),
                    "bytes": 20,
                    "depends_on": ["Language.sqlite3"],
                }
            ],
        )
        self.assertEqual([c["suite"] for c in manifest["conformance"]], ["one", "two"])
        self.assertEqual(
            manifest["conformance"][0]["sha256"], sha256(self.scratch.plain["data/conf/one.json"])
        )
        self.assertIsNone(manifest["core_sha256"])
        self.assertIsNone(manifest["previous_release"])
        self.assertIsNone(manifest["previous_manifest_sha256"])
        self.assertRegex(manifest["git_commit"], r"^[0-9a-f]{40}$")

        for record in manifest["files"]:
            staged = self.out / "files" / record["sha256"] / record["name"]
            self.assertEqual(sha256(staged.read_bytes()), record["sha256"])
        self.assertEqual(json.loads((self.out / "manifest.json").read_text()), manifest)
        release_manifest.validate(self.out)

    def test_leaves_the_committed_files_untouched(self):
        root = self.scratch.root
        before = {
            p: p.read_bytes() for p in root.rglob("*") if p.is_file() and ".git" not in p.parts
        }
        self.scratch.build(self.out)
        after = {
            p: p.read_bytes() for p in root.rglob("*") if p.is_file() and ".git" not in p.parts
        }
        self.assertEqual(before, after)

    def test_refuses_an_lfs_file_that_differs_from_its_pointer(self):
        self.scratch.write(
            "data/res/Pack.sqlite3", self.scratch.lfs["data/res/Pack.sqlite3"] + b"x"
        )
        self.refused(r"Pack\.sqlite3: .* but its LFS pointer at HEAD names")

    def test_refuses_an_lfs_file_that_was_never_pulled(self):
        self.scratch.write(
            "data/res/Pack.sqlite3", pointer(self.scratch.lfs["data/res/Pack.sqlite3"])
        )
        self.refused(r"still an LFS pointer: run git lfs pull")

    def test_refuses_an_uncommitted_edit(self):
        self.scratch.write("data/res/NOTICE.txt", b"edited\n")
        self.refused(r"NOTICE\.txt differs from HEAD")

    def test_refuses_a_file_missing_at_head(self):
        self.scratch.inputs["files"].append({"name": "Missing.json", "path": "res/Missing.json"})
        self.refused(r"not committed at HEAD: \['data/res/Missing\.json'\]")

    def test_keeps_an_existing_empty_output_directory_after_a_refusal(self):
        self.out.mkdir()
        self.scratch.write("data/res/NOTICE.txt", b"edited\n")
        with self.assertRaises(Refusal):
            self.scratch.build(self.out)
        self.assertEqual(list(self.out.iterdir()), [])

    def test_refuses_a_planned_schema_for_a_file_that_declares_one(self):
        self.scratch.inputs["files"][1]["artifact_schema"] = "zenbu.frequency-pack.v2"
        self.refused(r"Pack\.sqlite3 declares zenbu\.frequency-pack\.v1")

    def test_refuses_a_non_empty_output_directory(self):
        self.out.mkdir()
        (self.out / "stale").write_text("x")
        with self.assertRaisesRegex(Refusal, r"isn't empty"):
            self.scratch.build(self.out)
        self.assertTrue((self.out / "stale").exists())

    def test_validate_refuses_tampered_or_extra_staged_files(self):
        manifest = self.scratch.build(self.out)
        extra = self.out / "files" / ("6" * 64) / "extra.txt"
        extra.parent.mkdir(parents=True)
        extra.write_text("x")
        with self.assertRaisesRegex(Refusal, r"extra \['files/6{64}/extra\.txt'\]"):
            release_manifest.validate(self.out)
        extra.unlink()
        record = manifest["files"][-1]
        (self.out / "files" / record["sha256"] / record["name"]).write_text("tampered")
        with self.assertRaisesRegex(Refusal, r"doesn't match its manifest entry"):
            release_manifest.validate(self.out)

    def test_validate_refuses_a_dependency_that_names_nothing(self):
        manifest = self.scratch.build(self.out)
        manifest["files"][1]["depends_on"] = ["Nothing.sqlite3"]
        (self.out / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(Refusal, r"depends on \['Nothing\.sqlite3'\]"):
            release_manifest.validate(self.out)


if __name__ == "__main__":
    unittest.main()
