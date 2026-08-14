#!/usr/bin/env python3
"""Build and validate Zenbu's derived Example Sentence Retrieval indexes."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import struct
import tempfile
from pathlib import Path


INDEX_SCHEMA_VERSION = "zenbu.example-sentence-retrieval-index.v1"
POLICY_VERSION = "ExampleSentenceRetrievalPolicy/v1"
PORTER_TABLE = "example_sentence_english_porter_fts"
EXACT_TABLE = "example_sentence_english_exact_fts"
MAP_TABLE = "example_sentence_fts_map"
METADATA_KEYS = {
    "retrieval_index_schema_version": INDEX_SCHEMA_VERSION,
    "retrieval_policy_version": POLICY_VERSION,
}


def _update_length_prefixed(digest: "hashlib._Hash", value: str) -> None:
    encoded = value.encode("utf-8")
    digest.update(struct.pack(">Q", len(encoded)))
    digest.update(encoded)


def corpus_checksum(database: sqlite3.Connection) -> str:
    """Hash canonical pair identity and text without depending on SQLite layout."""
    digest = hashlib.sha256()
    for row in database.execute(
        "SELECT id, japanese, english FROM example_sentences ORDER BY id"
    ):
        for value in row:
            _update_length_prefixed(digest, str(value))
    return digest.hexdigest()


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mapping_checksum(database: sqlite3.Connection) -> str:
    digest = hashlib.sha256()
    for rowid, pair_id in database.execute(
        f"SELECT fts_rowid, pair_id FROM {MAP_TABLE} ORDER BY fts_rowid"
    ):
        digest.update(struct.pack(">Q", int(rowid)))
        _update_length_prefixed(digest, str(pair_id))
    return digest.hexdigest()


def build_indexes(database: sqlite3.Connection, importer_path: Path | None = None) -> dict[str, str]:
    """Replace the complete derived index in one importer transaction."""
    importer_path = importer_path or Path(__file__)
    source_count = int(database.execute("SELECT count(*) FROM example_sentences").fetchone()[0])
    source_checksum = corpus_checksum(database)
    importer_checksum = file_checksum(importer_path)

    with database:
        database.execute(f"DROP TABLE IF EXISTS {PORTER_TABLE}")
        database.execute(f"DROP TABLE IF EXISTS {EXACT_TABLE}")
        database.execute(f"DROP TABLE IF EXISTS {MAP_TABLE}")
        database.execute(
            f"""
            CREATE TABLE {MAP_TABLE} (
              fts_rowid INTEGER PRIMARY KEY,
              pair_id TEXT NOT NULL UNIQUE REFERENCES example_sentences(id)
            )
            """
        )
        database.execute(
            f"CREATE VIRTUAL TABLE {PORTER_TABLE} "
            "USING fts4(english, tokenize=porter)"
        )
        database.execute(
            f"CREATE VIRTUAL TABLE {EXACT_TABLE} "
            "USING fts4(english, tokenize=simple)"
        )
        database.executemany(
            f"INSERT INTO {MAP_TABLE}(fts_rowid, pair_id) VALUES (?, ?)",
            enumerate(
                (
                    str(row[0])
                    for row in database.execute("SELECT id FROM example_sentences ORDER BY id")
                ),
                start=1,
            ),
        )
        ordered_documents = (
            f"SELECT m.fts_rowid, e.english FROM {MAP_TABLE} m "
            "JOIN example_sentences e ON e.id = m.pair_id ORDER BY m.fts_rowid"
        )
        database.execute(
            f"INSERT INTO {PORTER_TABLE}(docid, english) {ordered_documents}"
        )
        database.execute(
            f"INSERT INTO {EXACT_TABLE}(docid, english) {ordered_documents}"
        )
        database.execute(f"INSERT INTO {PORTER_TABLE}({PORTER_TABLE}) VALUES ('optimize')")
        database.execute(f"INSERT INTO {EXACT_TABLE}({EXACT_TABLE}) VALUES ('optimize')")

        metadata = {
            **METADATA_KEYS,
            "retrieval_corpus_sha256": source_checksum,
            "retrieval_index_mapping_sha256": mapping_checksum(database),
            "retrieval_importer_sha256": importer_checksum,
            "retrieval_index_row_count": str(source_count),
            "retrieval_exact_index_row_count": str(source_count),
            "retrieval_porter_tokenizer": "fts4/porter",
            "retrieval_exact_tokenizer": "fts4/simple",
        }
        database.executemany(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)",
            sorted(metadata.items()),
        )

    validate_indexes(database, expected_importer_checksum=importer_checksum)
    return metadata


def _metadata(database: sqlite3.Connection) -> dict[str, str]:
    return dict(
        database.execute(
            "SELECT key, value FROM metadata WHERE key LIKE 'retrieval_%' ORDER BY key"
        )
    )


def validate_indexes(
    database: sqlite3.Connection, expected_importer_checksum: str | None = None
) -> dict[str, str]:
    """Fail closed unless the final artifact satisfies the frozen v1 contract."""
    integrity = str(database.execute("PRAGMA integrity_check").fetchone()[0])
    if integrity != "ok":
        raise ValueError(f"SQLite integrity_check failed: {integrity}")

    metadata = _metadata(database)
    for key, expected in METADATA_KEYS.items():
        if metadata.get(key) != expected:
            raise ValueError(f"{key} mismatch: expected {expected!r}, got {metadata.get(key)!r}")
    if expected_importer_checksum and metadata.get("retrieval_importer_sha256") != expected_importer_checksum:
        raise ValueError("retrieval importer checksum mismatch")
    for key in (
        "retrieval_corpus_sha256",
        "retrieval_index_mapping_sha256",
        "retrieval_importer_sha256",
    ):
        value = metadata.get(key, "")
        if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
            raise ValueError(f"{key} is not a lowercase SHA-256")

    corpus_count = int(database.execute("SELECT count(*) FROM example_sentences").fetchone()[0])
    mapping_count = int(database.execute(f"SELECT count(*) FROM {MAP_TABLE}").fetchone()[0])
    porter_count = int(database.execute(f"SELECT count(*) FROM {PORTER_TABLE}").fetchone()[0])
    exact_count = int(database.execute(f"SELECT count(*) FROM {EXACT_TABLE}").fetchone()[0])
    recorded_porter = int(metadata.get("retrieval_index_row_count", "-1"))
    recorded_exact = int(metadata.get("retrieval_exact_index_row_count", "-1"))
    if len({corpus_count, mapping_count, porter_count, exact_count, recorded_porter, recorded_exact}) != 1:
        raise ValueError(
            "Example Sentence Retrieval index mapping is not one-to-one and complete: "
            f"corpus={corpus_count}, mapping={mapping_count}, porter={porter_count}, exact={exact_count}, "
            f"recorded_porter={recorded_porter}, recorded_exact={recorded_exact}"
        )
    if metadata.get("retrieval_corpus_sha256") != corpus_checksum(database):
        raise ValueError("retrieval corpus checksum mismatch")
    if metadata.get("retrieval_index_mapping_sha256") != mapping_checksum(database):
        raise ValueError("retrieval index mapping checksum mismatch")
    if metadata.get("retrieval_porter_tokenizer") != "fts4/porter":
        raise ValueError("retrieval Porter tokenizer metadata mismatch")
    if metadata.get("retrieval_exact_tokenizer") != "fts4/simple":
        raise ValueError("retrieval exact tokenizer metadata mismatch")

    missing = database.execute(
        f"""
        SELECT e.id
        FROM example_sentences e
        LEFT JOIN {MAP_TABLE} m ON m.pair_id = e.id
        LEFT JOIN {PORTER_TABLE} p ON p.docid = m.fts_rowid
        LEFT JOIN {EXACT_TABLE} x ON x.docid = m.fts_rowid
        WHERE m.pair_id IS NULL OR p.docid IS NULL OR x.docid IS NULL
        LIMIT 1
        """
    ).fetchone()
    if missing:
        raise ValueError(f"derived index is missing app-owned pair {missing[0]}")
    orphan = database.execute(
        f"""
        SELECT m.pair_id
        FROM {MAP_TABLE} m
        LEFT JOIN example_sentences e ON e.id = m.pair_id
        WHERE e.id IS NULL
        LIMIT 1
        """
    ).fetchone()
    if orphan:
        raise ValueError(f"derived index maps unknown app-owned pair {orphan[0]}")

    # Exercise the exact bound-phrase form used at runtime. A zero-row corpus is
    # valid for a test artifact; successful prepare/step proves module support.
    database.execute(
        f"SELECT count(*) FROM {PORTER_TABLE} WHERE {PORTER_TABLE} MATCH ?",
        ('"retrieval capability probe"',),
    ).fetchone()
    return metadata


def validate_manifest(database_path: Path, manifest_path: Path, metadata: dict[str, str]) -> None:
    manifest = json.loads(manifest_path.read_text())
    transform = manifest.get("transform", {})
    recorded = transform.get("example_sentence_retrieval", {})
    if recorded != metadata:
        raise ValueError("generated import manifest retrieval metadata disagrees with the database")
    actual_sha256 = file_checksum(database_path)
    if transform.get("database_sha256") != actual_sha256:
        raise ValueError(
            "generated import manifest database checksum mismatch: "
            f"expected {transform.get('database_sha256')!r}, got {actual_sha256!r}"
        )
    actual_bytes = database_path.stat().st_size
    if transform.get("database_bytes") != actual_bytes:
        raise ValueError(
            "generated import manifest database size mismatch: "
            f"expected {transform.get('database_bytes')!r}, got {actual_bytes!r}"
        )


def rebuild_atomically(path: Path) -> None:
    """Build a replacement beside the artifact, validate it, then atomically replace."""
    path = path.resolve()
    with tempfile.TemporaryDirectory(prefix="zenbu-example-retrieval-", dir=path.parent) as directory:
        replacement = Path(directory) / path.name
        shutil.copy2(path, replacement)
        database = sqlite3.connect(replacement)
        try:
            build_indexes(database)
            database.execute("VACUUM")
            validate_indexes(database, expected_importer_checksum=file_checksum(Path(__file__)))
        finally:
            database.close()
        os.replace(replacement, path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--manifest", type=Path)
    arguments = parser.parse_args()

    if arguments.rebuild:
        rebuild_atomically(arguments.database)
    else:
        database = sqlite3.connect(f"file:{arguments.database.resolve()}?mode=ro", uri=True)
        try:
            metadata = validate_indexes(database)
        finally:
            database.close()
        if arguments.manifest:
            validate_manifest(arguments.database.resolve(), arguments.manifest.resolve(), metadata)
        for key, value in sorted(metadata.items()):
            print(f"{key}={value}")


if __name__ == "__main__":
    main()
