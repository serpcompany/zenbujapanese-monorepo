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
from enum import IntEnum
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
PINNED_JMDICT_PATH = (
    Path(__file__).resolve().parents[3]
    / "apps/ios/LanguageData/Sources/JMdict_e-2026-08-10.gz"
)
PINNED_JMDICT_SHA256 = (
    "54a6ecce385de30776e842b18ca62da7a60dfd923dc5b1f8101ce37f528e1d5e"
)
PINNED_BENCHMARK_STDOUT_SHA256 = (
    "5bcc57e3da274109d2b13f9a4f9795d3b9a371aedd51e6f22788439bbdc348e6"
)


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
    senses: tuple["CanonicalSenseEvidence", ...]
    glosses: tuple["CanonicalGlossAtom", ...]


@dataclass(frozen=True)
class CanonicalGlossAtom:
    sense: "CanonicalSenseEvidence"
    gloss_order: int
    text: str


@dataclass(frozen=True)
class CanonicalSenseEvidence:
    sense_order: int
    parts_of_speech: tuple[str, ...]
    restricted_written_forms: tuple[str, ...]
    restricted_reading_forms: tuple[str, ...]


class EvidenceLane(IntEnum):
    STRONG_GLOSS = 0
    TOKEN_GLOSS = 1
    ROMAJI_ONLY = 2


class EnglishRelation(IntEnum):
    EXACT_GLOSS = 0
    QUALIFIED_GLOSS = 1
    EXACT_INFINITIVE = 2
    QUALIFIED_INFINITIVE = 3
    GLOSS_TOKEN = 4
    ROMAJI_EXACT = 5
    ROMAJI_PREFIX = 6
    ROMAJI_CONTAINS = 7


class FormRelation(IntEnum):
    WRITTEN_EXACT = 0
    READING_EXACT = 1
    WRITTEN_PREFIX = 2
    READING_PREFIX = 3
    WRITTEN_CONTAINS = 4
    READING_CONTAINS = 5


class RomajiSpecificity(IntEnum):
    EXACT = 0
    PREFIX = 1
    CONTAINS = 2


class PriorityCategory(IntEnum):
    SPECIAL_PRIMARY = 0
    LEARNER_PRIMARY = 1
    NEWS_PRIMARY = 2
    LOANWORD_PRIMARY_OR_SPECIAL_SECONDARY = 3
    LEARNER_OR_NEWS_SECONDARY = 4
    LOANWORD_SECONDARY = 5
    UNMARKED = 9


@dataclass(frozen=True, order=True)
class PriorityProfile:
    category: PriorityCategory
    news_frequency_band: int
    primary_marker_breadth_rank: int

    @property
    def is_marked(self) -> bool:
        return self.category is not PriorityCategory.UNMARKED


@dataclass(frozen=True)
class EnglishEvidence:
    gloss_matches: tuple["GlossMatch", ...]
    romaji_relations: tuple[EnglishRelation, ...]
    priority_profiles: tuple[PriorityProfile, ...]

    @property
    def selected_gloss(self) -> "GlossMatch | None":
        return min(self.gloss_matches, key=lambda match: match.key, default=None)

    @property
    def lane(self) -> EvidenceLane:
        if self.selected_gloss is None:
            return EvidenceLane.ROMAJI_ONLY
        return self.selected_gloss.key.lane

    @property
    def relation(self) -> EnglishRelation:
        if self.selected_gloss is not None:
            return self.selected_gloss.relation
        return min(self.romaji_relations)

    @property
    def corroborated(self) -> bool:
        return (
            self.lane is EvidenceLane.STRONG_GLOSS
            and bool(
                {EnglishRelation.ROMAJI_EXACT, EnglishRelation.ROMAJI_PREFIX}
                & set(self.romaji_relations)
            )
        )

    @property
    def romaji_specificity(self) -> RomajiSpecificity | None:
        for relation, specificity in (
            (EnglishRelation.ROMAJI_EXACT, RomajiSpecificity.EXACT),
            (EnglishRelation.ROMAJI_PREFIX, RomajiSpecificity.PREFIX),
            (EnglishRelation.ROMAJI_CONTAINS, RomajiSpecificity.CONTAINS),
        ):
            if relation in self.romaji_relations:
                return specificity
        return None

    @property
    def priority_profile(self) -> PriorityProfile:
        return min(self.priority_profiles)

    @property
    def sense_order(self) -> int:
        return self.selected_gloss.sense_order if self.selected_gloss else 0

    @property
    def gloss_order(self) -> int:
        return self.selected_gloss.gloss_order if self.selected_gloss else 0


@dataclass(frozen=True, order=True)
class GlossMatchKey:
    lane: EvidenceLane
    sense_order: int
    relation: EnglishRelation
    gloss_order: int


@dataclass(frozen=True)
class GlossMatch:
    key: GlossMatchKey
    relation: EnglishRelation
    sense_order: int
    gloss_order: int
    parts_of_speech: tuple[str, ...]
    restricted_written_forms: tuple[str, ...]
    restricted_reading_forms: tuple[str, ...]


@dataclass(frozen=True, order=True)
class EnglishRankKey:
    """English Ranking order; dataclass field order is the executable policy."""

    lane: EvidenceLane
    corroboration_rank: int
    romaji_specificity_rank: int
    sense_order: int
    priority_presence_rank: int
    relation: EnglishRelation
    priority_profile: PriorityProfile
    gloss_order: int
    headword_length: int
    semantic_fingerprint: str


@dataclass(frozen=True, order=True)
class JapaneseRankKey:
    """Japanese Ranking order; dataclass field order is the executable policy."""

    relation: FormRelation
    priority_profile: PriorityProfile
    sense_breadth_rank: int
    headword_length: int
    semantic_fingerprint: str


@dataclass(frozen=True)
class RankedEnglishCandidate:
    rank: EnglishRankKey
    candidate: "Candidate"
    evidence: EnglishEvidence


@dataclass(frozen=True, order=True)
class FormMatchKey:
    relation: FormRelation
    priority_profile: PriorityProfile
    normalized_form: str


@dataclass(frozen=True)
class FormMatch:
    key: FormMatchKey
    relation: FormRelation
    priority_profile: PriorityProfile


@dataclass(frozen=True)
class JapaneseEvidence:
    form_matches: tuple[FormMatch, ...]

    @property
    def selected_form(self) -> FormMatch:
        return min(self.form_matches, key=lambda match: match.key)


@dataclass(frozen=True)
class RankedJapaneseCandidate:
    rank: JapaneseRankKey
    candidate: "Candidate"
    evidence: JapaneseEvidence


@dataclass(frozen=True)
class SelectionEvidence:
    english: EnglishEvidence | None = None
    japanese: JapaneseEvidence | None = None
    deinflected_query: str | None = None

    def as_json(self) -> dict[str, object]:
        if self.english is not None:
            return {
                "route": "english",
                "deinflectedQuery": self.deinflected_query,
                "glossMatches": [
                    {
                        "relation": match.relation.name,
                        "senseOrder": match.sense_order,
                        "glossOrder": match.gloss_order,
                        "partsOfSpeech": list(match.parts_of_speech),
                        "restrictedWrittenForms": list(
                            match.restricted_written_forms
                        ),
                        "restrictedReadingForms": list(
                            match.restricted_reading_forms
                        ),
                    }
                    for match in self.english.gloss_matches
                ],
                "romajiRelations": [
                    relation.name for relation in self.english.romaji_relations
                ],
                "priorityProfiles": [
                    {
                        "category": profile.category.name,
                        "newsFrequencyBand": profile.news_frequency_band,
                        "primaryMarkerBreadthRank": profile.primary_marker_breadth_rank,
                    }
                    for profile in self.english.priority_profiles
                ],
            }
        return {
            "route": "japanese",
            "formMatches": [
                {
                    "relation": match.relation.name,
                    "priorityProfile": {
                        "category": match.priority_profile.category.name,
                        "newsFrequencyBand": match.priority_profile.news_frequency_band,
                        "primaryMarkerBreadthRank": (
                            match.priority_profile.primary_marker_breadth_rank
                        ),
                    },
                }
                for match in self.japanese.form_matches
            ] if self.japanese is not None else [],
        }


@dataclass(frozen=True)
class Selection:
    candidate: "Candidate"
    evidence: SelectionEvidence


@dataclass(frozen=True)
class Candidate:
    source_record_id: int | None
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



def semantic_fingerprint(candidate: Candidate, raw: RawEntry) -> str:
    payload = json.dumps(
        {
            "headword": candidate.headword,
            "reading": candidate.reading,
            "meanings": json.loads(candidate.meanings_json),
            "partsOfSpeech": json.loads(candidate.parts_of_speech_json),
            "writtenForms": json.loads(candidate.written_forms_json),
            "readingForms": json.loads(candidate.reading_forms_json),
            "senses": [
                {
                    "senseOrder": sense.sense_order,
                    "partsOfSpeech": sense.parts_of_speech,
                    "restrictedWrittenForms": sense.restricted_written_forms,
                    "restrictedReadingForms": sense.restricted_reading_forms,
                }
                for sense in raw.senses
            ],
            "glossAtoms": [
                {
                    "senseOrder": atom.sense.sense_order,
                    "glossOrder": atom.gloss_order,
                    "text": atom.text,
                }
                for atom in raw.glosses
            ],
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def priority_profile(tags: tuple[str, ...]) -> PriorityProfile:
    """Make current recognized tiers explicit, then add gai2, nf band, and breadth."""
    values = set(tags)
    category = min(
        PriorityCategory.SPECIAL_PRIMARY if "spec1" in values else PriorityCategory.UNMARKED,
        PriorityCategory.LEARNER_PRIMARY if "ichi1" in values else PriorityCategory.UNMARKED,
        PriorityCategory.NEWS_PRIMARY if "news1" in values else PriorityCategory.UNMARKED,
        PriorityCategory.LOANWORD_PRIMARY_OR_SPECIAL_SECONDARY
        if {"gai1", "spec2"} & values else PriorityCategory.UNMARKED,
        PriorityCategory.LEARNER_OR_NEWS_SECONDARY
        if {"ichi2", "news2"} & values else PriorityCategory.UNMARKED,
        PriorityCategory.LOANWORD_SECONDARY if "gai2" in values else PriorityCategory.UNMARKED,
    )
    bands = [int(tag[2:]) for tag in values if re.fullmatch(r"nf\d\d", tag)]
    band = min(bands, default=99)
    primary_breadth = -sum(
        marker in values for marker in ("spec1", "ichi1", "news1", "gai1")
    )
    return PriorityProfile(category, band, primary_breadth)


def english_relation(query: str, gloss: str) -> EnglishRelation | None:
    value = normalized(gloss)
    if value == query:
        return EnglishRelation.EXACT_GLOSS
    if value.startswith(query + " ("):
        return EnglishRelation.QUALIFIED_GLOSS
    if value == "to " + query:
        return EnglishRelation.EXACT_INFINITIVE
    if value.startswith("to " + query + " ("):
        return EnglishRelation.QUALIFIED_INFINITIVE
    if re.search(r"(?:^|[^a-z])" + re.escape(query) + r"(?:$|[^a-z])", value):
        return EnglishRelation.GLOSS_TOKEN
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
                senses: list[CanonicalSenseEvidence] = []
                glosses: list[CanonicalGlossAtom] = []
                for sense_index, sense in enumerate(entry.findall("sense")):
                    sense_evidence = CanonicalSenseEvidence(
                        sense_order=sense_index,
                        parts_of_speech=tuple(
                            node.text or "" for node in sense.findall("pos")
                        ),
                        restricted_written_forms=tuple(
                            normalized(node.text or "")
                            for node in sense.findall("stagk")
                        ),
                        restricted_reading_forms=tuple(
                            normalized(node.text or "")
                            for node in sense.findall("stagr")
                        ),
                    )
                    if not set(sense_evidence.restricted_written_forms) <= set(written):
                        raise RuntimeError(
                            "sense written-form restriction is not an entry form"
                        )
                    if not set(sense_evidence.restricted_reading_forms) <= set(readings):
                        raise RuntimeError(
                            "sense reading-form restriction is not an entry form"
                        )
                    senses.append(sense_evidence)
                    english_gloss_order = 0
                    for gloss in sense.findall("gloss"):
                        language = gloss.attrib.get(
                            "{http://www.w3.org/XML/1998/namespace}lang", "eng"
                        )
                        if language == "eng":
                            glosses.append(
                                CanonicalGlossAtom(
                                    sense=sense_evidence,
                                    gloss_order=english_gloss_order,
                                    text=gloss.text or "",
                                )
                            )
                            english_gloss_order += 1
                records[source_record_id] = RawEntry(
                    written, readings, tuple(senses), tuple(glosses)
                )
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


def romaji_relations(candidate: Candidate) -> tuple[EnglishRelation, ...]:
    relations: list[EnglishRelation] = []
    if candidate.romaji_exact:
        relations.append(EnglishRelation.ROMAJI_EXACT)
    if candidate.romaji_prefix:
        relations.append(EnglishRelation.ROMAJI_PREFIX)
    if candidate.romaji_contains:
        relations.append(EnglishRelation.ROMAJI_CONTAINS)
    return tuple(relations)


def sense_applies(candidate: Candidate, sense: CanonicalSenseEvidence) -> bool:
    displayed_written_form = normalized(candidate.headword)
    displayed_reading_form = normalized(candidate.reading)
    return (
        not sense.restricted_written_forms
        or displayed_written_form in sense.restricted_written_forms
    ) and (
        not sense.restricted_reading_forms
        or displayed_reading_form in sense.restricted_reading_forms
    )


def gloss_matches(
    query: str, candidate: Candidate, raw: RawEntry
) -> tuple[GlossMatch, ...]:
    matches: list[GlossMatch] = []
    for atom in raw.glosses:
        if not sense_applies(candidate, atom.sense):
            continue
        relation = english_relation(query, atom.text)
        if relation is None:
            continue
        lane = (
            EvidenceLane.STRONG_GLOSS
            if relation is not EnglishRelation.GLOSS_TOKEN
            else EvidenceLane.TOKEN_GLOSS
        )
        matches.append(
            GlossMatch(
                key=GlossMatchKey(
                    lane=lane,
                    sense_order=atom.sense.sense_order,
                    relation=relation,
                    gloss_order=atom.gloss_order,
                ),
                relation=relation,
                sense_order=atom.sense.sense_order,
                gloss_order=atom.gloss_order,
                parts_of_speech=atom.sense.parts_of_speech,
                restricted_written_forms=atom.sense.restricted_written_forms,
                restricted_reading_forms=atom.sense.restricted_reading_forms,
            )
        )
    return tuple(sorted(matches, key=lambda match: match.key))


def english_rank_key(
    candidate: Candidate, evidence: EnglishEvidence, fingerprint: str
) -> EnglishRankKey:
    profile = evidence.priority_profile
    return EnglishRankKey(
        lane=evidence.lane,
        corroboration_rank=(
            int(not evidence.corroborated)
            if evidence.lane is not EvidenceLane.ROMAJI_ONLY else 0
        ),
        romaji_specificity_rank=(
            int(evidence.romaji_specificity)
            if evidence.lane is EvidenceLane.ROMAJI_ONLY
            and evidence.romaji_specificity is not None
            else 0
        ),
        sense_order=evidence.sense_order,
        priority_presence_rank=int(not profile.is_marked),
        relation=evidence.relation,
        priority_profile=profile,
        gloss_order=evidence.gloss_order,
        headword_length=len(candidate.headword),
        semantic_fingerprint=fingerprint,
    )


def rank_ascii(
    query: str, candidates: dict[int, Candidate], raw_entries: dict[int, RawEntry]
) -> list[RankedEnglishCandidate]:
    ranked: list[RankedEnglishCandidate] = []
    for identifier, candidate in candidates.items():
        raw = raw_entries[identifier]
        profile = priority_profile(displayed_priority(candidate, raw))
        evidence = EnglishEvidence(
            gloss_matches=gloss_matches(query, candidate, raw),
            romaji_relations=romaji_relations(candidate),
            priority_profiles=(profile,),
        )
        if not evidence.gloss_matches and not evidence.romaji_relations:
            continue
        rank = english_rank_key(candidate, evidence, semantic_fingerprint(candidate, raw))
        ranked.append(RankedEnglishCandidate(rank, candidate, evidence))
    grouped: dict[str, list[RankedEnglishCandidate]] = {}
    for result in ranked:
        grouped.setdefault(result.rank.semantic_fingerprint, []).append(result)
    best_by_semantic_key: dict[str, RankedEnglishCandidate] = {}
    for semantic_key, equivalent in grouped.items():
        selected = min(equivalent, key=lambda result: result.rank)
        representative = replace(
            selected.candidate,
            source_record_id=None,
            romaji_exact=any(result.candidate.romaji_exact for result in equivalent),
            romaji_prefix=any(result.candidate.romaji_prefix for result in equivalent),
            romaji_contains=any(result.candidate.romaji_contains for result in equivalent),
        )
        merged_evidence = EnglishEvidence(
            gloss_matches=tuple(
                sorted(
                    {match for result in equivalent for match in result.evidence.gloss_matches},
                    key=lambda match: match.key,
                )
            ),
            romaji_relations=tuple(
                sorted(
                    {
                        relation
                        for result in equivalent
                        for relation in result.evidence.romaji_relations
                    }
                )
            ),
            priority_profiles=tuple(
                sorted(
                    {
                        profile
                        for result in equivalent
                        for profile in result.evidence.priority_profiles
                    }
                )
            ),
        )
        best_by_semantic_key[semantic_key] = RankedEnglishCandidate(
            english_rank_key(representative, merged_evidence, semantic_key),
            representative,
            merged_evidence,
        )
    return sorted(best_by_semantic_key.values(), key=lambda result: result.rank)


def rank_japanese(
    database: sqlite3.Connection, query: str, raw_entries: dict[int, RawEntry]
) -> list[RankedJapaneseCandidate]:
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
    candidates_by_entry: dict[int, Candidate] = {}
    matches_by_entry: dict[int, list[FormMatch]] = {}
    for row in rows:
        candidate = candidate_from_row(row)
        identifier = row["source_record_id"]
        candidates_by_entry[identifier] = candidate
        exact = row["form"] == query
        prefix = row["form"].startswith(query)
        kind = row["kind"]
        relation = FormRelation(
            (0 if kind == 0 else 1) + (0 if exact else 2 if prefix else 4)
        )
        raw = raw_entries[row["source_record_id"]]
        tags = (
            raw.written_priorities.get(normalized(row["form"]), ())
            if kind == 0
            else raw.reading_priorities.get(normalized(row["form"]), ())
        )
        profile = priority_profile(tags)
        matches_by_entry.setdefault(identifier, []).append(
            FormMatch(
                FormMatchKey(relation, profile, normalized(row["form"])),
                relation,
                profile,
            )
        )
    best_by_entry: dict[int, RankedJapaneseCandidate] = {}
    for identifier, matches in matches_by_entry.items():
        candidate = candidates_by_entry[identifier]
        fingerprint = semantic_fingerprint(candidate, raw_entries[identifier])
        evidence = JapaneseEvidence(tuple(sorted(set(matches), key=lambda match: match.key)))
        selected_form = evidence.selected_form
        best_by_entry[identifier] = RankedJapaneseCandidate(
            JapaneseRankKey(
                relation=selected_form.relation,
                priority_profile=selected_form.priority_profile,
                sense_breadth_rank=-len(json.loads(candidate.senses_json)),
                headword_length=len(candidate.headword),
                semantic_fingerprint=fingerprint,
            ),
            candidate,
            evidence,
        )
    best_by_semantic_key: dict[str, RankedJapaneseCandidate] = {}
    for result in best_by_entry.values():
        semantic_key = result.rank.semantic_fingerprint
        current = best_by_semantic_key.get(semantic_key)
        if current is None:
            best_by_semantic_key[semantic_key] = result
            continue
        merged_evidence = JapaneseEvidence(
            tuple(
                sorted(
                    set(current.evidence.form_matches + result.evidence.form_matches),
                    key=lambda match: match.key,
                )
            )
        )
        selected = min((current, result), key=lambda value: value.rank)
        selected_form = merged_evidence.selected_form
        candidate = replace(selected.candidate, source_record_id=None)
        best_by_semantic_key[semantic_key] = RankedJapaneseCandidate(
            JapaneseRankKey(
                relation=selected_form.relation,
                priority_profile=selected_form.priority_profile,
                sense_breadth_rank=-len(json.loads(candidate.senses_json)),
                headword_length=len(candidate.headword),
                semantic_fingerprint=semantic_key,
            ),
            candidate,
            merged_evidence,
        )
    return sorted(best_by_semantic_key.values(), key=lambda result: result.rank)


def select_ascii(
    database: sqlite3.Connection, query: str, raw_entries: dict[int, RawEntry]
) -> Selection:
    direct = rank_ascii(query, ascii_candidates(database, query), raw_entries)
    has_direct_exact_or_prefix = any(
        result.candidate.romaji_exact
        or result.candidate.romaji_prefix
        or result.evidence.lane is EvidenceLane.STRONG_GLOSS
        for result in direct
    )
    if not has_direct_exact_or_prefix:
        deinflected: list[Selection] = []
        seen: set[str] = set()
        for derived in deinflected_candidates(query):
            ranked = rank_ascii(derived, ascii_candidates(database, derived), raw_entries)
            for result in ranked[:3]:
                candidate = result.candidate
                fingerprint = result.rank.semantic_fingerprint
                if fingerprint not in seen:
                    seen.add(fingerprint)
                    deinflected.append(
                        Selection(
                            candidate,
                            SelectionEvidence(
                                english=result.evidence,
                                deinflected_query=derived,
                            ),
                        )
                    )
        if deinflected:
            return deinflected[0]
    if not direct:
        raise RuntimeError(f"no candidates for {query}")
    selected = direct[0]
    return Selection(
        selected.candidate,
        SelectionEvidence(english=selected.evidence),
    )


def validate_displayed_pair_applicability(
    database: sqlite3.Connection, raw_entries: dict[int, RawEntry]
) -> None:
    identifier = 1_004_690
    row = database.execute(
        """
        SELECT source_record_id, headword, reading, meanings_json,
          parts_of_speech_json, written_forms_json, reading_forms_json, senses_json
        FROM entries WHERE source_record_id = ?
        """,
        (identifier,),
    ).fetchone()
    if row is None:
        raise RuntimeError("displayed-pair applicability fixture entry is missing")
    candidate = candidate_from_row(row)
    raw = raw_entries[identifier]
    restricted_sense = next(
        sense
        for sense in raw.senses
        if sense.restricted_reading_forms == (normalized("このかん"),)
    )
    if sense_applies(candidate, restricted_sense):
        raise RuntimeError("alternate-reading restriction leaked into displayed pair")
    if gloss_matches("meanwhile", candidate, raw):
        raise RuntimeError("restricted gloss matched displayed この間 / このあいだ")
    alternate = replace(candidate, reading="このかん")
    if not sense_applies(alternate, restricted_sense):
        raise RuntimeError("exact displayed reading did not satisfy sense restriction")
    if not gloss_matches("meanwhile", alternate, raw):
        raise RuntimeError("applicable restricted gloss was not retained")


def validate_semantic_non_equivalence() -> None:
    candidate = Candidate(
        source_record_id=None,
        headword="例",
        reading="れい",
        meanings_json='["example"]',
        parts_of_speech_json='["Noun"]',
        written_forms_json='[{"value":"例"}]',
        reading_forms_json='[{"value":"れい"}]',
        senses_json='[{"meaning":"example","partsOfSpeech":["Noun"]}]',
    )
    unrestricted = CanonicalSenseEvidence(0, ("Noun",), (), ())
    restricted = CanonicalSenseEvidence(0, ("Noun",), (), ("れい",))
    unrestricted_raw = RawEntry(
        {}, {}, (unrestricted,), (CanonicalGlossAtom(unrestricted, 0, "example"),)
    )
    restricted_raw = RawEntry(
        {}, {}, (restricted,), (CanonicalGlossAtom(restricted, 0, "example"),)
    )
    split_gloss_raw = RawEntry(
        {},
        {},
        (unrestricted,),
        (
            CanonicalGlossAtom(unrestricted, 0, "example"),
            CanonicalGlossAtom(unrestricted, 1, "instance"),
        ),
    )
    joined_gloss_raw = RawEntry(
        {},
        {},
        (unrestricted,),
        (CanonicalGlossAtom(unrestricted, 0, "example, instance"),),
    )
    if semantic_fingerprint(candidate, unrestricted_raw) == semantic_fingerprint(
        candidate, restricted_raw
    ):
        raise RuntimeError("sense applicability collapsed semantic equivalence")
    if semantic_fingerprint(candidate, split_gloss_raw) == semantic_fingerprint(
        candidate, joined_gloss_raw
    ):
        raise RuntimeError("gloss-atom boundaries collapsed semantic equivalence")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--jmdict", default=PINNED_JMDICT_PATH, type=Path)
    args = parser.parse_args()

    actual_sha256 = file_sha256(args.jmdict)
    if actual_sha256 != PINNED_JMDICT_SHA256:
        raise SystemExit(
            "JMdict checksum mismatch: "
            f"expected {PINNED_JMDICT_SHA256}, got {actual_sha256}"
        )

    database = sqlite3.connect(args.database)
    database.row_factory = sqlite3.Row
    all_ascii_queries = set(ASCII_FIXTURES)
    for query in ASCII_FIXTURES:
        all_ascii_queries.update(deinflected_candidates(query))
    source_ids = source_ids_for_queries(
        database, all_ascii_queries | set(JAPANESE_FIXTURES)
    )
    source_ids.add(1_004_690)
    raw_entries = load_raw_entries(args.jmdict, source_ids)
    validate_displayed_pair_applicability(database, raw_entries)
    validate_semantic_non_equivalence()

    rows = []
    for query, expected in ASCII_FIXTURES.items():
        selection = select_ascii(database, query, raw_entries)
        selected = selection.candidate
        evidence = selection.evidence
        actual = (selected.headword, selected.reading)
        rows.append((query, expected, actual, evidence))
    for query, expected in JAPANESE_FIXTURES.items():
        ranked = rank_japanese(database, query, raw_entries)
        if not ranked:
            raise RuntimeError(f"no candidates for {query}")
        selected_result = ranked[0]
        selected = selected_result.candidate
        evidence = SelectionEvidence(japanese=selected_result.evidence)
        actual = (selected.headword, selected.reading)
        rows.append((query, expected, actual, evidence))

    failures = 0
    output_lines: list[str] = []
    for query, expected, actual, evidence in rows:
        status = "PASS" if expected == actual else "FAIL"
        failures += status == "FAIL"
        output_lines.append(
            json.dumps(
                {
                    "status": status,
                    "query": query,
                    "expected": {"headword": expected[0], "reading": expected[1]},
                    "actual": {"headword": actual[0], "reading": actual[1]},
                    "evidence": evidence.as_json(),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    if failures:
        print("\n".join(output_lines))
        raise SystemExit(f"FAIL {failures}/{len(rows)} fixtures")
    output_lines.append(f"PASS {len(rows)}/{len(rows)} dictionary-ranking fixtures")
    output = "\n".join(output_lines) + "\n"
    output_sha256 = hashlib.sha256(output.encode()).hexdigest()
    if output_sha256 != PINNED_BENCHMARK_STDOUT_SHA256:
        raise RuntimeError(
            "benchmark output drift: "
            f"expected {PINNED_BENCHMARK_STDOUT_SHA256}, got {output_sha256}"
        )
    print(output, end="")


if __name__ == "__main__":
    main()
