from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

from contract_checks import ROOT
from test_jmdict_examples import KAGAKUSHIKI, KARE, SAE_MO, TANMARI, Excerpts, entry_id

sys.path.insert(0, str(ROOT / "language-data/tools"))
from jmdict_relationships import assign_note_identities
from refresh_jmdict_summary import Refreshed, opened, pull_request

MERGED = 1_000_000
ADDED = 2_900_000
COPY_OF_AN_ENTRY = (
    "INSERT INTO entries SELECT ?, source_identity, ?, ?, ?, reading, summary, meanings_json, parts_of_speech_json, "
    "written_forms_json, reading_forms_json, senses_json, cross_references_json, relationships_json, "
    "pitch_accent_json, gloss_search, is_common, rank_score, semantic_fingerprint FROM entries "
    "WHERE source_record_id = ?"
)
DROPPED = [
    {"ent_seq": MERGED, "headword": "彼", "reading": "かれ", "replacement": KARE},
    {"ent_seq": TANMARI, "headword": "たんまり", "reading": "たんまり", "replacement": None},
]


def sense_examples(linked: int, source: int, senses: int, entries: int) -> str:
    return json.dumps(
        {"linked_examples": linked, "source_examples": source, "senses": senses, "entries": entries}
    )


class Update:
    def __init__(self, test: unittest.TestCase) -> None:
        excerpts = Excerpts(test)
        folder = Path(excerpts.directory.name)
        database, records = excerpts.imported(excerpts.with_examples)
        assign_note_identities(database, records, {})
        database.execute(COPY_OF_AN_ENTRY, (entry_id(MERGED), MERGED, "wn1:merged", "彼", KARE))
        database.execute("INSERT INTO metadata VALUES ('sense_examples', ?)", (sense_examples(4, 7, 3, 2),))
        database.commit()
        self.previous = folder / "Previous.sqlite3"
        database.execute("VACUUM INTO ?", (str(self.previous),))
        database.execute("DELETE FROM entries WHERE source_record_id IN (?, ?)", (MERGED, TANMARI))
        database.execute(COPY_OF_AN_ENTRY, (entry_id(ADDED), ADDED, "wn1:added", "新語", KAGAKUSHIKI))
        database.execute(
            "UPDATE entries SET meanings_json = json_insert(meanings_json, '$[#]', 'that man'), "
            "senses_json = json_insert(senses_json, '$[#]', json_extract(senses_json, '$[0]')) "
            "WHERE source_record_id = ?",
            (KARE,),
        )
        database.execute("UPDATE entries SET headword = 'さえ' WHERE source_record_id = ?", (SAE_MO,))
        database.execute("UPDATE entries SET is_common = 1 WHERE source_record_id = ?", (KAGAKUSHIKI,))
        database.execute("UPDATE metadata SET value = ? WHERE key = 'sense_examples'", (sense_examples(5, 8, 4, 3),))
        database.commit()
        self.current = folder / "Current.sqlite3"
        database.execute("VACUUM INTO ?", (str(self.current),))

    def pull_request(self, stale: dict[str, list[str]]) -> tuple[str, list[str]]:
        refreshed = Refreshed("2026-10-23", "2026-11-01", 63_187_444, "2026.11.1", DROPPED, stale)
        connection = opened(self.previous, self.current)
        try:
            title, body = pull_request(connection, refreshed)
        finally:
            connection.close()
        return title, body.splitlines()


class PullRequestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.title, self.lines = Update(self).pull_request(
            {"word-detail": ["LanguageReferenceData.sqlite3", "CompoundPitch.sqlite3"], "tokenizer": ["Kuromoji/base.dat.gz"]}
        )

    def test_the_title_names_the_export_and_the_release(self) -> None:
        self.assertEqual(
            "feat(language-data): the dictionary moves to JMdict's 2026-11-01 export, in release 2026.11.1", self.title
        )
        self.assertTrue(self.lines[0].startswith("No issue: EDRDG's licence asks sites that serve JMdict"))

    def test_counts_what_was_added_changed_and_removed_with_examples_of_each(self) -> None:
        start = self.lines.index("| Change | Entries |")
        self.assertEqual(
            [
                "| Added | 1 (新語) |",
                "| Removed | 2 (彼, たんまり) |",
                "| Changed in any stored field | 3 (彼, 化学式, さえ) |",
                "| …meanings changed | 1 (彼) |",
                "| …number of meanings changed | 1 (彼 2 → 3) |",
                "| …headword or reading changed | 1 (さえも → さえ) |",
                "| …newly common | 1 (化学式) |",
            ],
            self.lines[start + 2 : start + 9],
        )
        self.assertEqual("", self.lines[start + 9])

    def test_says_where_each_removed_entrys_url_goes(self) -> None:
        self.assertIn(
            f"| [{MERGED}](https://zenbujapanese.com/dictionary/{MERGED}/) | 彼 (かれ) | 308 to "
            f"https://zenbujapanese.com/dictionary/{KARE}/ (彼, written and read the same) |",
            self.lines,
        )
        self.assertIn(
            f"| [{TANMARI}](https://zenbujapanese.com/dictionary/{TANMARI}/) | たんまり (たんまり) | 410 Gone |",
            self.lines,
        )
        self.assertIn("Notes a learner saved under a removed entry move to Notes Without a Word.", self.lines)

    def test_counts_each_meanings_checked_examples_before_and_after(self) -> None:
        self.assertIn(
            "Each meaning's checked examples: 5 of the export's 8 checked examples link to 4 meanings of 3 "
            "entries, against 4 on 3 meanings of 2 before; 3 aren't linked (the import report counts why).",
            self.lines,
        )

    def test_says_plainly_which_suites_a_person_records_on_a_mac(self) -> None:
        status = self.lines[self.lines.index("## Status") :]
        self.assertTrue(status[2].startswith("Not ready to merge. A person finishes it, on a Mac"))
        self.assertIn(
            "   - `word-detail.json` (`-only-testing:SearchExperienceTests/WordDetailConformanceTests`), "
            "recorded from `LanguageReferenceData.sqlite3`, `CompoundPitch.sqlite3`",
            status,
        )
        self.assertIn(
            "   - `tokenizer.json`, recorded `pnpm --filter zenbujapanese-dictionary-api tokenizer-suite`, "
            "from kuromoji.js",
            status,
        )
        self.assertTrue(any("package.py build" in line and "2026.11.1" in line for line in status))
        self.assertTrue(any("GitHub runs no workflow for a pull request a workflow's token" in line for line in status))
        left_out = self.lines[self.lines.index("## Left out") + 2]
        self.assertIn("only the app records, on a Mac: `word-detail`.", left_out)

    def test_keeps_count_of_the_entries_whose_note_identity_is_kept(self) -> None:
        self.assertTrue(any("each of the 4 entries kept from the previous data" in line for line in self.lines))

    def test_says_so_when_no_suite_needs_a_mac(self) -> None:
        _, lines = Update(self).pull_request({})
        self.assertIn("   - none: no suite the app records was recorded from a file this update changed", lines)
        self.assertFalse(any(line.startswith("   Record these too:") for line in lines))


if __name__ == "__main__":
    unittest.main()
