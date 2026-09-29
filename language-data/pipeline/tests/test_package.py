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
from contextlib import closing, redirect_stdout
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
        with closing(sqlite3.connect(path)) as connection:
            connection.executescript(";\n".join(statements))
            connection.commit()
        return path.read_bytes()


def pointer(data: bytes) -> bytes:
    return (
        f"version https://git-lfs.github.com/spec/v1\noid sha256:{sha256(data)}\nsize {len(data)}\n"
    ).encode()


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


EVIDENCE = {
    "form_priority_profiles": 1,
    "canonical_senses": 1,
    "gloss_atoms": 2,
    "sense_form_restrictions": 0,
    "reading_form_restrictions": 0,
}
SEARCH_INDEX = {
    "schema": "zenbu.dictionary-search-index.v1",
    "technology": "sqlite-fts4",
    "gloss_rows": 2,
    "form_rows": 2,
}
TOOLS = {key: f"{i}" * 64 for i, key in enumerate(package.TOOL_KEYS)}


def language_database() -> bytes:
    """A small zenbu.language-reference database with what the ranking contract checks.
    Metadata values are JSON, as import_jmdict.py writes them."""
    metadata = {
        "dictionary_ranking_policy": "dictionary-best-match-v1",
        "dictionary_ranking_schema_version": "zenbu.dictionary-ranking.v1",
        "dictionary_ranking_mapping_sha256": "a" * 64,
        # A key the app doesn't decode, which it ignores.
        "dictionary_ranking_evidence": {**EVIDENCE, "ignored": 7},
        "dictionary_search_index": SEARCH_INDEX,
        **TOOLS,
    }
    return sqlite_bytes(
        [
            "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            *[
                f"INSERT INTO metadata VALUES ({sql_text(k)}, {sql_text(json.dumps(v))})"
                for k, v in metadata.items()
            ],
            "CREATE TABLE entries (id BLOB PRIMARY KEY, source_identity TEXT, "
            "source_record_id INTEGER, semantic_fingerprint BLOB)",
            *[
                f"INSERT INTO entries VALUES (x'{i:02x}', 'edrdg.jmdict', {seq}, x'{min(i, 1):02x}')"
                for i, seq in enumerate(Scratch.ENT_SEQS)
            ],
            "CREATE TABLE forms (form TEXT)",
            "INSERT INTO forms VALUES ('a'), ('b')",
            "CREATE TABLE gloss_atoms (normalized_text TEXT)",
            "INSERT INTO gloss_atoms VALUES ('to eat'), ('to drink')",
            "CREATE TABLE form_priority_profiles (x)",
            "INSERT INTO form_priority_profiles VALUES (1)",
            "CREATE TABLE canonical_senses (x)",
            "INSERT INTO canonical_senses VALUES (1)",
            "CREATE TABLE sense_form_restrictions (x)",
            "CREATE TABLE reading_form_restrictions (x)",
            "CREATE VIRTUAL TABLE dictionary_form_fts USING fts4(form, content='forms')",
            "INSERT INTO dictionary_form_fts(dictionary_form_fts) VALUES ('rebuild')",
            "CREATE VIRTUAL TABLE dictionary_gloss_fts USING "
            "fts4(normalized_text, content='gloss_atoms')",
            "INSERT INTO dictionary_gloss_fts(dictionary_gloss_fts) VALUES ('rebuild')",
            "CREATE VIRTUAL TABLE example_fts USING fts4(english)",
            "INSERT INTO example_fts VALUES ('one sentence')",
        ]
    )


def pack_database(language_sha: str, mapping_sha: str) -> bytes:
    # The pack importers write bare metadata values.
    return sqlite_bytes(
        [
            "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "INSERT INTO metadata VALUES ('artifact_schema', 'zenbu.frequency-pack.v1'), "
            f"('language_data_sha256', '{language_sha}'), "
            f"('mapping_policy_sha256', '{mapping_sha}')",
            "CREATE TABLE frequency_evidence (entry_id BLOB, rank INTEGER)",
            "INSERT INTO frequency_evidence VALUES (x'00', 1)",
        ]
    )


class Scratch:
    """A Git repository shaped like the real one: LFS files committed as pointers, with their
    real bytes in the working tree, as after `git lfs pull`."""

    ENT_SEQS = [1000220, 1000000, 2830705]

    def __init__(self, root: Path):
        self.root = root
        language = language_database()
        self.language_sha = sha256(language)
        mapping = b"-- mapping policy\n"
        self.mapping_sha = sha256(mapping)
        pack = pack_database(self.language_sha, self.mapping_sha)
        self.pack_sha = sha256(pack)
        archive = b"source archive bytes"
        self.lfs: dict[str, bytes] = {
            "data/res/Language.sqlite3": language,
            "data/res/Pack.sqlite3": pack,
            "data/src/Wiki.tsv.xz": archive,
        }
        self.catalog = {
            "packs": [
                {
                    "packID": "zenbu.pack",
                    "packVersion": "1",
                    "bundled": True,
                    "bundledResource": "Pack",
                    "bundledArtifactSHA256": self.pack_sha,
                    "languageDataSHA256": self.language_sha,
                    "mappingPolicySHA256": self.mapping_sha,
                    "downloadURL": "https://example.com/pack",
                    "sourceSHA256": "0" * 64,
                    "sourceBytes": 1,
                },
                {
                    "packID": "zenbu.wiki",
                    "packVersion": "2022-10-20",
                    "bundled": False,
                    "languageDataSHA256": self.language_sha,
                    "mappingPolicySHA256": "b" * 64,  # not a release file, as JLPT's isn't
                    "downloadURL": "https://cdn.example.com/wiki.tsv.xz",
                    "sourceSHA256": sha256(archive),
                    "sourceBytes": len(archive),
                },
            ]
        }
        self.contract = {
            "policy": "dictionary-best-match-v1",
            "schemaVersion": "zenbu.dictionary-ranking.v1",
            "databaseSHA256": self.language_sha,
            "databaseBytes": len(language),
            "mappingSHA256": "a" * 64,
            "evidenceCounts": EVIDENCE,
            "semanticEquivalence": {
                "normalization": "opaque-app-id-lexicographic-min-v1",
                "duplicate_groups": 1,
                "source_rows": 2,
            },
            "searchIndex": SEARCH_INDEX,
            "toolSHA256": TOOLS,
        }
        self.plain: dict[str, bytes] = {
            "data/res/Elements.json": json.dumps({"schema": "zenbu.kanji-elements.v1"}).encode(),
            "data/res/Radicals.json": json.dumps({"snapshot": "x"}).encode(),
            "data/res/NOTICE.txt": b"notice\n",
            "data/res/Mapping.sql": mapping,
            "data/conf/one.json": json.dumps(
                {
                    "suite": "one",
                    "artifact": {"name": "Language.sqlite3", "sha256": self.language_sha},
                }
            ).encode(),
        }
        self.set_contract()
        self.set_catalog()
        self.set_suite_two()
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
                {
                    "name": "Radicals.json",
                    "path": "res/Radicals.json",
                    "artifact_schema": "zenbu.radical-reference.v1",
                },
                {
                    "name": "Contract.json",
                    "path": "res/Contract.json",
                    "artifact_schema": "zenbu.dictionary-ranking-contract.v1",
                },
                {"name": "Catalog.json", "path": "res/Catalog.json"},
                {"name": "Mapping.sql", "path": "res/Mapping.sql"},
                {"name": "Notices/NOTICE.txt", "path": "res/NOTICE.txt"},
            ],
            "frequency_pack_catalog": "res/Catalog.json",
            "source_archives": {"zenbu.wiki": "src/Wiki.tsv.xz"},
            "conformance": ["conf/one.json", "conf/two.json"],
        }
        self.release = {"release": "2026.10.1"}
        self.root.mkdir(parents=True)
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Test")
        self.git("config", "commit.gpgsign", "false")
        self.commit()

    def set_contract(self) -> None:
        self.plain["data/res/Contract.json"] = json.dumps(self.contract).encode()

    def set_catalog(self) -> None:
        self.plain["data/res/Catalog.json"] = json.dumps(self.catalog).encode()

    def set_suite_two(self, extra: list[dict] | None = None) -> None:
        self.plain["data/conf/two.json"] = json.dumps(
            {
                "suite": "two",
                "artifacts": [
                    {"name": "Language.sqlite3", "sha256": self.language_sha},
                    {"name": "Pack.sqlite3", "sha256": self.pack_sha},
                    {"name": "Catalog.json", "sha256": sha256(self.plain["data/res/Catalog.json"])},
                    {"name": "Unread.json", "sha256": "1" * 64},
                    *(extra or []),
                ],
            }
        ).encode()

    def drop(self, name: str) -> None:
        self.inputs["files"] = [f for f in self.inputs["files"] if f["name"] != name]

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

    def inputs_path(self) -> Path:
        path = self.root.parent / "inputs.json"
        path.write_text(json.dumps(self.inputs))
        return path

    def build(self, out: Path) -> dict:
        inputs = package.load_inputs(self.inputs_path())
        return package.build(self.root, inputs, self.release, out, log=QUIET)


class PackagerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.scratch = Scratch(Path(self.tmp.name) / "repo")
        self.out = Path(self.tmp.name) / "out"

    def refused(self, pattern: str) -> None:
        with self.assertRaisesRegex(package.Refusal, pattern):
            self.scratch.build(self.out)
        # A refused build leaves no output behind.
        self.assertFalse(self.out.exists())

    def test_builds_the_manifest_and_the_staging_directory(self):
        manifest = self.scratch.build(self.out)
        files = {f["name"]: f for f in manifest["files"]}

        language = files["Language.sqlite3"]
        self.assertEqual(language["sha256"], self.scratch.language_sha)
        self.assertEqual(
            (language["artifact_schema"], language["schema_source"]),
            ("zenbu.language-reference.v2", "plan"),
        )
        # Ordinary tables, and each virtual table's documents, but no other shadow table.
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
                "metadata": len(package.TOOL_KEYS) + 5,
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

    def test_keeps_an_existing_empty_output_directory_after_a_refusal(self):
        self.out.mkdir()
        self.scratch.write("data/res/NOTICE.txt", b"edited\n")
        with self.assertRaises(package.Refusal):
            self.scratch.build(self.out)
        self.assertEqual(list(self.out.iterdir()), [])

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
        # The catalog is read for sources even when it isn't in the release: its pin still counts.
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
        # Mapping.sql is in the release, but it isn't the language reference database.
        pack = pack_database(self.scratch.mapping_sha, self.scratch.mapping_sha)
        self.scratch.lfs["data/res/Pack.sqlite3"] = pack
        self.scratch.pack_sha = sha256(pack)
        self.scratch.catalog["packs"][0]["bundledArtifactSHA256"] = sha256(pack)
        self.scratch.set_catalog()
        self.scratch.set_suite_two()
        self.scratch.commit()
        self.refused(r"Pack\.sqlite3: language_data_sha256 pins [0-9a-f]{64}, not Language")

    def test_refuses_a_catalog_language_data_pin_on_another_file(self):
        self.scratch.catalog["packs"][1]["languageDataSHA256"] = self.scratch.pack_sha
        self.scratch.set_catalog()
        self.scratch.set_suite_two()
        self.scratch.commit()
        self.refused(r"zenbu\.wiki: languageDataSHA256 pins [0-9a-f]{64}, not Language")

    def test_refuses_a_planned_schema_for_a_file_that_declares_one(self):
        self.scratch.inputs["files"][1]["artifact_schema"] = "zenbu.frequency-pack.v2"
        self.refused(r"Pack\.sqlite3 declares zenbu\.frequency-pack\.v1")

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
        # Metadata and contract agree, but the tables hold other counts.
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
        pack = pack_database(sha256(changed), self.scratch.mapping_sha)
        self.scratch.lfs["data/res/Pack.sqlite3"] = pack
        self.scratch.pack_sha = sha256(pack)
        self.scratch.catalog["packs"][0]["bundledArtifactSHA256"] = sha256(pack)
        self.scratch.set_catalog()
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

    def test_refuses_a_non_empty_output_directory(self):
        self.out.mkdir()
        (self.out / "stale").write_text("x")
        with self.assertRaisesRegex(package.Refusal, r"isn't empty"):
            self.scratch.build(self.out)
        self.assertTrue((self.out / "stale").exists())

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


class InputValidationTests(unittest.TestCase):
    """release-inputs.json is checked when it loads, before anything is staged."""

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
        return package.load_inputs(self.path)

    def test_accepts_plain_names_and_paths(self):
        self.inputs["files"].append({"name": "Kuromoji/base.dat.gz", "path": "res/K/base.dat.gz"})
        self.assertEqual(self.load().files[1]["path"], "data/res/K/base.dat.gz")

    def test_refuses_bad_names(self):
        for name in ("../A.json", "a/../b", "./A.json", "/A.json", "a/b/c.json", ".hidden", "", 3):
            with self.subTest(name):
                self.inputs["files"] = [{"name": name, "path": "res/A.json"}]
                with self.assertRaisesRegex(package.Refusal, r"isn't a release name"):
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
                with self.assertRaisesRegex(package.Refusal, r"must be a plain path"):
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
                with self.assertRaisesRegex(package.Refusal, r"must be a plain path"):
                    self.load()

    def test_refuses_an_unknown_root_and_a_bad_source_name(self):
        self.inputs["files"] = [{"name": "A.json", "path": "other/A.json"}]
        with self.assertRaisesRegex(package.Refusal, r"doesn't start with one of the roots"):
            self.load()
        self.inputs["files"] = [{"name": "A.json", "path": "res/A.json"}]
        self.inputs["source_archives"] = {"../pack": "res/x.xz"}
        with self.assertRaisesRegex(package.Refusal, r"isn't a release name"):
            self.load()

    def test_refuses_a_malformed_release_id(self):
        path = self.path.with_name("release.json")
        for release in ("2026.13.1", "2026.10.0", "latest"):
            with self.subTest(release):
                path.write_text(json.dumps({"release": release}))
                with self.assertRaisesRegex(package.Refusal, r"isn't YYYY\.MM\.N"):
                    package.load_release(path)


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
        self.assertEqual(SCHEMA["$defs"]["name"]["pattern"], package.NAME.pattern)
        self.assertEqual(SCHEMA["properties"]["release"]["pattern"], package.RELEASE.pattern)

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
        paths = package.lfs_paths(REPO, self.inputs)
        self.assertEqual(len(paths), 18)
        self.assertTrue(
            all(re.search(r"(\.sqlite3|/Kuromoji/[a-z_]+\.dat\.gz)$", p) for p in paths)
        )

    def test_release_json_names_only_the_release(self):
        release = json.loads((REPO / "language-data" / "release.json").read_text())
        self.assertEqual(list(release), ["release"])
        self.assertEqual(package.load_release(REPO / "language-data" / "release.json"), release)

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
