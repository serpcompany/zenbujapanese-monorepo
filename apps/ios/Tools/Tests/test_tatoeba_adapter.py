from __future__ import annotations

import bz2
import csv
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

from tatoeba_adapter import TatoebaSnapshotInputs, import_tatoeba_examples  # noqa: E402
from verify_tatoeba_provenance import VerificationInputs, verify_database  # noqa: E402


SCHEMA = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE example_sentences (
  id TEXT PRIMARY KEY,
  source_identity TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  japanese_source_record_id INTEGER NOT NULL,
  english_source_record_id INTEGER NOT NULL,
  japanese_contributor TEXT,
  english_contributor TEXT,
  japanese_contributor_status TEXT NOT NULL,
  english_contributor_status TEXT NOT NULL,
  japanese_license TEXT NOT NULL,
  english_license TEXT NOT NULL,
  pair_license TEXT NOT NULL,
  source_snapshot_date TEXT NOT NULL,
  source_snapshot_sha256 TEXT NOT NULL,
  japanese TEXT NOT NULL,
  english TEXT NOT NULL
);
CREATE TABLE example_sentence_contributors (
  username TEXT PRIMARY KEY,
  sentence_side_count INTEGER NOT NULL
);
"""

SAMPLE_FIELDS = [
    "sample_id", "query", "entry_class", "observed_rank", "capture_timestamp",
    "internal_evidence_pointer", "evidence_sha256", "japanese", "english",
    "japanese_id", "english_id", "general_japanese", "general_english", "direct_link",
    "japanese_cc0", "english_cc0", "japanese_indices", "japanese_contributor",
    "japanese_contributor_status", "english_contributor", "english_contributor_status",
    "pair_license", "zenbu_exact_pair",
]


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ordered_sha256(values: list[str]) -> str:
    return hashlib.sha256("".join(f"{value}\n" for value in values).encode()).hexdigest()


class TatoebaAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def compressed(self, name: str, contents: str) -> Path:
        path = self.root / name
        with bz2.open(path, "wt", encoding="utf-8") as output:
            output.write(contents)
        return path

    def sources(self, *, japanese_detail_override: str | None = None) -> dict[str, Path]:
        japanese_details = japanese_detail_override or (
            "1\tjpn\t病は気から。\tjapanese_user\t2020-01-01\t2020-01-02\n"
            "2\tjpn\t野菜を食べたら？\t\\N\t2020-01-01\t2020-01-02\n"
            "3\tjpn\t散れ！\tother_user\t2020-01-01\t2020-01-02\n"
        )
        return {
            "japanese": self.compressed(
                "jpn.tsv.bz2", "1\tjpn\t病は気から。\n2\tjpn\t野菜を食べたら？\n3\tjpn\t散れ！\n"
            ),
            "english": self.compressed(
                "eng.tsv.bz2",
                "19\teng\tCare killed a cat.\n20\teng\tWhy don't you eat some vegetables?\n"
                "21\teng\tScatter!\n22\teng\tA higher-ID translation.\n",
            ),
            "links": self.compressed("links.tsv.bz2", "1\t22\n1\t19\n2\t20\n3\t21\n"),
            "japanese_detailed": self.compressed("jpn-detailed.tsv.bz2", japanese_details),
            "english_detailed": self.compressed(
                "eng-detailed.tsv.bz2",
                "19\teng\tCare killed a cat.\tenglish_user\t2020-01-01\t2020-01-02\n"
                "20\teng\tWhy don't you eat some vegetables?\tenglish_user\t2020-01-01\t2020-01-02\n"
                "21\teng\tScatter!\t\\N\t2020-01-01\t2020-01-02\n"
                "22\teng\tA higher-ID translation.\tunused_user\t2020-01-01\t2020-01-02\n",
            ),
            "japanese_cc0": self.compressed("jpn-cc0.tsv.bz2", "1\tjpn\t病は気から。\t2020-01-02\n"),
            "english_cc0": self.compressed("eng-cc0.tsv.bz2", "19\teng\tCare killed a cat.\t2020-01-02\n"),
        }

    def snapshot(self, sources: dict[str, Path], aggregate: str = "snapshot-hash") -> TatoebaSnapshotInputs:
        return TatoebaSnapshotInputs(
            japanese_sentences=sources["japanese"],
            english_sentences=sources["english"],
            japanese_english_links=sources["links"],
            japanese_detailed_sentences=sources["japanese_detailed"],
            english_detailed_sentences=sources["english_detailed"],
            japanese_cc0_sentences=sources["japanese_cc0"],
            english_cc0_sentences=sources["english_cc0"],
            snapshot_date="2026-08-08",
            aggregate_sha256=aggregate,
        )

    def import_sources(
        self,
        database: sqlite3.Connection,
        sources: dict[str, Path],
        aggregate: str = "snapshot-hash",
    ) -> dict[str, int]:
        database.executescript(SCHEMA)
        return import_tatoeba_examples(database, self.snapshot(sources, aggregate))

    def verification_fixture(self) -> VerificationInputs:
        roles = [
            "japanese_sentences", "english_sentences", "japanese_english_links",
            "japanese_detailed_sentences", "english_detailed_sentences",
            "japanese_cc0_sentences", "english_cc0_sentences",
        ]
        source_directory = self.root / "sources"
        source_directory.mkdir()
        filenames = {
            "japanese_sentences": "jpn_sentences-2026-08-08.tsv.bz2",
            "english_sentences": "eng_sentences-2026-08-08.tsv.bz2",
            "japanese_english_links": "jpn-eng_links-2026-08-08.tsv.bz2",
            "japanese_detailed_sentences": "jpn_sentences_detailed-2026-08-08.tsv.bz2",
            "english_detailed_sentences": "eng_sentences_detailed-2026-08-08.tsv.bz2",
            "japanese_cc0_sentences": "jpn_sentences_CC0-2026-08-08.tsv.bz2",
            "english_cc0_sentences": "eng_sentences_CC0-2026-08-08.tsv.bz2",
        }
        for role in roles:
            (source_directory / filenames[role]).write_text(role)
        source_hashes = [file_sha256(source_directory / filenames[role]) for role in roles]
        sources = [{"role": role, "sha256": source_hash} for role, source_hash in zip(roles, source_hashes)]
        aggregate = ordered_sha256(source_hashes)

        database_path = self.root / "LanguageReferenceData.sqlite3"
        database = sqlite3.connect(database_path)
        self.import_sources(database, self.sources(), aggregate)

        importer = self.root / "importer.py"
        adapter = self.root / "adapter.py"
        importer.write_text("# importer fixture\n")
        adapter.write_text("# adapter fixture\n")
        importer_hash = file_sha256(importer)
        adapter_hash = file_sha256(adapter)
        transform_hash = ordered_sha256([importer_hash, adapter_hash])
        metadata = {
            "example_source_sha256": aggregate,
            "example_source_inputs": sources,
            "import_tool_sha256": importer_hash,
            "tatoeba_adapter_sha256": adapter_hash,
            "example_transform_sha256": transform_hash,
        }
        database.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            [(key, json.dumps(value)) for key, value in metadata.items()],
        )
        database.commit()

        sample = self.root / "sample.tsv"
        records = database.execute(
            """
            SELECT japanese_source_record_id, english_source_record_id, japanese, english,
                   japanese_contributor, japanese_contributor_status,
                   english_contributor, english_contributor_status,
                   japanese_license, english_license, pair_license
            FROM example_sentences ORDER BY japanese_source_record_id
            """
        ).fetchall()
        database.close()
        with sample.open("w", newline="", encoding="utf-8") as output:
            writer = csv.DictWriter(output, fieldnames=SAMPLE_FIELDS, delimiter="\t")
            writer.writeheader()
            for rank, record in enumerate(records, start=1):
                writer.writerow({
                    "sample_id": f"test-{rank}", "query": "test", "entry_class": "fixture",
                    "observed_rank": rank, "capture_timestamp": "2026-08-14T00:00:00+09:00",
                    "internal_evidence_pointer": "private://issue-140/fixture.png",
                    "evidence_sha256": "a" * 64, "japanese": record[2], "english": record[3],
                    "japanese_id": record[0], "english_id": record[1],
                    "general_japanese": "true", "general_english": "true", "direct_link": "true",
                    "japanese_cc0": str(record[8] == "CC0 1.0").lower(),
                    "english_cc0": str(record[9] == "CC0 1.0").lower(),
                    "japanese_indices": "false", "japanese_contributor": record[4] or "",
                    "japanese_contributor_status": record[5], "english_contributor": record[6] or "",
                    "english_contributor_status": record[7], "pair_license": record[10],
                    "zenbu_exact_pair": "true",
                })

        source_manifest = self.root / "Tatoeba.source.json"
        source_manifest.write_text(json.dumps({
            "snapshot_date": "2026-08-08", "aggregate_sha256": aggregate, "sources": sources,
            "reference_sample": {
                "sha256": file_sha256(sample), "pair_count": 3, "query_counts": {"test": 3},
                "classification_inputs": {
                    "japanese_indices_archive_sha256": "b" * 64,
                    "japanese_indices_extracted_sha256": "c" * 64,
                },
            },
        }))
        import_manifest = self.root / "import.json"
        import_manifest.write_text(json.dumps({"transform": {
            "example_source_inputs": sources, "example_source_sha256": aggregate,
            "import_tool_sha256": importer_hash, "tatoeba_adapter_sha256": adapter_hash,
            "example_transform_sha256": transform_hash,
            "database_sha256": file_sha256(database_path), "database_bytes": database_path.stat().st_size,
        }}))
        return VerificationInputs(
            database_path, source_manifest, import_manifest, importer, adapter, sample, source_directory
        )

    def test_import_retains_both_ids_contributors_and_license(self) -> None:
        database = sqlite3.connect(":memory:")
        stats = self.import_sources(database, self.sources())
        self.assertEqual(stats, {
            "retained_pairs": 3, "cc0_pairs": 1, "attributed_pairs": 2,
            "named_contributors": 3, "unassigned_sentence_sides": 2,
        })
        self.assertEqual(database.execute(
            """
            SELECT japanese_source_record_id, english_source_record_id,
                   japanese_contributor, english_contributor,
                   japanese_license, english_license, pair_license
            FROM example_sentences WHERE japanese_source_record_id = 1
            """
        ).fetchone(), (1, 19, "japanese_user", "english_user", "CC0 1.0", "CC0 1.0", "CC0 1.0"))

    def test_import_rejects_general_and_detailed_text_mismatch(self) -> None:
        database = sqlite3.connect(":memory:")
        sources = self.sources(japanese_detail_override=(
            "1\tjpn\t違う。\tjapanese_user\t2020-01-01\t2020-01-02\n"
            "2\tjpn\t野菜を食べたら？\t\\N\t2020-01-01\t2020-01-02\n"
            "3\tjpn\t散れ！\tother_user\t2020-01-01\t2020-01-02\n"
        ))
        with self.assertRaisesRegex(ValueError, "Japanese detailed/general text mismatch"):
            self.import_sources(database, sources)

    def test_release_blocks_unresolved_while_inspection_reports_it(self) -> None:
        inputs = self.verification_fixture()
        report = verify_database(inputs, allow_unresolved=True)
        self.assertEqual(report["mode"], "inspection")
        self.assertEqual(report["not_supplied_sides"], 2)
        with self.assertRaisesRegex(ValueError, "release blocked: 2 unresolved contributor sides"):
            verify_database(inputs)

    def test_validator_rejects_generated_database_hash_tamper(self) -> None:
        inputs = self.verification_fixture()
        database = sqlite3.connect(inputs.database)
        database.execute("UPDATE example_sentences SET english = 'tampered' WHERE japanese_source_record_id = 1")
        database.commit()
        database.close()
        with self.assertRaisesRegex(ValueError, "database SHA-256"):
            verify_database(inputs, allow_unresolved=True)

    def test_validator_rejects_transform_code_hash_tamper(self) -> None:
        inputs = self.verification_fixture()
        inputs.adapter.write_text("# changed adapter fixture\n")
        with self.assertRaisesRegex(ValueError, "tatoeba_adapter_sha256"):
            verify_database(inputs, allow_unresolved=True)

    def test_validator_rejects_pinned_input_hash_tamper(self) -> None:
        inputs = self.verification_fixture()
        manifest = json.loads(inputs.source_manifest.read_text())
        manifest["sources"][0]["sha256"] = "0" * 64
        inputs.source_manifest.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "pinned Tatoeba input file hash"):
            verify_database(inputs, allow_unresolved=True)


if __name__ == "__main__":
    unittest.main()
