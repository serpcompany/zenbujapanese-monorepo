from __future__ import annotations

import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ranking_contract
import release_build
import release_inputs
from refusal import Refusal


def quiet(*_: object) -> None:
    pass


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
TOOLS = {key: f"{i}" * 64 for i, key in enumerate(ranking_contract.TOOL_KEYS)}


def language_database() -> bytes:
    metadata = {
        "dictionary_ranking_policy": "dictionary-best-match-v1",
        "dictionary_ranking_schema_version": "zenbu.dictionary-ranking.v1",
        "dictionary_ranking_mapping_sha256": "a" * 64,
        "dictionary_ranking_evidence": {**EVIDENCE, "undecoded_by_the_app": 7},
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
                    "mappingPolicySHA256": "b" * 64,
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
        inputs = release_inputs.load_inputs(self.inputs_path())
        return release_build.build(self.root, inputs, self.release, out, log=quiet)


class ScratchBuildTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.scratch = Scratch(Path(self.tmp.name) / "repo")
        self.out = Path(self.tmp.name) / "out"

    def refused(self, pattern: str) -> None:
        with self.assertRaisesRegex(Refusal, pattern):
            self.scratch.build(self.out)
        self.assertFalse(self.out.exists())
