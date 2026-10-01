from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import release_inputs
import release_manifest
from scratch_release import Scratch

SCHEMA = json.loads(release_manifest.SCHEMA_PATH.read_text())


class SchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(tmp.cleanup)
        cls.manifest = Scratch(Path(tmp.name) / "repo").build(Path(tmp.name) / "out")
        cls.validator = jsonschema.Draft202012Validator(SCHEMA)

    def assertInvalid(self, change) -> None:
        manifest = copy.deepcopy(self.manifest)
        change(manifest)
        self.assertFalse(self.validator.is_valid(manifest), json.dumps(manifest)[:300])

    def test_the_schema_is_valid_draft_2020_12(self):
        jsonschema.Draft202012Validator.check_schema(SCHEMA)

    def test_the_packager_and_the_schema_share_the_name_pattern(self):
        self.assertEqual(SCHEMA["$defs"]["name"]["pattern"], release_inputs.NAME.pattern)
        self.assertEqual(SCHEMA["properties"]["release"]["pattern"], release_inputs.RELEASE.pattern)

    def test_accepts_a_packaged_manifest(self):
        self.validator.validate(self.manifest)
        later = copy.deepcopy(self.manifest)
        later.update(
            previous_release="2026.10.1", previous_manifest_sha256="7" * 64, release="2026.11.1"
        )
        later["workflow_run"] = {
            "repository": "serpcompany/zenbujapanese-monorepo",
            "workflow": "Language data build",
            "run_id": 1,
            "run_attempt": 1,
            "url": "https://github.com/serpcompany/zenbujapanese-monorepo/actions/runs/1",
        }
        later["core_sha256"] = "8" * 64
        self.validator.validate(later)

    def test_rejects_malformed_manifests(self):
        def sqlite_file(m):
            return next(f for f in m["files"] if f["name"].endswith(".sqlite3"))

        def text_file(m):
            return next(f for f in m["files"] if f["name"] == "Notices/NOTICE.txt")

        cases = {
            "an unknown manifest schema": lambda m: m.update(
                manifest_schema="zenbu.language-data-manifest.v2"
            ),
            "a malformed release": lambda m: m.update(release="2026.13.1"),
            "a missing field": lambda m: m.pop("ids"),
            "an unknown field": lambda m: m.update(extra=1),
            "a previous release without its manifest": lambda m: m.update(
                previous_release="2026.09.1"
            ),
            "a previous manifest without its release": lambda m: m.update(
                previous_manifest_sha256="9" * 64
            ),
            "an uppercase SHA-256": lambda m: sqlite_file(m).update(sha256="A" * 64),
            "a SQLite file without row counts": lambda m: sqlite_file(m).pop("row_counts"),
            "row counts on a text file": lambda m: text_file(m).update(row_counts={"x": 1}),
            "an undeclared file with a schema": lambda m: text_file(m).update(
                artifact_schema="zenbu.x.v1"
            ),
            "a declared file without one": lambda m: sqlite_file(m).update(artifact_schema=None),
            "a malformed artifact schema": lambda m: sqlite_file(m).update(
                artifact_schema="zenbu.Pack.1"
            ),
            "a name that climbs out": lambda m: text_file(m).update(name="../x.json"),
            "a three-segment name": lambda m: text_file(m).update(name="a/b/c.json"),
            "a negative size": lambda m: text_file(m).update(bytes=-1),
            "repeated dependencies": lambda m: sqlite_file(m).update(depends_on=["a", "a"]),
            "another ent_seq digest": lambda m: m["ids"].update(ent_seq_digest="sha256-file-order"),
            "no files": lambda m: m.update(files=[]),
            "an http source": lambda m: m["sources"][0].update(url="http://cdn.example.com/x"),
        }
        for label, change in cases.items():
            with self.subTest(label):
                self.assertInvalid(change)


if __name__ == "__main__":
    unittest.main()
