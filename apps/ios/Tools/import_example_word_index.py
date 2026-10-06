#!/usr/bin/env python3

from __future__ import annotations

import re
import sqlite3
import tarfile
from collections import defaultdict
from pathlib import Path

from language_data_tools import built_artifact, file_sha256, run_import


ARTIFACT_SCHEMA = "zenbu.example-word-index.v1"
JMDICT_SOURCE_IDENTITY = "edrdg.jmdict"
TATOEBA_SOURCE_IDENTITY = "tatoeba.weekly-export"
FORM_KINDS = (0, 1)
SENTENCES_PER_ENTRY = 200

TOKEN_PATTERN = re.compile(
    r"^(?P<head>[^(\[{~]+)"
    r"(?:\((?:#(?P<sequence>\d+)|(?P<reading>[^)]+))\))?"
    r"(?:\[(?P<sense>\d+)\])?"
    r"(?:\{(?P<surface>[^}]+)\})?"
    r"(?P<checked>~)?$"
)


def index_lines(source: Path) -> list[str]:
    with tarfile.open(source, "r:bz2") as archive:
        member = archive.getmember("jpn_indices.csv")
        extracted = archive.extractfile(member)
        if extracted is None:
            raise ValueError("jpn_indices.csv is missing from the archive")
        return extracted.read().decode("utf-8").splitlines()


def load_entries(database: sqlite3.Connection):
    by_sequence: dict[int, bytes] = {}
    kana_headword: set[bytes] = set()
    headwords: dict[bytes, str] = {}
    fingerprint: dict[bytes, bytes] = {}
    for entry_id, sequence, headword, reading, semantic in database.execute(
        "SELECT id, source_record_id, headword, reading, semantic_fingerprint FROM entries "
        "WHERE source_identity = ?",
        (JMDICT_SOURCE_IDENTITY,),
    ):
        by_sequence[sequence] = entry_id
        fingerprint[entry_id] = semantic
        headwords[entry_id] = headword
        if headword == reading:
            kana_headword.add(entry_id)

    by_form: dict[str, set[bytes]] = defaultdict(set)
    readings: dict[bytes, set[str]] = defaultdict(set)
    primary_written: dict[bytes, str] = {}
    for entry_id, form, kind in database.execute(
        "SELECT entry_id, form, kind FROM forms WHERE kind IN (?, ?) ORDER BY rowid", FORM_KINDS
    ):
        by_form[form].add(entry_id)
        if kind == 1:
            readings[entry_id].add(form)
        else:
            primary_written.setdefault(entry_id, form)

    siblings: dict[bytes, list[bytes]] = defaultdict(list)
    for entry_id, semantic in fingerprint.items():
        siblings[semantic].append(entry_id)
    return (
        by_sequence, kana_headword, headwords, by_form, readings, primary_written, fingerprint,
        siblings,
    )


def is_kana(value: str) -> bool:
    return all("\u3041" <= c <= "\u30ff" for c in value)


def resolve(token, by_sequence, headwords, by_form, readings, primary_written) -> bytes | None:
    if token["sequence"]:
        return by_sequence.get(int(token["sequence"]))
    head = token["head"]
    candidates = by_form.get(head, set())
    if token["reading"]:
        candidates = {entry for entry in candidates if token["reading"] in readings[entry]}
    if len(candidates) > 1:
        if is_kana(head):
            candidates = {entry for entry in candidates if headwords[entry] == head}
        else:
            candidates = {
                entry for entry in candidates if primary_written.get(entry, head) == head
            } or candidates
    return next(iter(candidates)) if len(candidates) == 1 else None


def load_pairs(database: sqlite3.Connection) -> dict[tuple[int, int], bytes]:
    return {
        (japanese_id, english_id): pair_id
        for pair_id, japanese_id, english_id in database.execute(
            "SELECT pair_id, source_japanese_record_id, source_english_record_id "
            "FROM example_sentence_provenance WHERE source_identity = ?",
            (TATOEBA_SOURCE_IDENTITY,),
        )
    }


def import_index(source: Path, source_manifest: dict, language_data: Path, output: Path) -> dict:
    if file_sha256(source) != source_manifest["sha256"]:
        raise ValueError("jpn_indices archive does not match its pinned SHA-256")

    database = sqlite3.connect(f"file:{language_data}?mode=ro", uri=True)
    try:
        (
            by_sequence, kana_headword, headwords, by_form, readings, primary_written,
            fingerprint, siblings,
        ) = load_entries(database)
        pairs = load_pairs(database)
        japanese_lengths = dict(
            database.execute("SELECT id, length(japanese) FROM example_sentences")
        )
    finally:
        database.close()

    lines = index_lines(source)
    tokens_seen = tokens_resolved = unpaired_lines = 0
    links: dict[bytes, dict[bytes, tuple[bool, str]]] = defaultdict(dict)
    for line in lines:
        japanese_id, english_id, body = line.split("\t", 2)
        pair_id = pairs.get((int(japanese_id), int(english_id)))
        if pair_id is None:
            unpaired_lines += 1
            continue
        for raw in body.split(" "):
            match = TOKEN_PATTERN.match(raw)
            if not match or not raw:
                continue
            tokens_seen += 1
            entry = resolve(match, by_sequence, headwords, by_form, readings, primary_written)
            if entry is None:
                continue
            tokens_resolved += 1
            if entry not in kana_headword:
                continue
            surface = match["surface"] or match["head"]
            checked = match["checked"] is not None
            for linked in siblings[fingerprint[entry]]:
                previous = links[linked].get(pair_id)
                if previous is None or (checked and not previous[0]):
                    links[linked][pair_id] = (checked, surface)

    rows = []
    for entry, sentences in links.items():
        ranked = sorted(
            sentences.items(),
            key=lambda item: (not item[1][0], japanese_lengths[item[0]], item[0]),
        )[:SENTENCES_PER_ENTRY]
        rows.extend((entry, pair_id, surface) for pair_id, (_, surface) in ranked)
    rows.sort()

    temporary = output.with_suffix(".tmp")
    temporary.unlink(missing_ok=True)
    artifact = sqlite3.connect(temporary)
    try:
        artifact.executescript(
            """
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
            CREATE TABLE entry_sentences (
              entry_id BLOB NOT NULL,
              pair_id BLOB NOT NULL,
              surface TEXT NOT NULL,
              PRIMARY KEY (entry_id, pair_id)
            ) WITHOUT ROWID;
            """
        )
        language_data_sha256 = file_sha256(language_data)
        artifact.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            (
                ("artifact_schema", ARTIFACT_SCHEMA),
                ("source_identity", "tatoeba.jpn-indices"),
                ("source_sha256", source_manifest["sha256"]),
                ("language_data_sha256", language_data_sha256),
                ("sentences_per_entry", str(SENTENCES_PER_ENTRY)),
            ),
        )
        artifact.executemany(
            "INSERT INTO entry_sentences(entry_id, pair_id, surface) VALUES (?, ?, ?)", rows
        )
        artifact.commit()
        artifact.execute("VACUUM")
    finally:
        artifact.close()
    temporary.replace(output)

    return {
        "identity": "tatoeba-jpn-indices-to-zenbu-example-word-index-v1",
        "artifact_schema": ARTIFACT_SCHEMA,
        "index_lines": len(lines),
        "index_lines_without_bundled_pair": unpaired_lines,
        "tokens": tokens_seen,
        "tokens_resolved_to_one_entry": tokens_resolved,
        "kana_headword_entries_linked": len(links),
        "entry_sentence_rows": len(rows),
        "sentences_per_entry": SENTENCES_PER_ENTRY,
        "retained_fields": ["sentence-to-entry links", "surface form in the sentence"],
        "excluded_fields": ["sense numbers", "kanji-headword entries", "unresolved tokens"],
        "source_sha256": source_manifest["sha256"],
        "language_data_sha256": language_data_sha256,
        **built_artifact(Path(__file__), output),
    }


def main() -> None:
    run_import(
        lambda arguments, source_manifest: import_index(
            arguments.source, source_manifest, arguments.language_data, arguments.output
        ),
        "--language-data",
    )


if __name__ == "__main__":
    main()
