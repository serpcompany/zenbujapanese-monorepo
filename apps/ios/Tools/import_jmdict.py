#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

from language_data_tools import file_sha256
from dictionary_ranking_adapter import dictionary_ranking_mapping_sha256
from dictionary_ranking_contract import write_runtime_contract
from tatoeba_adapter import (
    EXAMPLE_PAIR_ID_SCHEME,
    TatoebaSnapshotInputs,
    import_tatoeba_examples,
)
from example_sentence_retrieval_index import build_indexes
from unidic_adapter import apply_unidic_pitch
from jmdict_entries import import_entries
from jmdict_normalization import normalized_text
from jmdict_relationships import assign_note_identities, link_relationships


IMPORT_TOOL_FILES = (
    "import_jmdict.py",
    "jmdict_entries.py",
    "jmdict_normalization.py",
    "jmdict_relationships.py",
)


def import_tool_files_sha256() -> str:
    digest = hashlib.sha256()
    for name in IMPORT_TOOL_FILES:
        digest.update(f"{name}\n{file_sha256(Path(__file__).with_name(name))}\n".encode())
    return digest.hexdigest()


def create_schema(database: sqlite3.Connection) -> None:
    database.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE entries (
          id BLOB PRIMARY KEY,
          source_identity TEXT NOT NULL,
          source_record_id INTEGER NOT NULL,
          note_identity TEXT NOT NULL,
          headword TEXT NOT NULL,
          reading TEXT NOT NULL,
          summary TEXT NOT NULL,
          meanings_json TEXT NOT NULL,
          parts_of_speech_json TEXT NOT NULL,
          written_forms_json TEXT NOT NULL,
          reading_forms_json TEXT NOT NULL,
          senses_json TEXT NOT NULL,
          cross_references_json TEXT NOT NULL,
          relationships_json TEXT NOT NULL,
          pitch_accent_json TEXT,
          gloss_search TEXT NOT NULL,
          is_common INTEGER NOT NULL,
          rank_score INTEGER NOT NULL,
          semantic_fingerprint BLOB NOT NULL
        );

        CREATE TABLE forms (
          entry_id BLOB NOT NULL,
          form TEXT NOT NULL,
          kind INTEGER NOT NULL,
          FOREIGN KEY(entry_id) REFERENCES entries(id)
        );

        CREATE INDEX forms_form_index ON forms(form, entry_id);
        CREATE UNIQUE INDEX entries_source_provenance_index ON entries(source_identity, source_record_id);
        CREATE INDEX entries_common_index ON entries(is_common DESC, id);
        CREATE INDEX entries_semantic_fingerprint_index ON entries(semantic_fingerprint, id);

        CREATE TABLE form_priority_profiles (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          form TEXT NOT NULL,
          kind INTEGER NOT NULL,
          primary_mask INTEGER NOT NULL,
          secondary_mask INTEGER NOT NULL,
          news_frequency_band INTEGER,
          PRIMARY KEY(entry_id, form, kind)
        ) WITHOUT ROWID;

        CREATE TABLE canonical_senses (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          sense_order INTEGER NOT NULL,
          parts_of_speech_json TEXT NOT NULL,
          PRIMARY KEY(entry_id, sense_order)
        ) WITHOUT ROWID;

        CREATE TABLE sense_form_restrictions (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          sense_order INTEGER NOT NULL,
          kind INTEGER NOT NULL,
          form TEXT NOT NULL,
          PRIMARY KEY(entry_id, sense_order, kind, form)
        ) WITHOUT ROWID;

        CREATE TABLE gloss_atoms (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          sense_order INTEGER NOT NULL,
          gloss_order INTEGER NOT NULL,
          text TEXT NOT NULL,
          normalized_text TEXT NOT NULL,
          PRIMARY KEY(entry_id, sense_order, gloss_order)
        );
        CREATE TABLE reading_form_restrictions (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          reading TEXT NOT NULL,
          written_form TEXT NOT NULL,
          PRIMARY KEY(entry_id, reading, written_form)
        ) WITHOUT ROWID;

        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);

        CREATE TABLE example_sentences (
          id BLOB PRIMARY KEY,
          japanese TEXT NOT NULL,
          english TEXT NOT NULL
        );

        CREATE TABLE example_sentence_provenance (
          pair_id BLOB NOT NULL REFERENCES example_sentences(id),
          source_identity TEXT NOT NULL,
          source_japanese_record_id INTEGER NOT NULL,
          source_english_record_id INTEGER NOT NULL,
          japanese_contributor TEXT,
          english_contributor TEXT,
          japanese_contributor_status TEXT NOT NULL,
          english_contributor_status TEXT NOT NULL,
          japanese_license TEXT NOT NULL,
          english_license TEXT NOT NULL,
          pair_license TEXT NOT NULL,
          source_snapshot_date TEXT NOT NULL,
          source_snapshot_sha256 TEXT NOT NULL,
          PRIMARY KEY(
            pair_id, source_identity, source_japanese_record_id, source_english_record_id
          )
        ) WITHOUT ROWID;

        CREATE TABLE example_sentence_contributors (
          username TEXT PRIMARY KEY,
          sentence_side_count INTEGER NOT NULL
        ) WITHOUT ROWID;
        """
    )


def import_snapshot(
    source: Path,
    output: Path,
    source_metadata: dict[str, object],
    unidic_source: Path,
    unidic_metadata: dict[str, object],
    tatoeba_japanese_source: Path,
    tatoeba_english_source: Path,
    tatoeba_links_source: Path,
    tatoeba_japanese_detailed_source: Path,
    tatoeba_english_detailed_source: Path,
    tatoeba_japanese_cc0_source: Path,
    tatoeba_english_cc0_source: Path,
    tatoeba_metadata: dict[str, object],
    relationship_source: Path,
    relationship_metadata: dict[str, object],
) -> dict[str, object]:
    if output.exists():
        output.unlink()

    database = sqlite3.connect(output)
    create_schema(database)

    try:
        entries = import_entries(database, source)
        note_identity_duplicate_groups, note_identity_disambiguated_entries = assign_note_identities(
            database, entries.records
        )

        pitch_entry_count = apply_unidic_pitch(
            database, entries.records, unidic_source, unidic_metadata, normalized_text
        )
        example_sentence_summary = import_tatoeba_examples(
            database,
            TatoebaSnapshotInputs(
                japanese_sentences=tatoeba_japanese_source,
                english_sentences=tatoeba_english_source,
                japanese_english_links=tatoeba_links_source,
                japanese_detailed_sentences=tatoeba_japanese_detailed_source,
                english_detailed_sentences=tatoeba_english_detailed_source,
                japanese_cc0_sentences=tatoeba_japanese_cc0_source,
                english_cc0_sentences=tatoeba_english_cc0_source,
                snapshot_date=str(tatoeba_metadata["snapshot_date"]),
                aggregate_sha256=str(tatoeba_metadata["aggregate_sha256"]),
            ),
        )
        example_sentence_count = example_sentence_summary["retained_pairs"]
        retrieval_metadata = build_indexes(database)

        relationship_count = link_relationships(
            database, entries.records, entries.form_to_entry_ids, relationship_metadata
        )

        dictionary_ranking_mapping = dictionary_ranking_mapping_sha256(database)
        semantic_equivalence_group_sizes = [
            row[0]
            for row in database.execute(
                "SELECT count(*) FROM entries GROUP BY semantic_fingerprint HAVING count(*) > 1"
            )
        ]
        import_tool_sha256 = import_tool_files_sha256()
        tatoeba_adapter_sha256 = file_sha256(Path(__file__).with_name("tatoeba_adapter.py"))
        example_transform_digest = hashlib.sha256()
        for value in (import_tool_sha256, tatoeba_adapter_sha256):
            example_transform_digest.update(f"{value}\n".encode())
        transform = {
            "transform": "jmdict-to-zenbu-language-reference-data-v2",
            "source_resource_id": source_metadata["resource_id"],
            "source_sha256": source_metadata["sha256"],
            "source_entries_retained": entries.retained,
            "source_entries_rejected": entries.rejected,
            "source_entries_merged": 0,
            "prior_snapshot_database_sha256": None,
            "row_delta": {
                "added": entries.retained,
                "changed": 0,
                "deleted": 0,
                "added_source_record_ids_sha256": entries.retained_source_ids_sha256,
            },
            "normalized_forms": entries.form_count,
            "dictionary_ranking_policy": "dictionary-best-match-v1",
            "dictionary_ranking_schema_version": "zenbu.dictionary-ranking.v1",
            "dictionary_ranking_evidence": entries.evidence_counts,
            "dictionary_ranking_mapping_sha256": dictionary_ranking_mapping,
            "dictionary_search_index": entries.search_index,
            "semantic_equivalence": {
                "normalization": "opaque-app-id-lexicographic-min-v1",
                "duplicate_groups": len(semantic_equivalence_group_sizes),
                "source_rows": sum(semantic_equivalence_group_sizes),
            },
            "normalized_relationships": relationship_count,
            "note_identity_duplicate_groups": note_identity_duplicate_groups,
            "note_identity_disambiguated_entries": note_identity_disambiguated_entries,
            "pitch_entries": pitch_entry_count,
            "example_sentences": example_sentence_count,
            "example_sentence_provenance": example_sentence_summary,
            "example_sentence_pair_id_scheme": EXAMPLE_PAIR_ID_SCHEME,
            "example_sentence_retrieval": retrieval_metadata,
            "rejection_reasons": {"missing_ent_seq_reading_or_english_gloss": entries.rejected},
            "retained_fields": [
                "ent_seq",
                "k_ele/keb",
                "k_ele/ke_pri",
                "r_ele/reb",
                "r_ele/re_pri",
                "sense/pos",
                "sense/stagk",
                "sense/stagr",
                "r_ele/re_restr",
                "k_ele/ke_inf",
                "r_ele/re_inf",
                "sense/misc",
                "sense/s_inf",
                "sense/xref",
                "sense/gloss[@xml:lang='eng']",
            ],
            "documented_transforms": [
                "Unicode NFKC and case-fold searchable forms",
                "deterministic app-owned Hepburn-style romaji reading index",
                "stable first-priority written form and reading display selection",
                "English-only gloss retention",
                "same-sense English gloss grouping with source sense order retained",
                "individual English gloss atoms retained with canonical sense and gloss order",
                "SQLite FTS4 selects normalized gloss and romaji-form candidates before app-owned evidence validation and ranking",
                "sense POS and displayed written/reading applicability retained as typed app-owned evidence",
                "complete form-scoped priority profiles normalized to app-owned masks and optional news-frequency band",
                "provenance-free semantic fingerprint includes all display forms, meanings, senses, applicability, and gloss atom boundaries",
                "semantically equivalent rows normalize to the lexicographically smallest opaque app-owned identity while retaining every sorted unique source provenance; ranking evidence remains unchanged",
                "provider form and usage labels normalized to an app-owned presentation vocabulary",
                "cross-references resolved to app-owned linked entries",
                "JMdict cross-reference form, reading, and target-sense qualifiers preserved; supplied readings require an exact target reading",
                "human-reviewed app-owned word relationships resolved from a versioned editorial fact source",
                "stable 128-bit app-owned Language Reference ID derived from SHA-256 of source identity and source record ID",
                "opaque app-owned Example Sentence pair ID derived only from the NFC normalized Japanese-English semantic pair",
                "Tatoeba Japanese and English record IDs retained only in the Example Sentence provenance table",
                "Tatoeba supplied contributor names, explicit not-supplied status, per-side license class, pair license class, and pinned snapshot identity retained only in provenance",
                "collision-free durable-note identity derived from an app-owned semantic lexical signature with deterministic exact-duplicate disambiguation",
                "every JMdict part-of-speech entity code mapped explicitly to app-owned category identifiers; an unmapped code fails the import",
                "durable-note identity signature retains the retired part-of-speech labels so saved notes keep their identity",
                "app-owned commonness marker derived from priority on the selected display form",
                "deterministic app-owned rank score derived from documented JMdict priority tags",
                "UniDic aType normalized to deterministic downstep and pronunciation-mora-count facts by exact base-form and pronunciation-or-lexical-reading match",
                "one deterministic lowest-ID English translation retained per linked Japanese Tatoeba sentence",
            ],
            "pitch_source_resource_id": unidic_metadata["resource_id"],
            "pitch_source_sha256": unidic_metadata["sha256"],
            "example_source_resource_id": tatoeba_metadata["resource_id"],
            "example_source_sha256": tatoeba_metadata["aggregate_sha256"],
            "example_source_inputs": tatoeba_metadata["sources"],
            "example_release_posture": tatoeba_metadata["release_posture"],
            "example_transform_sha256": example_transform_digest.hexdigest(),
            "relationship_source_resource_id": relationship_metadata["resource_id"],
            "relationship_source_sha256": file_sha256(relationship_source),
            "import_tool_sha256": import_tool_sha256,
            "dictionary_ranking_adapter_sha256": file_sha256(
                Path(__file__).with_name("dictionary_ranking_adapter.py")
            ),
            "dictionary_ranking_contract_sha256": file_sha256(
                Path(__file__).with_name("dictionary_ranking_contract.py")
            ),
            "shared_tooling_sha256": file_sha256(Path(__file__).with_name("language_data_tools.py")),
            "unidic_adapter_sha256": file_sha256(Path(__file__).with_name("unidic_adapter.py")),
            "tatoeba_adapter_sha256": tatoeba_adapter_sha256,
        }
        database.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            [(key, json.dumps(value, ensure_ascii=False, separators=(",", ":"))) for key, value in transform.items()],
        )
        database.commit()
        database.execute("VACUUM")
        database.commit()
    finally:
        database.close()

    transform["database_sha256"] = file_sha256(output)
    transform["database_bytes"] = output.stat().st_size
    return transform


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("source_metadata", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--unidic-source", type=Path, required=True)
    parser.add_argument("--unidic-metadata", type=Path, required=True)
    parser.add_argument("--tatoeba-japanese-source", type=Path, required=True)
    parser.add_argument("--tatoeba-english-source", type=Path, required=True)
    parser.add_argument("--tatoeba-links-source", type=Path, required=True)
    parser.add_argument("--tatoeba-japanese-detailed-source", type=Path, required=True)
    parser.add_argument("--tatoeba-english-detailed-source", type=Path, required=True)
    parser.add_argument("--tatoeba-japanese-cc0-source", type=Path, required=True)
    parser.add_argument("--tatoeba-english-cc0-source", type=Path, required=True)
    parser.add_argument("--tatoeba-metadata", type=Path, required=True)
    parser.add_argument("--relationship-source", type=Path, required=True)
    parser.add_argument("--ranking-contract", type=Path)
    arguments = parser.parse_args()

    source_metadata = json.loads(arguments.source_metadata.read_text())
    actual_sha = file_sha256(arguments.source)
    if actual_sha != source_metadata["sha256"]:
        raise SystemExit(f"source checksum mismatch: expected {source_metadata['sha256']}, got {actual_sha}")
    unidic_metadata = json.loads(arguments.unidic_metadata.read_text())
    actual_unidic_sha = file_sha256(arguments.unidic_source)
    if actual_unidic_sha != unidic_metadata["sha256"]:
        raise SystemExit(
            f"UniDic source checksum mismatch: expected {unidic_metadata['sha256']}, got {actual_unidic_sha}"
        )
    tatoeba_metadata = json.loads(arguments.tatoeba_metadata.read_text())
    relationship_metadata = json.loads(arguments.relationship_source.read_text())
    tatoeba_paths = {
        "japanese_sentences": arguments.tatoeba_japanese_source,
        "english_sentences": arguments.tatoeba_english_source,
        "japanese_english_links": arguments.tatoeba_links_source,
        "japanese_detailed_sentences": arguments.tatoeba_japanese_detailed_source,
        "english_detailed_sentences": arguments.tatoeba_english_detailed_source,
        "japanese_cc0_sentences": arguments.tatoeba_japanese_cc0_source,
        "english_cc0_sentences": arguments.tatoeba_english_cc0_source,
    }
    for pinned in tatoeba_metadata["sources"]:
        actual = file_sha256(tatoeba_paths[pinned["role"]])
        if actual != pinned["sha256"]:
            raise SystemExit(
                f"Tatoeba {pinned['role']} checksum mismatch: expected {pinned['sha256']}, got {actual}"
            )

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    transform = import_snapshot(
        arguments.source,
        arguments.output,
        source_metadata,
        arguments.unidic_source,
        unidic_metadata,
        arguments.tatoeba_japanese_source,
        arguments.tatoeba_english_source,
        arguments.tatoeba_links_source,
        arguments.tatoeba_japanese_detailed_source,
        arguments.tatoeba_english_detailed_source,
        arguments.tatoeba_japanese_cc0_source,
        arguments.tatoeba_english_cc0_source,
        tatoeba_metadata,
        arguments.relationship_source,
        relationship_metadata,
    )
    arguments.manifest.write_text(
        json.dumps({"source": source_metadata, "transform": transform}, ensure_ascii=False, indent=2) + "\n"
    )
    if arguments.ranking_contract:
        write_runtime_contract(arguments.ranking_contract, transform)
    print(json.dumps(transform, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
