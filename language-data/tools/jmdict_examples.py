from __future__ import annotations

import gzip
import hashlib
import re
import sqlite3
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

EXAMPLE_BLOCK = re.compile(rb"^<example>\n.*?^</example>\n", re.DOTALL | re.MULTILINE)
TATOEBA_EXAMPLE_SOURCE = "tat"
TATOEBA_PAIR_SOURCE = "tatoeba.weekly-export"
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"


def without_example_blocks(xml: bytes) -> bytes:
    return EXAMPLE_BLOCK.sub(b"", xml)


def check_without_examples(source: Path, recorded: dict[str, object]) -> None:
    with gzip.open(source, "rb") as compressed:
        stripped = without_example_blocks(compressed.read())
    found = {"xml_bytes": len(stripped), "xml_sha256": hashlib.sha256(stripped).hexdigest()}
    expected = {key: recorded[key] for key in found}
    if found != expected:
        raise ValueError(
            f"{source.name} without its example blocks is {found}, not the same day's "
            f"{recorded['identity']}, {expected}"
        )


@dataclass(frozen=True)
class SenseExample:
    ent_seq: int
    sense_order: int
    source_type: str
    sentence_id: int
    japanese: str
    english: str


def sense_examples(source: Path) -> list[SenseExample]:
    found: list[SenseExample] = []
    with gzip.open(source, "rb") as xml_source:
        for _, entry in ET.iterparse(xml_source, events=("end",)):
            if entry.tag != "entry":
                continue
            ent_seq = int((entry.findtext("ent_seq") or "").strip())
            for sense_order, sense in enumerate(entry.findall("sense")):
                for example in sense.findall("example"):
                    origin = example.find("ex_srce")
                    sentences = {
                        sentence.attrib.get(XML_LANG): (sentence.text or "").strip()
                        for sentence in example.findall("ex_sent")
                    }
                    found.append(
                        SenseExample(
                            ent_seq=ent_seq,
                            sense_order=sense_order,
                            source_type=origin.attrib.get("exsrc_type", "") if origin is not None else "",
                            sentence_id=int((origin.text or "0").strip()) if origin is not None else 0,
                            japanese=sentences.get("jpn", ""),
                            english=sentences.get("eng", ""),
                        )
                    )
            entry.clear()
    return found


def _entries(database: sqlite3.Connection) -> tuple[dict[int, tuple[bytes, bytes, int]], dict[bytes, list[bytes]]]:
    by_sequence: dict[int, tuple[bytes, bytes, int]] = {}
    siblings: dict[bytes, list[bytes]] = {}
    for entry_id, sequence, fingerprint, senses in database.execute(
        "SELECT id, source_record_id, semantic_fingerprint, json_array_length(senses_json) "
        "FROM entries ORDER BY source_record_id"
    ):
        by_sequence[sequence] = (entry_id, fingerprint, senses)
        siblings.setdefault(fingerprint, []).append(entry_id)
    return by_sequence, siblings


def _pairs(database: sqlite3.Connection) -> dict[int, set[tuple[bytes, str, str]]]:
    pairs: dict[int, set[tuple[bytes, str, str]]] = {}
    for sentence_id, pair_id, japanese, english in database.execute(
        "SELECT p.source_japanese_record_id, p.pair_id, e.japanese, e.english "
        "FROM example_sentence_provenance p JOIN example_sentences e ON e.id = p.pair_id "
        "WHERE p.source_identity = ?",
        (TATOEBA_PAIR_SOURCE,),
    ):
        pairs.setdefault(sentence_id, set()).add((pair_id, japanese, english))
    return pairs


def _unlinked_reason(
    example: SenseExample,
    entry: tuple[bytes, bytes, int] | None,
    pairs: set[tuple[bytes, str, str]],
) -> str | None:
    if example.source_type != TATOEBA_EXAMPLE_SOURCE:
        return "not_a_tatoeba_sentence"
    if entry is None:
        return "entry_not_imported"
    if example.sense_order >= entry[2]:
        return "sense_not_imported"
    if not pairs:
        return "sentence_not_bundled"
    if len(pairs) > 1:
        return "sentence_in_several_pairs"
    ((_, japanese, english),) = pairs
    if unicodedata.normalize("NFC", example.japanese) != japanese:
        return "japanese_differs_from_the_bundled_pair"
    if unicodedata.normalize("NFC", example.english) != english:
        return "english_differs_from_the_bundled_pair"
    return None


def link_sense_examples(
    database: sqlite3.Connection, examples: list[SenseExample]
) -> dict[str, object]:
    by_sequence, siblings = _entries(database)
    pairs = _pairs(database)
    unlinked: Counter[str] = Counter()
    linked_pairs: set[bytes] = set()
    linked_entries: set[int] = set()
    links: dict[tuple[bytes, int], list[bytes]] = {}
    for example in examples:
        entry = by_sequence.get(example.ent_seq)
        found = pairs.get(example.sentence_id, set())
        reason = _unlinked_reason(example, entry, found)
        if reason is not None:
            unlinked[reason] += 1
            continue
        _, fingerprint, _ = by_sequence[example.ent_seq]
        ((pair_id, _, _),) = found
        linked_pairs.add(pair_id)
        linked_entries.add(example.ent_seq)
        for sibling in siblings[fingerprint]:
            listed = links.setdefault((sibling, example.sense_order), [])
            if pair_id not in listed:
                listed.append(pair_id)

    rows = [
        (entry_id, sense_order, example_order, pair_id)
        for (entry_id, sense_order), listed in sorted(links.items())
        for example_order, pair_id in enumerate(listed)
    ]
    database.execute(
        """
        CREATE TABLE sense_examples (
          entry_id BLOB NOT NULL REFERENCES entries(id),
          sense_order INTEGER NOT NULL,
          example_order INTEGER NOT NULL,
          pair_id BLOB NOT NULL REFERENCES example_sentences(id),
          PRIMARY KEY(entry_id, sense_order, example_order)
        ) WITHOUT ROWID
        """
    )
    database.executemany("INSERT INTO sense_examples VALUES (?, ?, ?, ?)", rows)
    return {
        "source_examples": len(examples),
        "source_entries": len({example.ent_seq for example in examples}),
        "linked_examples": len(examples) - sum(unlinked.values()),
        "linked_source_entries": len(linked_entries),
        "linked_pairs": len(linked_pairs),
        "rows": len(rows),
        "entries": len({entry_id for entry_id, _ in links}),
        "senses": len(links),
        "unlinked_examples": dict(sorted(unlinked.items())),
    }
