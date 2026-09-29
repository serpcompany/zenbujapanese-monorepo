"""The packager and the manifest schema, on a small scratch repository, plus the real inputs.

Run: python3 -m unittest discover -s language-data/pipeline/tests (needs requirements.txt).
"""

from __future__ import annotations

import copy
import fnmatch
import hashlib
import io
import json
import re
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import package  # noqa: E402

REPO = package.REPO_ROOT
SCHEMA = json.loads(package.SCHEMA_PATH.read_text())
QUIET = lambda *_: None  # noqa: E731


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sqlite_bytes(statements: list[str]) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "db.sqlite3"
        connection = sqlite3.connect(path)
        connection.executescript(";\n".join(statements))
        connection.commit()
        connection.close()
        return path.read_bytes()


def pointer(data: bytes) -> bytes:
    return (
        f"version https://git-lfs.github.com/spec/v1\noid sha256:{sha256(data)}\nsize {len(data)}\n"
    ).encode()


class Scratch:
    """A Git repository shaped like the real one: LFS files committed as pointers, with their
    real bytes in the working tree, as after `git lfs pull`."""

    ENT_SEQS = [1000220, 1000000, 2830705]

    def __init__(self, root: Path):
        self.root = root
        self.lfs: dict[str, bytes] = {}
        self.plain: dict[str, bytes] = {}
        language = sqlite_bytes(
            [
                "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                "INSERT INTO metadata VALUES ('transform', '\"x-v2\"')",
                "CREATE TABLE entries (id BLOB PRIMARY KEY, source_identity TEXT, "
                "source_record_id INTEGER)",
                *[
                    f"INSERT INTO entries VALUES (x'{i:02x}', 'edrdg.jmdict', {seq})"
                    for i, seq in enumerate(self.ENT_SEQS)
                ],
                "CREATE TABLE forms (entry_id BLOB, text TEXT)",
                "INSERT INTO forms VALUES (x'00', 'a'), (x'01', 'b')",
                "CREATE VIRTUAL TABLE forms_fts USING fts4(text)",
                "INSERT INTO forms_fts VALUES ('a')",
            ]
        )
        self.language_sha = sha256(language)
        pack = sqlite_bytes(
            [
                "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                "INSERT INTO metadata VALUES ('artifact_schema', 'zenbu.frequency-pack.v1'), "
                f"('language_data_sha256', '{self.language_sha}')",
                "CREATE TABLE frequency_evidence (entry_id BLOB, rank INTEGER)",
                "INSERT INTO frequency_evidence VALUES (x'00', 1)",
            ]
        )
        archive = b"source archive bytes"
        self.lfs = {
            "data/res/Language.sqlite3": language,
            "data/res/Pack.sqlite3": pack,
            "data/src/Wiki.tsv.xz": archive,
        }
        self.plain = {
            "data/res/Elements.json": json.dumps({"schema": "zenbu.kanji-elements.v1"}).encode(),
            "data/res/Radicals.json": json.dumps({"snapshot": "x"}).encode(),
            "data/res/NOTICE.txt": b"notice\n",
            "data/res/Contract.json": json.dumps(
                {
                    "schemaVersion": "zenbu.dictionary-ranking.v1",
                    "databaseSHA256": self.language_sha,
                    "databaseBytes": len(language),
                    "evidenceCounts": {"forms": 2},
                }
            ).encode(),
            "data/res/Catalog.json": json.dumps(
                {
                    "packs": [
                        {
                            "packID": "zenbu.pack",
                            "packVersion": "1",
                            "bundled": True,
                            "bundledResource": "Pack",
                            "bundledArtifactSHA256": sha256(pack),
                            "languageDataSHA256": self.language_sha,
                            "downloadURL": "https://example.com/pack",
                            "sourceSHA256": "0" * 64,
                            "sourceBytes": 1,
                        },
                        {
                            "packID": "zenbu.wiki",
                            "packVersion": "2022-10-20",
                            "bundled": False,
                            "languageDataSHA256": self.language_sha,
                            "downloadURL": "https://cdn.example.com/wiki.tsv.xz",
                            "sourceSHA256": sha256(archive),
                            "sourceBytes": len(archive),
                        },
                    ]
                }
            ).encode(),
            "data/conf/one.json": json.dumps(
                {
                    "suite": "one",
                    "artifact": {"name": "Language.sqlite3", "sha256": self.language_sha},
                }
            ).encode(),
            "data/conf/two.json": json.dumps(
                {
                    "suite": "two",
                    "artifacts": [
                        {"name": "Language.sqlite3", "sha256": self.language_sha},
                        {"name": "Pack.sqlite3", "sha256": sha256(pack)},
                        {"name": "Unpackaged.json", "sha256": "1" * 64},
                    ],
                }
            ).encode(),
        }
        self.inputs = {
            "roots": {"res": "data/res", "src": "data/src", "conf": "data/conf"},
            "files": [
                {
                    "name": "Language.sqlite3",
                    "path": "res/Language.sqlite3",
                    "artifact_schema": "zenbu.language-reference.v2",
                },
                {"name": "Pack.sqlite3", "path": "res/Pack.sqlite3"},
                {"name": "Elements.json", "path": "res/Elements.json"},
                {"name": "Radicals.json", "path": "res/Radicals.json"},
                {"name": "Contract.json", "path": "res/Contract.json"},
                {"name": "Notices/NOTICE.txt", "path": "res/NOTICE.txt"},
            ],
            "frequency_pack_catalog": "res/Catalog.json",
            "source_archives": {"zenbu.wiki": "src/Wiki.tsv.xz"},
            "conformance": ["conf/one.json", "conf/two.json"],
        }
        self.release = {
            "release": "2026.10.1",
            "previous_release": None,
            "previous_manifest_sha256": None,
        }
        self.root.mkdir(parents=True)
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Test")
        self.commit()

    def git(self, *args: str) -> None:
        subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def write(self, path: str, data: bytes) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def commit(self) -> None:
        """Commit pointers for the LFS files and the plain files, then put the LFS bytes back."""
        for path, data in self.lfs.items():
            self.write(path, pointer(data))
        for path, data in self.plain.items():
            self.write(path, data)
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", "fixture")
        for path, data in self.lfs.items():
            self.write(path, data)

    def build(self, out: Path) -> dict:
        inputs_path = self.root.parent / "inputs.json"
        inputs_path.write_text(json.dumps(self.inputs))
        return package.build(
            self.root, package.load_inputs(inputs_path), self.release, out, log=QUIET
        )


class PackagerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.scratch = Scratch(Path(self.tmp.name) / "repo")
        self.out = Path(self.tmp.name) / "out"

    def refused(self, pattern: str) -> None:
        with self.assertRaisesRegex(package.Refusal, pattern):
            self.scratch.build(self.out)

    def test_builds_the_manifest_and_the_staging_directory(self):
        manifest = self.scratch.build(self.out)
        files = {f["name"]: f for f in manifest["files"]}

        language = files["Language.sqlite3"]
        self.assertEqual(language["sha256"], self.scratch.language_sha)
        self.assertEqual(
            (language["artifact_schema"], language["schema_source"]),
            ("zenbu.language-reference.v2", "plan"),
        )
        # Ordinary tables, including the FTS shadow tables, but not the virtual table itself.
        self.assertEqual(language["row_counts"]["entries"], 3)
        self.assertEqual(language["row_counts"]["forms"], 2)
        self.assertEqual(language["row_counts"]["forms_fts_docsize"], 1)
        self.assertNotIn("forms_fts", language["row_counts"])
        self.assertEqual(language["depends_on"], [])

        pack = files["Pack.sqlite3"]
        self.assertEqual(
            (pack["artifact_schema"], pack["schema_source"]), ("zenbu.frequency-pack.v1", "file")
        )
        self.assertEqual(pack["depends_on"], ["Language.sqlite3"])
        self.assertEqual(files["Elements.json"]["schema_source"], "file")
        self.assertEqual(files["Contract.json"]["depends_on"], ["Language.sqlite3"])
        # schemaVersion names what the contract checks, not the contract file's own format.
        self.assertIsNone(files["Contract.json"]["artifact_schema"])
        for name in ("Radicals.json", "Notices/NOTICE.txt"):
            self.assertEqual(
                (files[name]["artifact_schema"], files[name]["schema_source"]), (None, "undeclared")
            )
            self.assertNotIn("row_counts", files[name])

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
        self.assertRegex(manifest["git_commit"], r"^[0-9a-f]{40}$")

        # Each file at files/<sha256>/<name>, byte for byte, and the manifest beside them.
        for record in manifest["files"]:
            staged = self.out / "files" / record["sha256"] / record["name"]
            self.assertEqual(sha256(staged.read_bytes()), record["sha256"])
        self.assertEqual(json.loads((self.out / "manifest.json").read_text()), manifest)
        package.validate(self.out)

    def test_leaves_the_committed_files_untouched(self):
        root = self.scratch.root
        before = {
            p: p.read_bytes() for p in root.rglob("*") if p.is_file() and ".git" not in p.parts
        }
        self.scratch.build(self.out)
        after = {
            p: p.read_bytes() for p in root.rglob("*") if p.is_file() and ".git" not in p.parts
        }
        self.assertEqual(before, after)  # no changed bytes, no -wal, -shm, or -journal files

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

    def test_refuses_a_conformance_pin_mismatch(self):
        suite = json.loads(self.scratch.plain["data/conf/one.json"])
        suite["artifact"]["sha256"] = "2" * 64
        self.scratch.plain["data/conf/one.json"] = json.dumps(suite).encode()
        self.scratch.commit()
        # two.json still pins the real SHA-256, so the suites disagree first.
        self.refused(r"pins Language\.sqlite3 at")

    def test_refuses_a_file_that_differs_from_every_suites_pin(self):
        for path in ("data/conf/one.json", "data/conf/two.json"):
            self.scratch.plain[path] = self.scratch.plain[path].replace(
                self.scratch.language_sha.encode(), b"3" * 64
            )
        self.scratch.commit()
        self.refused(r"Language\.sqlite3: SHA-256 .* but one\.json pins 3{64}")

    def test_refuses_a_dependency_outside_the_release(self):
        self.scratch.inputs["files"] = [
            f for f in self.scratch.inputs["files"] if f["name"] != "Contract.json"
        ]
        self.scratch.lfs["data/res/Pack.sqlite3"] = sqlite_bytes(
            [
                "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                f"INSERT INTO metadata VALUES ('language_data_sha256', '{'4' * 64}')",
            ]
        )
        self.scratch.plain["data/conf/two.json"] = json.dumps(
            {
                "suite": "two",
                "artifacts": [{"name": "Language.sqlite3", "sha256": self.scratch.language_sha}],
            }
        ).encode()
        self.scratch.commit()
        self.refused(r"Pack\.sqlite3: language_data_sha256 pins 4{64}, which is no file")

    def test_refuses_a_planned_schema_for_a_file_that_declares_one(self):
        self.scratch.inputs["files"][1]["artifact_schema"] = "zenbu.frequency-pack.v2"
        self.refused(r"Pack\.sqlite3 declares zenbu\.frequency-pack\.v1")

    def test_refuses_a_ranking_contract_that_disagrees_with_the_database(self):
        contract = json.loads(self.scratch.plain["data/res/Contract.json"])
        contract["evidenceCounts"]["forms"] = 3
        self.scratch.plain["data/res/Contract.json"] = json.dumps(contract).encode()
        self.scratch.commit()
        self.refused(r"Contract\.json: forms should hold 3 rows")

    def test_refuses_a_catalog_that_disagrees_with_the_bundled_pack(self):
        catalog = json.loads(self.scratch.plain["data/res/Catalog.json"])
        catalog["packs"][0]["bundledArtifactSHA256"] = "5" * 64
        self.scratch.plain["data/res/Catalog.json"] = json.dumps(catalog).encode()
        self.scratch.commit()
        self.refused(r"zenbu\.pack pins Pack\.sqlite3 at 5{64}")

    def test_refuses_a_source_archive_that_differs_from_the_catalog(self):
        self.scratch.lfs["data/src/Wiki.tsv.xz"] = b"another archive"
        self.scratch.commit()
        self.refused(r"zenbu\.wiki: the catalog names")

    def test_refuses_a_non_empty_output_directory(self):
        self.out.mkdir()
        (self.out / "stale").write_text("x")
        self.refused(r"isn't empty")

    def test_validate_refuses_tampered_or_extra_staged_files(self):
        manifest = self.scratch.build(self.out)
        extra = self.out / "files" / ("6" * 64) / "extra.txt"
        extra.parent.mkdir(parents=True)
        extra.write_text("x")
        with self.assertRaisesRegex(package.Refusal, r"extra \['files/6{64}/extra\.txt'\]"):
            package.validate(self.out)
        extra.unlink()
        record = manifest["files"][-1]
        (self.out / "files" / record["sha256"] / record["name"]).write_text("tampered")
        with self.assertRaisesRegex(package.Refusal, r"doesn't match its manifest entry"):
            package.validate(self.out)

    def test_validate_refuses_a_dependency_that_names_nothing(self):
        manifest = self.scratch.build(self.out)
        manifest["files"][1]["depends_on"] = ["Nothing.sqlite3"]
        (self.out / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(package.Refusal, r"depends on \['Nothing\.sqlite3'\]"):
            package.validate(self.out)


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

        def json_file(m):
            return next(f for f in m["files"] if f["name"] == "Radicals.json")

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
            "row counts on a JSON file": lambda m: json_file(m).update(row_counts={"x": 1}),
            "an undeclared file with a schema": lambda m: json_file(m).update(
                artifact_schema="zenbu.x.v1"
            ),
            "a declared file without one": lambda m: sqlite_file(m).update(artifact_schema=None),
            "a malformed artifact schema": lambda m: sqlite_file(m).update(
                artifact_schema="zenbu.Pack.1"
            ),
            "a name that climbs out": lambda m: json_file(m).update(name="../x.json"),
            "a three-segment name": lambda m: json_file(m).update(name="a/b/c.json"),
            "a negative size": lambda m: json_file(m).update(bytes=-1),
            "repeated dependencies": lambda m: sqlite_file(m).update(depends_on=["a", "a"]),
            "another ent_seq digest": lambda m: m["ids"].update(ent_seq_digest="sha256-file-order"),
            "no files": lambda m: m.update(files=[]),
            "an http source": lambda m: m["sources"][0].update(url="http://cdn.example.com/x"),
        }
        for label, change in cases.items():
            with self.subTest(label):
                self.assertInvalid(change)


class RealInputsTests(unittest.TestCase):
    """release-inputs.json and release.json as committed, without downloading any LFS file."""

    @classmethod
    def setUpClass(cls):
        cls.inputs = package.load_inputs(REPO / "language-data" / "release-inputs.json")

    def test_every_input_is_committed(self):
        paths = [f["path"] for f in self.inputs.files] + [self.inputs.catalog]
        paths += list(self.inputs.source_archives.values()) + self.inputs.conformance
        package.committed(REPO, paths)

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
            "EDRDG-ATTRIBUTION.md",
            "TATOEBA-NOTICE.txt",
            "KANJIVG-CC-BY-SA-3.0.txt",
            "Kuromoji/NOTICE.md",
        ):
            self.assertIn(name, names)
        planned = {
            f["name"]: f.get("artifact_schema")
            for f in self.inputs.files
            if f.get("artifact_schema")
        }
        self.assertEqual(planned, {"LanguageReferenceData.sqlite3": "zenbu.language-reference.v2"})

    def test_the_lfs_files_are_the_databases_and_the_kuromoji_dictionary(self):
        paths = package.lfs_paths(REPO, self.inputs)
        self.assertEqual(len(paths), 18)
        self.assertTrue(
            all(re.search(r"(\.sqlite3|/Kuromoji/[a-z_]+\.dat\.gz)$", p) for p in paths)
        )

    def test_release_json_names_a_release(self):
        release = package.load_release(REPO / "language-data" / "release.json")
        self.assertRegex(release["release"], SCHEMA["properties"]["release"]["pattern"])

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
        self.assertEqual(output.getvalue().strip().split(","), package.lfs_paths(REPO, self.inputs))


if __name__ == "__main__":
    unittest.main()
