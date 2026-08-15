#!/usr/bin/env python3
"""Benchmark the proposed Dictionary Best Match contract against a pinned JMdict source.

The raw source coordinate is used only to join the pinned source record to its
normalized artifact row. It is never part of eligibility or a rank tuple.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sqlite3
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, replace
from pathlib import Path


ASCII_FIXTURES = {
    "set": ("セット", "セット"),
    "light": ("光", "ひかり"),
    "think": ("がる", "がる"),
    "hello": ("今日は", "こんにちは"),
    "tabeta": ("食べる", "たべる"),
    "makasete": ("任せる", "まかせる"),
}
JAPANESE_FIXTURES = {
    "はし": ("端", "はし"),
    "問題": ("問題", "もんだい"),
    "ねこ": ("猫", "ねこ"),
}


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deinflected_candidates(value: str) -> list[str]:
    candidates: list[str] = []

    def append(candidate: str) -> None:
        candidate = normalized(candidate)
        if candidate != value and candidate not in candidates:
            candidates.append(candidate)

    def replace(suffix: str, endings: list[str]) -> None:
        if value.endswith(suffix) and len(value) > len(suffix):
            stem = value[: -len(suffix)]
            for ending in endings:
                append(stem + ending)

    if value in {"shita", "shite"}:
        append("suru")
    if value in {"kita", "kite"}:
        append("kuru")
    if value in {"itta", "itte"}:
        append("iku")
    for suffix, endings in (
        ("shita", ["su"]), ("shite", ["su"]),
        ("tta", ["u", "tsu", "ru"]), ("tte", ["u", "tsu", "ru"]),
        ("nda", ["mu", "bu", "nu"]), ("nde", ["mu", "bu", "nu"]),
        ("ita", ["ku"]), ("ite", ["ku"]), ("ida", ["gu"]),
        ("ide", ["gu"]), ("sete", ["seru", "su"]),
        ("ta", ["ru"]), ("te", ["ru"]),
    ):
        replace(suffix, endings)
    return candidates


@dataclass(frozen=True)
class RawEntry:
    written_priorities: dict[str, tuple[str, ...]]
    reading_priorities: dict[str, tuple[str, ...]]
    glosses: tuple[tuple[int, int, str], ...]


@dataclass(frozen=True)
class Candidate:
    source_record_id: int
    headword: str
    reading: str
    meanings_json: str
    parts_of_speech_json: str
    written_forms_json: str
    reading_forms_json: str
    senses_json: str
    romaji_exact: bool = False
    romaji_prefix: bool = False
    romaji_contains: bool = False

    @property
    def semantic_key(self) -> str:
        payload = json.dumps(
            {
                "headword": self.headword,
                "reading": self.reading,
                "meanings": json.loads(self.meanings_json),
                "partsOfSpeech": json.loads(self.parts_of_speech_json),
                "writtenForms": json.loads(self.written_forms_json),
                "readingForms": json.loads(self.reading_forms_json),
                "senses": json.loads(self.senses_json),
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode()).hexdigest()


def priority_profile(tags: tuple[str, ...]) -> tuple[int, int, int]:
    """Make current recognized tiers explicit, then add gai2, nf band, and breadth."""
    values = set(tags)
    marker_strength = min(
        0 if "spec1" in values else 9,
        1 if "ichi1" in values else 9,
        2 if "news1" in values else 9,
        3 if {"gai1", "spec2"} & values else 9,
        4 if {"ichi2", "news2"} & values else 9,
        5 if "gai2" in values else 9,
    )
    bands = [int(tag[2:]) for tag in values if re.fullmatch(r"nf\d\d", tag)]
    band = min(bands, default=99)
    primary_breadth = -sum(
        marker in values for marker in ("spec1", "ichi1", "news1", "gai1")
    )
    return marker_strength, band, primary_breadth


def english_relation(query: str, gloss: str) -> tuple[int, str] | None:
    value = normalized(gloss)
    if value == query:
        return 0, "exactGloss"
    if value.startswith(query + " ("):
        return 1, "qualifiedGloss"
    if value == "to " + query:
        return 2, "exactInfinitive"
    if value.startswith("to " + query + " ("):
        return 3, "qualifiedInfinitive"
    if re.search(r"(?:^|[^a-z])" + re.escape(query) + r"(?:$|[^a-z])", value):
        return 4, "glossToken"
    return None


def candidate_from_row(row: sqlite3.Row, **evidence: bool) -> Candidate:
    return Candidate(
        source_record_id=row["source_record_id"],
        headword=row["headword"],
        reading=row["reading"],
        meanings_json=row["meanings_json"],
        parts_of_speech_json=row["parts_of_speech_json"],
        written_forms_json=row["written_forms_json"],
        reading_forms_json=row["reading_forms_json"],
        senses_json=row["senses_json"],
        **evidence,
    )


def ascii_candidates(database: sqlite3.Connection, query: str) -> dict[int, Candidate]:
    rows = database.execute(
        """
        SELECT source_record_id, headword, reading, meanings_json,
          parts_of_speech_json, written_forms_json, reading_forms_json, senses_json
        FROM entries
        WHERE (' ' || lower(gloss_search) || ' ')
          GLOB ('*[^a-z]' || ? || '[^a-z]*')
        """,
        (query,),
    )
    candidates = {row["source_record_id"]: candidate_from_row(row) for row in rows}
    rows = database.execute(
        """
        SELECT e.source_record_id, e.headword, e.reading, e.meanings_json,
          e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json, e.senses_json,
          max(f.form = ?) AS romaji_exact,
          max(f.form LIKE ?) AS romaji_prefix
        FROM forms f JOIN entries e ON e.id = f.entry_id
        WHERE f.kind = 2 AND f.form LIKE ?
        GROUP BY e.id
        """,
        (query, query + "%", "%" + query + "%"),
    )
    for row in rows:
        prior = candidates.get(row["source_record_id"])
        source = row if prior is None else {
            "source_record_id": prior.source_record_id,
            "headword": prior.headword,
            "reading": prior.reading,
            "meanings_json": prior.meanings_json,
            "parts_of_speech_json": prior.parts_of_speech_json,
            "written_forms_json": prior.written_forms_json,
            "reading_forms_json": prior.reading_forms_json,
            "senses_json": prior.senses_json,
        }
        candidates[row["source_record_id"]] = candidate_from_row(
            source,
            romaji_exact=bool(row["romaji_exact"]),
            romaji_prefix=bool(row["romaji_prefix"]),
            romaji_contains=True,
        )
    return candidates


def source_ids_for_queries(database: sqlite3.Connection, queries: set[str]) -> set[int]:
    identifiers: set[int] = set()
    for query in queries:
        if query.isascii():
            identifiers.update(ascii_candidates(database, query))
        else:
            rows = database.execute(
                """
                SELECT DISTINCT e.source_record_id
                FROM forms f JOIN entries e ON e.id = f.entry_id
                WHERE f.kind IN (0, 1) AND f.form LIKE ?
                """,
                ("%" + query + "%",),
            )
            identifiers.update(row[0] for row in rows)
    return identifiers


def load_raw_entries(path: Path, identifiers: set[int]) -> dict[int, RawEntry]:
    records: dict[int, RawEntry] = {}
    with gzip.open(path, "rb") as source:
        for _, entry in ET.iterparse(source, events=("end",)):
            if entry.tag != "entry":
                continue
            source_record_id = int(entry.findtext("ent_seq") or "0")
            if source_record_id in identifiers:
                written = {
                    normalized(node.findtext("keb") or ""): tuple(
                        value.text or "" for value in node.findall("ke_pri")
                    )
                    for node in entry.findall("k_ele")
                }
                readings = {
                    normalized(node.findtext("reb") or ""): tuple(
                        value.text or "" for value in node.findall("re_pri")
                    )
                    for node in entry.findall("r_ele")
                }
                glosses: list[tuple[int, int, str]] = []
                for sense_index, sense in enumerate(entry.findall("sense")):
                    for gloss_index, gloss in enumerate(sense.findall("gloss")):
                        language = gloss.attrib.get(
                            "{http://www.w3.org/XML/1998/namespace}lang", "eng"
                        )
                        if language == "eng":
                            glosses.append((sense_index, gloss_index, gloss.text or ""))
                records[source_record_id] = RawEntry(written, readings, tuple(glosses))
            entry.clear()
    missing = identifiers - records.keys()
    if missing:
        raise RuntimeError(f"source join incomplete: {len(missing)} normalized rows missing")
    return records


def displayed_priority(candidate: Candidate, raw: RawEntry) -> tuple[str, ...]:
    headword = normalized(candidate.headword)
    if headword in raw.written_priorities:
        return raw.written_priorities[headword]
    return raw.reading_priorities.get(headword, ())


def rank_ascii(
    query: str, candidates: dict[int, Candidate], raw_entries: dict[int, RawEntry]
) -> list[tuple[tuple[object, ...], Candidate, str]]:
    ranked: list[tuple[tuple[object, ...], Candidate, str]] = []
    for identifier, candidate in candidates.items():
        raw = raw_entries[identifier]
        relations = []
        for sense_index, gloss_index, gloss in raw.glosses:
            relation = english_relation(query, gloss)
            if relation:
                relations.append((relation[0], sense_index, gloss_index, relation[1]))
        if relations:
            relation, sense_index, gloss_index, label = min(
                relations,
                key=lambda value: (
                    0 if value[0] <= 3 else 1,
                    value[1],
                    value[0],
                    value[2],
                ),
            )
            strength = 0 if relation <= 3 else 1
            corroborated = -int(
                strength == 0 and (candidate.romaji_exact or candidate.romaji_prefix)
            )
            evidence = (strength, corroborated, sense_index, relation, gloss_index)
        elif candidate.romaji_exact:
            label = "romajiExact"
            evidence = (2, 0, 0, 0, 0)
        elif candidate.romaji_prefix:
            label = "romajiPrefix"
            evidence = (2, 1, 0, 0, 0)
        else:
            label = "romajiContains"
            evidence = (2, 2, 0, 0, 0)
        profile = priority_profile(displayed_priority(candidate, raw))
        unmarked = int(profile == (9, 99, 0))
        key = (
            evidence[:3],
            unmarked,
            evidence[3],
            profile,
            evidence[4],
            len(candidate.headword),
            candidate.semantic_key,
        )
        ranked.append((key, candidate, label))
    grouped: dict[str, list[tuple[tuple[object, ...], Candidate, str]]] = {}
    for result in ranked:
        grouped.setdefault(result[1].semantic_key, []).append(result)
    best_by_semantic_key = {}
    for semantic_key, equivalent in grouped.items():
        key, representative, label = min(equivalent, key=lambda result: result[0])
        representative = replace(
            representative,
            source_record_id=0,
            romaji_exact=any(result[1].romaji_exact for result in equivalent),
            romaji_prefix=any(result[1].romaji_prefix for result in equivalent),
            romaji_contains=any(result[1].romaji_contains for result in equivalent),
        )
        best_by_semantic_key[semantic_key] = (key, representative, label)
    return sorted(best_by_semantic_key.values(), key=lambda result: result[0])


def rank_japanese(
    database: sqlite3.Connection, query: str, raw_entries: dict[int, RawEntry]
) -> list[tuple[tuple[object, ...], Candidate, str]]:
    rows = database.execute(
        """
        SELECT e.source_record_id, e.headword, e.reading, e.meanings_json,
          e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json,
          e.senses_json, f.form, f.kind
        FROM forms f JOIN entries e ON e.id = f.entry_id
        WHERE f.kind IN (0, 1) AND f.form LIKE ?
        """,
        ("%" + query + "%",),
    )
    best_by_entry: dict[int, tuple[tuple[object, ...], Candidate, str]] = {}
    for row in rows:
        candidate = candidate_from_row(row)
        exact = row["form"] == query
        prefix = row["form"].startswith(query)
        kind = row["kind"]
        relation = (0 if kind == 0 else 1) + (0 if exact else 2 if prefix else 4)
        label = ("written" if kind == 0 else "reading") + (
            "Exact" if exact else "Prefix" if prefix else "Contains"
        )
        raw = raw_entries[row["source_record_id"]]
        tags = (
            raw.written_priorities.get(normalized(row["form"]), ())
            if kind == 0
            else raw.reading_priorities.get(normalized(row["form"]), ())
        )
        sense_breadth = len(json.loads(candidate.senses_json))
        key = (
            relation,
            priority_profile(tags),
            -sense_breadth,
            len(candidate.headword),
            candidate.semantic_key,
        )
        result = (key, candidate, label)
        if row["source_record_id"] not in best_by_entry or key < best_by_entry[row["source_record_id"]][0]:
            best_by_entry[row["source_record_id"]] = result
    best_by_semantic_key: dict[
        str, tuple[tuple[object, ...], Candidate, str]
    ] = {}
    for result in best_by_entry.values():
        semantic_key = result[1].semantic_key
        current = best_by_semantic_key.get(semantic_key)
        if current is None or result[0] < current[0]:
            best_by_semantic_key[semantic_key] = result
    return sorted(best_by_semantic_key.values(), key=lambda result: result[0])


def select_ascii(
    database: sqlite3.Connection, query: str, raw_entries: dict[int, RawEntry]
) -> tuple[Candidate, str]:
    direct = rank_ascii(query, ascii_candidates(database, query), raw_entries)
    has_direct_exact_or_prefix = any(
        candidate.romaji_exact or candidate.romaji_prefix or key[0][0] == 0
        for key, candidate, _ in direct
    )
    if not has_direct_exact_or_prefix:
        deinflected: list[tuple[Candidate, str]] = []
        seen: set[str] = set()
        for derived in deinflected_candidates(query):
            ranked = rank_ascii(derived, ascii_candidates(database, derived), raw_entries)
            for _, candidate, label in ranked[:3]:
                if candidate.semantic_key not in seen:
                    seen.add(candidate.semantic_key)
                    deinflected.append((candidate, f"deinflected:{derived}:{label}"))
        if deinflected:
            return deinflected[0]
    if not direct:
        raise RuntimeError(f"no candidates for {query}")
    _, candidate, label = direct[0]
    return candidate, label


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--jmdict", required=True, type=Path)
    parser.add_argument("--expected-jmdict-sha256", required=True)
    args = parser.parse_args()

    actual_sha256 = file_sha256(args.jmdict)
    if actual_sha256 != args.expected_jmdict_sha256:
        raise SystemExit(
            "JMdict checksum mismatch: "
            f"expected {args.expected_jmdict_sha256}, got {actual_sha256}"
        )

    database = sqlite3.connect(args.database)
    database.row_factory = sqlite3.Row
    all_ascii_queries = set(ASCII_FIXTURES)
    for query in ASCII_FIXTURES:
        all_ascii_queries.update(deinflected_candidates(query))
    source_ids = source_ids_for_queries(
        database, all_ascii_queries | set(JAPANESE_FIXTURES)
    )
    raw_entries = load_raw_entries(args.jmdict, source_ids)

    rows = []
    for query, expected in ASCII_FIXTURES.items():
        selected, evidence = select_ascii(database, query, raw_entries)
        actual = (selected.headword, selected.reading)
        rows.append((query, expected, actual, evidence))
    for query, expected in JAPANESE_FIXTURES.items():
        ranked = rank_japanese(database, query, raw_entries)
        if not ranked:
            raise RuntimeError(f"no candidates for {query}")
        _, selected, evidence = ranked[0]
        actual = (selected.headword, selected.reading)
        rows.append((query, expected, actual, evidence))

    failures = 0
    for query, expected, actual, evidence in rows:
        status = "PASS" if expected == actual else "FAIL"
        failures += status == "FAIL"
        print(
            json.dumps(
                {
                    "status": status,
                    "query": query,
                    "expected": {"headword": expected[0], "reading": expected[1]},
                    "actual": {"headword": actual[0], "reading": actual[1]},
                    "evidence": evidence,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    if failures:
        raise SystemExit(f"FAIL {failures}/{len(rows)} fixtures")
    print(f"PASS {len(rows)}/{len(rows)} dictionary-ranking fixtures")


if __name__ == "__main__":
    main()
