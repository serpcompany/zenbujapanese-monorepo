from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from contract_checks import ROOT, SOURCES
from test_jmdict_examples import FIXTURE_EVIDENCE, Excerpts

sys.path.insert(0, str(ROOT / "language-data/tools"))
from refresh_jmdict_release import (
    RECORDED_ON_A_MAC,
    RECORDED_WITHOUT_A_MAC,
    keep_note_identities,
    next_release,
    note_identities,
    stale_suites,
    start_release,
)
from refresh_jmdict_sources import APPLIED, ENTRIES_TOOL, apply, record_text

PINNED = "JMdict_e_examp-2026-10-22"
CURRENT = "JMdict_e_examp-2026-10-23"
NOTE_TEST = ROOT / "language-data/tools/tests/test_note_identity_contract.py"


def scratch(test: unittest.TestCase) -> Path:
    directory = tempfile.TemporaryDirectory()
    test.addCleanup(directory.cleanup)
    return Path(directory.name)


def facts(path: Path) -> dict[str, object]:
    return {"compressed_bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


class ApplyTests(unittest.TestCase):
    def setUp(self) -> None:
        excerpts = Excerpts(self)
        self.export = scratch(self)
        self.sources = scratch(self)
        self.tool = scratch(self) / ENTRIES_TOOL.name
        shutil.copyfile(ENTRIES_TOOL, self.tool)
        shutil.copyfile(excerpts.with_examples, self.export / "JMdict_e_examp.gz")
        shutil.copyfile(excerpts.without_examples, self.export / "JMdict_e.gz")
        (pinned_record,) = SOURCES.glob("JMdict_e_examp-*.source.json")
        self.pinned = {**json.loads(pinned_record.read_text(encoding="utf-8")), "export_date": "2026-10-22"}
        (self.sources / f"{PINNED}.source.json").write_text(record_text(self.pinned), encoding="utf-8")
        (self.sources / f"{PINNED}.gz").write_bytes(b"the previous snapshot")
        for name in ("README.md", "EDRDG-ATTRIBUTION.md"):
            (self.sources / name).write_text(f"Snapshot: `{PINNED}.gz` and `{PINNED}.source.json`.\n", encoding="utf-8")
        without = excerpts.without_examples.read_bytes()
        self.candidate = {
            **self.pinned,
            "export_date": "2026-10-23",
            **facts(excerpts.with_examples),
            "without_examples": {
                **self.pinned["without_examples"],
                **facts(excerpts.without_examples),
                "xml_bytes": 1234,
                "xml_sha256": hashlib.sha256(without).hexdigest(),
            },
        }
        self.write_candidate(self.candidate)

    def write_candidate(self, candidate: dict) -> None:
        (self.export / "export.json").write_text(json.dumps(candidate), encoding="utf-8")

    def applied(self) -> dict[str, object]:
        return apply(self.export, self.sources, self.tool)

    def test_the_new_record_and_snapshot_replace_the_pinned_ones(self) -> None:
        self.applied()
        self.assertEqual(
            ["EDRDG-ATTRIBUTION.md", f"{CURRENT}.gz", f"{CURRENT}.source.json", "README.md"],
            sorted(path.name for path in self.sources.iterdir()),
        )
        self.assertEqual(
            (self.export / "JMdict_e_examp.gz").read_bytes(), (self.sources / f"{CURRENT}.gz").read_bytes()
        )
        record = (self.sources / f"{CURRENT}.source.json").read_text(encoding="utf-8")
        self.assertEqual(record_text(self.candidate), record)
        self.assertIn('"included_gloss_languages": ["eng"],', record)

    def test_the_docs_name_the_new_snapshot(self) -> None:
        self.applied()
        for name in ("README.md", "EDRDG-ATTRIBUTION.md"):
            self.assertEqual(
                f"Snapshot: `{CURRENT}.gz` and `{CURRENT}.source.json`.\n",
                (self.sources / name).read_text(encoding="utf-8"),
            )

    def test_the_importer_expects_the_new_exports_evidence_counts(self) -> None:
        applied = self.applied()
        self.assertEqual(FIXTURE_EVIDENCE, applied["evidence_counts"])
        tool = self.tool.read_text(encoding="utf-8")
        self.assertIn('    "canonical_senses": 6,\n    "gloss_atoms": 7,\n', tool)
        self.assertEqual(ENTRIES_TOOL.read_text(encoding="utf-8").count("\n"), tool.count("\n"))
        self.assertEqual(
            {"previous_export_date": "2026-10-22", "export_date": "2026-10-23", "xml_bytes": 1234},
            {key: value for key, value in applied.items() if key != "evidence_counts"},
        )
        self.assertEqual(applied, json.loads((self.export / APPLIED).read_text(encoding="utf-8")))

    def test_refuses_a_download_that_is_not_the_one_fetched(self) -> None:
        self.write_candidate({**self.candidate, "sha256": "0" * 64})
        with self.assertRaises(SystemExit) as refused:
            self.applied()
        self.assertIn("fetch it again", str(refused.exception))
        self.assertTrue((self.sources / f"{PINNED}.source.json").exists())

    def test_refuses_an_export_that_is_already_pinned(self) -> None:
        self.write_candidate({**self.candidate, "export_date": "2026-10-22"})
        with self.assertRaises(SystemExit) as refused:
            self.applied()
        self.assertIn("already the pinned export", str(refused.exception))

    def test_refuses_docs_that_name_another_snapshot(self) -> None:
        (self.sources / "README.md").write_text("Snapshot: `JMdict_e-2026-08-10.gz`.\n", encoding="utf-8")
        with self.assertRaises(SystemExit) as refused:
            self.applied()
        self.assertIn(f"README.md doesn't name {PINNED}", str(refused.exception))


def entries_database(path: Path, identities: dict[bytes, str]) -> Path:
    database = sqlite3.connect(path)
    database.execute("CREATE TABLE entries (id BLOB PRIMARY KEY, note_identity TEXT NOT NULL)")
    database.executemany("INSERT INTO entries VALUES (?, ?)", identities.items())
    database.commit()
    database.close()
    return path


class NoteIdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = scratch(self)
        self.test_file = self.folder / NOTE_TEST.name
        shutil.copyfile(NOTE_TEST, self.test_file)
        self.previous = entries_database(self.folder / "previous.sqlite3", {b"\x01": "wn1:a", b"\x02": "wn1:b"})

    def test_pins_the_test_again_when_every_kept_entry_keeps_its_note_identity(self) -> None:
        current = entries_database(self.folder / "current.sqlite3", {b"\x01": "wn1:a", b"\x03": "wn1:c"})
        entries, digest = keep_note_identities(self.previous, current, self.test_file)
        self.assertEqual((2, hashlib.sha256(b"01 wn1:a\n03 wn1:c\n").hexdigest()), (entries, digest))
        self.assertEqual((entries, digest), note_identities(current))
        pinned = self.test_file.read_text(encoding="utf-8")
        self.assertIn("RELEASED_ENTRIES = 2\n", pinned)
        self.assertIn(f'RELEASED_NOTE_IDENTITIES = (\n    "{digest}"\n)\n', pinned)

    def test_refuses_when_a_kept_entry_has_another_note_identity(self) -> None:
        current = entries_database(self.folder / "current.sqlite3", {b"\x01": "wn1:other", b"\x02": "wn1:b"})
        with self.assertRaises(SystemExit) as refused:
            keep_note_identities(self.previous, current, self.test_file)
        self.assertIn("held have another note_identity now (1)", str(refused.exception))
        self.assertEqual(NOTE_TEST.read_text(encoding="utf-8"), self.test_file.read_text(encoding="utf-8"))


class ReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.releases = scratch(self)
        for release in ("2026.09.1", "2026.10.1", "2026.10.6"):
            (self.releases / release).mkdir()
            (self.releases / release / "manifest.json").write_text("{}\n", encoding="utf-8")

    def test_the_next_release_counts_on_from_this_months_last(self) -> None:
        self.assertEqual("2026.10.7", next_release(self.releases, date(2026, 10, 24)))

    def test_a_new_month_starts_from_one(self) -> None:
        self.assertEqual("2026.11.1", next_release(self.releases, date(2026, 11, 1)))

    def test_refuses_when_a_later_month_is_pinned(self) -> None:
        with self.assertRaises(SystemExit) as refused:
            next_release(self.releases, date(2026, 9, 30))
        self.assertIn("2026.10.6 is pinned for a month after 2026-09", str(refused.exception))

    def test_release_json_names_it(self) -> None:
        release_file = scratch(self) / "release.json"
        self.assertEqual("2026.11.1", start_release(date(2026, 11, 1), self.releases, release_file))
        self.assertEqual('{\n  "release": "2026.11.1"\n}\n', release_file.read_text(encoding="utf-8"))


class StaleSuiteTests(unittest.TestCase):
    def test_names_each_suite_recorded_from_a_file_that_changed(self) -> None:
        resources, conformance = scratch(self), scratch(self)
        (resources / "Kuromoji").mkdir()
        (resources / "Kuromoji/base.dat.gz").write_bytes(b"kuromoji")
        (resources / "LanguageReferenceData.sqlite3").write_bytes(b"rebuilt")
        kept = {"name": "Kuromoji/base.dat.gz", "sha256": hashlib.sha256(b"kuromoji").hexdigest()}
        moved = {"name": "LanguageReferenceData.sqlite3", "sha256": hashlib.sha256(b"before").hexdigest()}
        suites = {
            "word-detail": {"artifacts": [moved, kept]},
            "search-retrieval": {"artifact": moved},
            "tokenizer": {"artifacts": [kept]},
            "romaji": {"artifacts": []},
        }
        for name, suite in suites.items():
            (conformance / f"{name}.json").write_text(json.dumps(suite), encoding="utf-8")
        self.assertEqual(
            {"search-retrieval": ["LanguageReferenceData.sqlite3"], "word-detail": ["LanguageReferenceData.sqlite3"]},
            stale_suites(conformance, resources),
        )

    def test_every_suite_a_release_holds_says_how_it_is_recorded(self) -> None:
        inputs = json.loads((ROOT / "language-data/release-inputs.json").read_text(encoding="utf-8"))
        suites = {Path(path).stem for path in inputs["conformance"]}
        self.assertTrue(suites)
        self.assertLessEqual(suites, {*RECORDED_ON_A_MAC, *RECORDED_WITHOUT_A_MAC})


if __name__ == "__main__":
    unittest.main()
