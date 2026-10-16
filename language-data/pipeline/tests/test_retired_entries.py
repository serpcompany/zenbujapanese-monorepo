from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import retired_entries
import retirement
from pinned_release import write_pinned
from refusal import Refusal
from scratch_release import ScratchBuildTestCase, language_database, sha256

TABERU, NAMA = ("食べる", "たべる"), ("生", "なま")
KURIKAESHI, IRU = ("ヽ", "くりかえし"), ("要る", "いる")


def step(release: str, dropped: dict[int, int | None], added: list[int]) -> tuple[str, dict]:
    return release, {
        "dropped": [{"ent_seq": ent_seq, "replacement": to} for ent_seq, to in dropped.items()],
        "added": added,
    }


class DeriveTests(unittest.TestCase):
    def test_a_dropped_entry_is_retired_in_its_release_with_its_replacement_or_none(self):
        self.assertEqual(
            retired_entries.derive([step("2026.11.1", {1000220: 1000230, 2830705: None}, [1])]),
            [
                {"ent_seq": 1000220, "retired_in": "2026.11.1", "replacement": 1000230},
                {"ent_seq": 2830705, "retired_in": "2026.11.1", "replacement": None},
            ],
        )

    def test_a_replacement_dropped_later_passes_its_own_replacement_on(self):
        steps = [
            step("2026.11.1", {1: 2, 5: 6}, []),
            step("2026.12.1", {2: 3, 6: None}, []),
        ]
        self.assertEqual(
            [(e["ent_seq"], e["replacement"]) for e in retired_entries.derive(steps)],
            [(1, 3), (2, 3), (5, None), (6, None)],
        )

    def test_an_entry_that_comes_back_is_no_longer_retired(self):
        steps = [step("2026.11.1", {1: None, 2: None}, []), step("2026.12.1", {}, [2])]
        self.assertEqual([e["ent_seq"] for e in retired_entries.derive(steps)], [1])

    def test_a_replacement_needs_the_one_entry_with_the_same_headword_and_reading(self):
        after = {1000230: TABERU, 1000240: NAMA, 1000250: NAMA}
        changes = retired_entries.entry_changes(
            "2026.11.1", "2026.10.1", {1000220: TABERU, 2830705: NAMA, 1000000: ("ヽ", "")}, after
        )
        self.assertEqual(
            [(e["ent_seq"], e["replacement"]) for e in changes["dropped"]],
            [(1000000, None), (1000220, 1000230), (2830705, None)],
        )
        self.assertEqual(changes["added"], [1000230, 1000240, 1000250])


class TwoReleasesTests(ScratchBuildTestCase):
    def setUp(self):
        super().setUp()
        self.first = self.scratch.lfs["data/res/Language.sqlite3"]
        write_pinned(self.scratch.releases, self.scratch.build(self.out))
        self.scratch.commit()
        self.out = self.out.with_name("second")

    def next_release(self, release: str, entries: dict[int, tuple[str, str]]) -> None:
        self.scratch.release = {"release": release}
        self.scratch.plain["language-data/release.json"] = json.dumps(self.scratch.release).encode()
        self.scratch.set_language(language_database(entries))
        self.scratch.commit()

    def retire(self, previous: bytes | None = None) -> dict:
        database = None
        if previous is not None:
            database = self.out.parent / "previous.sqlite3"
            database.write_bytes(previous)
        result = retirement.retire(
            self.scratch.root,
            self.scratch.loaded_inputs(),
            self.scratch.releases,
            self.scratch.release["release"],
            database,
        )
        self.scratch.keep(self.scratch.RETIRED)
        self.scratch.commit()
        return result

    def retired(self) -> dict:
        return json.loads((self.scratch.root / self.scratch.RETIRED).read_text())

    def changes_path(self, release: str) -> Path:
        return retired_entries.changes_path(self.scratch.releases, release)

    def second_release(self) -> None:
        self.next_release("2026.11.1", {1000000: KURIKAESHI, 1000230: TABERU, 2830800: IRU})

    def test_release_one_retires_nothing(self):
        self.assertEqual(self.retired()["entries"], [])
        self.assertFalse(self.changes_path("2026.10.1").exists())

    def test_the_second_release_retires_what_it_dropped_and_redirects_a_merged_entry(self):
        self.second_release()
        result = self.retire(self.first)
        self.assertEqual(
            result,
            {"previous": "2026.10.1", "dropped": 2, "replaced": 1, "added": 2, "retired": 2},
        )
        changes = json.loads(self.changes_path("2026.11.1").read_text())
        self.assertEqual(changes["previous_release"], "2026.10.1")
        self.assertEqual(
            changes["dropped"],
            [
                {"ent_seq": 1000220, "headword": "食べる", "reading": "たべる", "replacement": 1000230},
                {"ent_seq": 2830705, "headword": "生", "reading": "なま", "replacement": None},
            ],
        )
        self.assertEqual(changes["added"], [1000230, 2830800])
        manifest = self.scratch.build(self.out)
        self.assertEqual(
            self.retired(),
            {
                "schema": "zenbu.retired-entries.v1",
                "language_data_sha256": self.scratch.language_sha,
                "entries": [
                    {"ent_seq": 1000220, "retired_in": "2026.11.1", "replacement": 1000230},
                    {"ent_seq": 2830705, "retired_in": "2026.11.1", "replacement": None},
                ],
            },
        )
        retired = next(f for f in manifest["files"] if f["name"] == "RetiredEntries.json")
        self.assertEqual(retired["artifact_schema"], "zenbu.retired-entries.v1")
        self.assertEqual(retired["depends_on"], ["Language.sqlite3"])

    def test_a_third_release_carries_the_retired_entries_forward(self):
        self.second_release()
        self.retire(self.first)
        second = self.scratch.lfs["data/res/Language.sqlite3"]
        write_pinned(self.scratch.releases, self.scratch.build(self.out))
        self.scratch.commit()
        self.next_release("2026.12.1", {1000000: KURIKAESHI, 1000240: TABERU, 2830705: NAMA})
        self.retire(second)
        self.scratch.build(self.out.with_name("third"))
        self.assertEqual(
            self.retired()["entries"],
            [
                {"ent_seq": 1000220, "retired_in": "2026.11.1", "replacement": 1000240},
                {"ent_seq": 1000230, "retired_in": "2026.12.1", "replacement": 1000240},
                {"ent_seq": 2830800, "retired_in": "2026.12.1", "replacement": None},
            ],
        )

    def test_retire_reads_the_previous_database_from_the_git_lfs_store(self):
        store = retirement.lfs_object(self.scratch.root, sha256(self.first))
        store.parent.mkdir(parents=True)
        store.write_bytes(self.first)
        self.second_release()
        self.assertEqual(self.retire()["dropped"], 2)

    def test_retire_refuses_a_previous_database_that_isn_t_the_pinned_one(self):
        self.second_release()
        with self.assertRaisesRegex(Refusal, r"previous\.sqlite3 isn't release 2026\.10\.1's"):
            self.retire(self.first + b"\0")
        with self.assertRaisesRegex(Refusal, r"isn't in this checkout's Git LFS store"):
            self.retire()

    def test_the_build_refuses_a_release_without_its_entry_changes(self):
        self.second_release()
        self.refused(r"release 2026\.11\.1 has no .*ent-seq-changes\.json, its entries' changes")

    def test_the_build_refuses_changes_that_miss_a_dropped_entry(self):
        self.second_release()
        self.retire(self.first)
        path = self.changes_path("2026.11.1")
        changes = json.loads(path.read_text())
        changes["dropped"] = changes["dropped"][:1]
        path.write_text(json.dumps(changes))
        self.scratch.plain[self.scratch.RETIRED] = json.dumps(
            retired_entries.retired_document(
                [("2026.11.1", changes)], self.scratch.language_sha
            )
        ).encode()
        self.scratch.commit()
        self.refused(r"doesn't turn 2026\.11\.1's entries into 2026\.10\.1's")

    def test_the_build_refuses_a_replacement_the_rule_doesn_t_give(self):
        self.second_release()
        self.retire(self.first)
        path = self.changes_path("2026.11.1")
        changes = json.loads(path.read_text())
        changes["dropped"][1]["replacement"] = 2830800
        path.write_text(json.dumps(changes))
        self.scratch.commit()
        self.refused(r"replaces \[2830705\] with entries other than the one entry it holds")

    def test_the_build_refuses_a_retired_entries_file_the_changes_don_t_make(self):
        self.second_release()
        self.retire(self.first)
        self.scratch.set_retired()
        self.scratch.commit()
        self.refused(r"the retired-entries file isn't what the releases' entry changes make")


if __name__ == "__main__":
    unittest.main()
