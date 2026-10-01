from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import release_inputs
from refusal import Refusal


class InputValidationTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = Path(tmp.name) / "inputs.json"
        self.inputs = {
            "roots": {"res": "data/res", "conf": "data/conf"},
            "files": [{"name": "A.json", "path": "res/A.json"}],
            "conformance": ["conf/one.json"],
        }

    def load(self):
        self.path.write_text(json.dumps(self.inputs))
        return release_inputs.load_inputs(self.path)

    def test_accepts_plain_names_and_paths(self):
        self.inputs["files"].append({"name": "Kuromoji/base.dat.gz", "path": "res/K/base.dat.gz"})
        self.assertEqual(self.load().files[1]["path"], "data/res/K/base.dat.gz")

    def test_refuses_bad_names(self):
        for name in ("../A.json", "a/../b", "./A.json", "/A.json", "a/b/c.json", ".hidden", "", 3):
            with self.subTest(name):
                self.inputs["files"] = [{"name": name, "path": "res/A.json"}]
                with self.assertRaisesRegex(Refusal, r"isn't a release name"):
                    self.load()

    def test_refuses_bad_paths(self):
        for path in (
            "res/../../etc/passwd",
            "res/./A.json",
            "/res/A.json",
            "res//A.json",
            "res\\A",
        ):
            with self.subTest(path):
                self.inputs["files"] = [{"name": "A.json", "path": path}]
                with self.assertRaisesRegex(Refusal, r"must be a plain path"):
                    self.load()

    def test_refuses_bad_roots_and_other_paths(self):
        cases = {
            "an absolute root": lambda i: i["roots"].update(res="/etc"),
            "a climbing root": lambda i: i["roots"].update(res="../outside"),
            "a climbing suite": lambda i: i.update(conformance=["conf/../../x.json"]),
            "a climbing catalog": lambda i: i.update(frequency_pack_catalog="res/../../x.json"),
        }
        original = copy.deepcopy(self.inputs)
        for label, change in cases.items():
            with self.subTest(label):
                self.inputs = copy.deepcopy(original)
                change(self.inputs)
                with self.assertRaisesRegex(Refusal, r"must be a plain path"):
                    self.load()

    def test_refuses_an_unknown_root_and_a_bad_source_name(self):
        self.inputs["files"] = [{"name": "A.json", "path": "other/A.json"}]
        with self.assertRaisesRegex(Refusal, r"doesn't start with one of the roots"):
            self.load()
        self.inputs["files"] = [{"name": "A.json", "path": "res/A.json"}]
        self.inputs["source_archives"] = {"../pack": "res/x.xz"}
        with self.assertRaisesRegex(Refusal, r"isn't a release name"):
            self.load()

    def test_refuses_a_malformed_release_id(self):
        path = self.path.with_name("release.json")
        for release in ("2026.13.1", "2026.10.0", "latest"):
            with self.subTest(release):
                path.write_text(json.dumps({"release": release}))
                with self.assertRaisesRegex(Refusal, r"isn't YYYY\.MM\.N"):
                    release_inputs.load_release(path)


if __name__ == "__main__":
    unittest.main()
