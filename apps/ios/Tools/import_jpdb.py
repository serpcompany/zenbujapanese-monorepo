#!/usr/bin/env python3
"""Normalize an owner-authorized JPDB structured snapshot into deterministic SQLite."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import zlib
from html.parser import HTMLParser
from pathlib import Path


ARTIFACT_SCHEMA = "zenbu.jpdb-reference.v2"
VOCABULARY_PATH = re.compile(r"^/vocabulary/(\d+)/([^/]+)(?:/([^/]+))?$")
MEDIA_PATH = re.compile(
    r"^/(anime|novel|visual-novel|web-novel|live-action|video-game)/(\d+)/([^/]+)"
)
KANJI_PATH = re.compile(r"^/kanji/([^/]+)")
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).split())


def observed_response_schema(content_type: str, body: bytes) -> dict[str, object]:
    if "html" not in content_type.lower():
        return {"contentType": content_type}
    text = body.decode("utf-8", errors="replace")
    parser = TreeParser()
    parser.feed(text)
    canonical = next(
        (
            node.attrs.get("href")
            for node in parser.root.descendants()
            if node.tag == "link" and "canonical" in node.attrs.get("rel", "").split()
        ),
        None,
    )
    return {
        "canonicalURL": canonical,
        "contentType": content_type,
        "htmlClasses": sorted(set(re.findall(r'class=["\']([^"\']+)["\']', text))),
        "schema": "jpdb.public-html.v1",
    }


class Node:
    def __init__(self, tag: str, attrs: dict[str, str], parent: "Node | None" = None) -> None:
        self.tag = tag
        self.attrs = attrs
        self.parent = parent
        self.children: list[Node | str] = []

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())

    def text(self, exclude: set[str] | None = None) -> str:
        excluded = exclude or set()
        if self.tag in excluded:
            return ""
        return normalized(
            "".join(child if isinstance(child, str) else child.text(excluded) for child in self.children)
        )

    def descendants(self) -> list["Node"]:
        result: list[Node] = []
        for child in self.children:
            if isinstance(child, Node):
                result.append(child)
                result.extend(child.descendants())
        return result

    def find_class(self, name: str) -> list["Node"]:
        return [node for node in self.descendants() if name in node.classes]


class TreeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document", {})
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, {key: value or "" for key, value in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


def direct_child_texts(node: Node) -> list[str]:
    return [child.text() for child in node.children if isinstance(child, Node) and child.text()]


def ruby_values(node: Node) -> tuple[str, str]:
    spelling = node.text({"rt"})
    reading = "".join(candidate.text() for candidate in node.descendants() if candidate.tag == "rt")
    return normalized(spelling), normalized(reading)


def source_blob(snapshot: Path, digest: str) -> Path:
    return snapshot / "structured" / "sha256" / digest[:2] / digest[2:]


def create_schema(database: sqlite3.Connection) -> None:
    database.executescript(
        "PRAGMA page_size=4096;PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;"
        "PRAGMA locking_mode=EXCLUSIVE;PRAGMA auto_vacuum=NONE;PRAGMA foreign_keys=ON;"
        "CREATE TABLE schema_versions(version INTEGER PRIMARY KEY, schema TEXT UNIQUE NOT NULL);"
        "CREATE TABLE source_resources(id INTEGER PRIMARY KEY, url TEXT UNIQUE NOT NULL, "
        "final_url TEXT NOT NULL, "
        "retrieved_at TEXT NOT NULL, status INTEGER NOT NULL, content_type TEXT NOT NULL, "
        "source_byte_count INTEGER NOT NULL CHECK(source_byte_count>=0), source_sha256 TEXT NOT NULL, "
        "extracted_byte_count INTEGER NOT NULL CHECK(extracted_byte_count>=0), extracted_sha256 TEXT NOT NULL, "
        "extracted_compression TEXT NOT NULL, extraction_schema TEXT NOT NULL);"
        "CREATE TABLE extracted_documents(source_resource_id INTEGER PRIMARY KEY REFERENCES source_resources(id), "
        "route_type TEXT NOT NULL, content_sha256 TEXT NOT NULL, document_json TEXT NOT NULL);"
        "CREATE TABLE vocabulary(id INTEGER PRIMARY KEY, upstream_vid INTEGER UNIQUE NOT NULL, "
        "headword TEXT NOT NULL, primary_reading TEXT NOT NULL DEFAULT '');"
        "CREATE TABLE spellings(vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), "
        "spelling TEXT NOT NULL, reading TEXT NOT NULL DEFAULT '', weight REAL, is_primary INTEGER NOT NULL, "
        "PRIMARY KEY(vocabulary_id,spelling,reading));"
        "CREATE INDEX spellings_text ON spellings(spelling,reading);"
        "CREATE TABLE readings(vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), reading TEXT NOT NULL, "
        "is_primary INTEGER NOT NULL, PRIMARY KEY(vocabulary_id,reading));"
        "CREATE TABLE meanings(vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), ordinal INTEGER NOT NULL, "
        "meaning TEXT NOT NULL, PRIMARY KEY(vocabulary_id,ordinal));"
        "CREATE TABLE meaning_parts_of_speech(vocabulary_id INTEGER NOT NULL, meaning_ordinal INTEGER NOT NULL, "
        "part_of_speech TEXT NOT NULL, PRIMARY KEY(vocabulary_id,meaning_ordinal,part_of_speech), "
        "FOREIGN KEY(vocabulary_id,meaning_ordinal) REFERENCES meanings(vocabulary_id,ordinal));"
        "CREATE TABLE pronunciations(vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), "
        "kind TEXT NOT NULL, value TEXT NOT NULL, audio_path TEXT, "
        "PRIMARY KEY(vocabulary_id,kind,value));"
        "CREATE TABLE frequencies(vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), corpus TEXT NOT NULL, "
        "rank INTEGER NOT NULL CHECK(rank>0), rank_semantics TEXT NOT NULL, display_text TEXT NOT NULL, "
        "PRIMARY KEY(vocabulary_id,corpus));"
        "CREATE INDEX frequencies_rank ON frequencies(corpus,rank,vocabulary_id);"
        "CREATE TABLE kanji(character TEXT PRIMARY KEY, meaning TEXT NOT NULL DEFAULT '', "
        "keyword TEXT NOT NULL DEFAULT '', mnemonic TEXT NOT NULL DEFAULT '');"
        "CREATE TABLE kanji_readings(character TEXT NOT NULL REFERENCES kanji(character), reading TEXT NOT NULL, "
        "source_url TEXT, frequency_percent REAL, used_in_total INTEGER, PRIMARY KEY(character,reading));"
        "CREATE TABLE kanji_reading_vocabulary(character TEXT NOT NULL, reading TEXT NOT NULL, "
        "position INTEGER NOT NULL, upstream_vid INTEGER NOT NULL, vocabulary_id INTEGER REFERENCES vocabulary(id), "
        "spelling TEXT NOT NULL, vocabulary_reading TEXT NOT NULL, meaning TEXT NOT NULL, detail_url TEXT NOT NULL, "
        "PRIMARY KEY(character,reading,position), "
        "FOREIGN KEY(character,reading) REFERENCES kanji_readings(character,reading));"
        "CREATE TABLE kanji_attributes(character TEXT NOT NULL REFERENCES kanji(character), ordinal INTEGER NOT NULL, "
        "name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(character,ordinal));"
        "CREATE TABLE kanji_components(character TEXT NOT NULL REFERENCES kanji(character), "
        "component TEXT NOT NULL REFERENCES kanji(character), PRIMARY KEY(character,component));"
        "CREATE TABLE example_sentences(id INTEGER PRIMARY KEY, japanese TEXT NOT NULL, english TEXT NOT NULL DEFAULT '', "
        "audio_path TEXT, UNIQUE(japanese,english));"
        "CREATE TABLE vocabulary_examples(vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), "
        "example_id INTEGER NOT NULL REFERENCES example_sentences(id), ordinal INTEGER NOT NULL, "
        "PRIMARY KEY(vocabulary_id,example_id));"
        "CREATE TABLE media(id INTEGER PRIMARY KEY, category TEXT NOT NULL, upstream_id INTEGER NOT NULL, "
        "slug TEXT NOT NULL, title TEXT NOT NULL, url TEXT UNIQUE NOT NULL, UNIQUE(category,upstream_id));"
        "CREATE TABLE decks(id INTEGER PRIMARY KEY, media_id INTEGER REFERENCES media(id), name TEXT NOT NULL, "
        "url TEXT UNIQUE NOT NULL);"
        "CREATE TABLE media_metrics(media_id INTEGER NOT NULL REFERENCES media(id), ordinal INTEGER NOT NULL, "
        "name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(media_id,ordinal));"
        "CREATE TABLE deck_metrics(deck_id INTEGER NOT NULL REFERENCES decks(id), ordinal INTEGER NOT NULL, "
        "name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(deck_id,ordinal));"
        "CREATE TABLE deck_vocabulary(deck_id INTEGER NOT NULL REFERENCES decks(id), position INTEGER NOT NULL, "
        "upstream_vid INTEGER NOT NULL, vocabulary_id INTEGER REFERENCES vocabulary(id), occurrences INTEGER, "
        "spelling TEXT NOT NULL DEFAULT '', reading TEXT NOT NULL DEFAULT '', meanings_json TEXT NOT NULL DEFAULT '[]', "
        "tags_json TEXT NOT NULL DEFAULT '[]', frequencies_json TEXT NOT NULL DEFAULT '[]', "
        "numeric_evidence_json TEXT NOT NULL DEFAULT '[]', "
        "PRIMARY KEY(deck_id,position));"
        "CREATE TABLE vocabulary_relations(source_vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), "
        "target_vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), relation TEXT NOT NULL, "
        "PRIMARY KEY(source_vocabulary_id,target_vocabulary_id,relation));"
        "CREATE TABLE upstream_identifiers(entity_type TEXT NOT NULL, entity_key TEXT NOT NULL, "
        "namespace TEXT NOT NULL, upstream_id TEXT NOT NULL, "
        "PRIMARY KEY(entity_type,entity_key,namespace));"
        "CREATE TABLE zenbu_mappings(vocabulary_id INTEGER PRIMARY KEY REFERENCES vocabulary(id), "
        "zenbu_entry_id BLOB, status TEXT NOT NULL CHECK(status IN ('mapped','ambiguous','unmapped')), "
        "candidate_count INTEGER NOT NULL);"
        "CREATE TABLE field_provenance(entity_type TEXT NOT NULL, entity_key TEXT NOT NULL, field_name TEXT NOT NULL, "
        "source_resource_id INTEGER NOT NULL REFERENCES source_resources(id), source_locator TEXT NOT NULL, "
        "PRIMARY KEY(entity_type,entity_key,field_name,source_resource_id,source_locator));"
        "CREATE TABLE conflicts(entity_type TEXT NOT NULL, entity_key TEXT NOT NULL, field_name TEXT NOT NULL, "
        "values_json TEXT NOT NULL, PRIMARY KEY(entity_type,entity_key,field_name));"
        "CREATE TABLE validation_issues(source_resource_id INTEGER NOT NULL REFERENCES source_resources(id), "
        "kind TEXT NOT NULL, detail TEXT NOT NULL, PRIMARY KEY(source_resource_id,kind,detail));"
        "CREATE TABLE vocabulary_usage_summary(vocabulary_id INTEGER PRIMARY KEY REFERENCES vocabulary(id), "
        "used_in_media_count INTEGER);"
        "CREATE TABLE vocabulary_media_appearances(vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id), "
        "category TEXT NOT NULL, media_upstream_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, "
        "used_times INTEGER, media_url TEXT NOT NULL, PRIMARY KEY(vocabulary_id,category,media_upstream_id));"
        "CREATE TABLE kanji_relations(character TEXT NOT NULL REFERENCES kanji(character), relation TEXT NOT NULL, "
        "target_key TEXT NOT NULL, detail_json TEXT NOT NULL, PRIMARY KEY(character,relation,target_key));"
        "CREATE TABLE source_external_links(source_resource_id INTEGER NOT NULL REFERENCES source_resources(id), "
        "ordinal INTEGER NOT NULL, text TEXT NOT NULL, url TEXT NOT NULL, PRIMARY KEY(source_resource_id,ordinal));"
        "CREATE TABLE source_images(source_resource_id INTEGER NOT NULL REFERENCES source_resources(id), "
        "ordinal INTEGER NOT NULL, url TEXT NOT NULL, alt TEXT NOT NULL, title TEXT NOT NULL, "
        "PRIMARY KEY(source_resource_id,ordinal));"
        "CREATE TABLE unparsed_evidence(source_resource_id INTEGER NOT NULL REFERENCES source_resources(id), "
        "ordinal INTEGER NOT NULL, label TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(source_resource_id,ordinal));"
        "CREATE TABLE source_licenses(id INTEGER PRIMARY KEY, source_name TEXT NOT NULL, authorization_sha256 TEXT NOT NULL, "
        "scope TEXT NOT NULL, redistribution_allowed INTEGER NOT NULL, note TEXT NOT NULL);"
    )
    database.execute("INSERT INTO schema_versions VALUES (1,?)", (ARTIFACT_SCHEMA,))


def provenance(
    database: sqlite3.Connection,
    entity_type: str,
    entity_key: str,
    field: str,
    resource_id: int,
    locator: str,
) -> None:
    database.execute(
        "INSERT OR IGNORE INTO field_provenance VALUES (?,?,?,?,?)",
        (entity_type, entity_key, field, resource_id, locator),
    )


def preserve_field_provenance(
    database: sqlite3.Connection,
    resource_id: int,
    document: dict[str, object],
) -> None:
    """Pin one canonical source document; normalized records add bounded locators.

    The canonical JSON is already stored once in ``extracted_documents`` and linked
    to ``source_resources``. Expanding every JSON leaf here would multiply large
    listing pages into billions of provenance rows without adding traceability.
    """
    entity_key = str(document.get("contentSHA256", resource_id))
    provenance(
        database,
        "extracted_document",
        entity_key,
        "canonical-document",
        resource_id,
        "$",
    )


def structured_field_provenance(
    database: sqlite3.Connection,
    resource_id: int,
    entity_type: str,
    entity_key: str,
    root: str,
    value: dict[str, object],
    fields: tuple[str, ...],
) -> None:
    """Record a bounded pointer for each normalized semantic field group."""
    for field in fields:
        if field in value:
            provenance(
                database,
                entity_type,
                entity_key,
                field,
                resource_id,
                f"$.{root}.{field}",
            )


def insert_vocabulary(
    database: sqlite3.Connection, resource_id: int, url: str, root: Node
) -> int | None:
    match = VOCABULARY_PATH.match(urllib.parse.urlsplit(url).path)
    if not match:
        return None
    vid = int(match.group(1))
    primary = root.find_class("primary-spelling")
    if not primary:
        return None
    rubies = [node for node in primary[0].descendants() if node.tag == "ruby"]
    headword, reading = ruby_values(rubies[0]) if rubies else (primary[0].text(), "")
    if not headword:
        return None
    prior = database.execute("SELECT id,headword,primary_reading FROM vocabulary WHERE upstream_vid=?", (vid,)).fetchone()
    if prior and (prior[1], prior[2]) != (headword, reading):
        database.execute(
            "INSERT OR REPLACE INTO conflicts VALUES ('vocabulary',?,'headword',?)",
            (str(vid), canonical_json(sorted({prior[1], headword}))),
        )
    database.execute(
        "INSERT OR IGNORE INTO vocabulary(upstream_vid,headword,primary_reading) VALUES (?,?,?)",
        (vid, headword, reading),
    )
    vocabulary_id = int(database.execute("SELECT id FROM vocabulary WHERE upstream_vid=?", (vid,)).fetchone()[0])
    key = str(vid)
    database.execute(
        "INSERT OR IGNORE INTO upstream_identifiers VALUES ('vocabulary',?,'jpdb.vid',?)",
        (key, key),
    )
    database.execute(
        "INSERT OR IGNORE INTO spellings VALUES (?,?,?,?,1)",
        (vocabulary_id, headword, reading, None),
    )
    if reading:
        database.execute("INSERT OR IGNORE INTO readings VALUES (?,?,1)", (vocabulary_id, reading))
    provenance(database, "vocabulary", key, "headword", resource_id, ".primary-spelling")
    provenance(database, "vocabulary", key, "primary_reading", resource_id, ".primary-spelling rt")
    provenance(database, "vocabulary", key, "upstream_vid", resource_id, urllib.parse.urlsplit(url).path)

    for alternate in root.find_class("alt-spelling"):
        links = [node for node in alternate.descendants() if node.tag == "a"]
        rubies = [node for node in alternate.descendants() if node.tag == "ruby"]
        if not rubies:
            continue
        spelling, alt_reading = ruby_values(rubies[0])
        weight_match = re.search(r"(\d+(?:\.\d+)?)%", alternate.text())
        weight = float(weight_match.group(1)) / 100.0 if weight_match else None
        if spelling:
            database.execute(
                "INSERT OR IGNORE INTO spellings VALUES (?,?,?,?,0)",
                (vocabulary_id, spelling, alt_reading, weight),
            )
            provenance(database, "spelling", f"{vid}:{spelling}:{alt_reading}", "value", resource_id, links[0].attrs.get("href", ".alt-spelling") if links else ".alt-spelling")
            provenance(database, "spelling", f"{vid}:{spelling}:{alt_reading}", "reading", resource_id, ".alt-spelling rt")
            if weight is not None:
                provenance(database, "spelling", f"{vid}:{spelling}:{alt_reading}", "weight", resource_id, ".alt-spelling .property-text")

    meanings = root.find_class("subsection-meanings")
    if meanings:
        sequence = [
            node for node in meanings[0].descendants()
            if "part-of-speech" in node.classes or "description" in node.classes
        ]
        parts: list[str] = []
        ordinal = 0
        for node in sequence:
            if "part-of-speech" in node.classes:
                parts = direct_child_texts(node) or ([node.text()] if node.text() else [])
            elif "description" in node.classes and node.text():
                meaning = re.sub(r"^\d+\.\s*", "", node.text())
                database.execute("INSERT OR IGNORE INTO meanings VALUES (?,?,?)", (vocabulary_id, ordinal, meaning))
                for part in parts:
                    database.execute(
                        "INSERT OR IGNORE INTO meaning_parts_of_speech VALUES (?,?,?)",
                        (vocabulary_id, ordinal, part),
                    )
                    provenance(database, "meaning", f"{vid}:{ordinal}", "part_of_speech", resource_id, ".part-of-speech")
                provenance(database, "meaning", f"{vid}:{ordinal}", "meaning", resource_id, ".description")
                ordinal += 1

    for tag in root.find_class("tag"):
        top = re.search(r"\bTop\s+(\d+)", tag.text(), re.IGNORECASE)
        if top:
            database.execute(
                "INSERT OR REPLACE INTO frequencies VALUES (?,?,?,?,?)",
                (vocabulary_id, "global", int(top.group(1)), "top-band-upper-bound", f"Top {top.group(1)}"),
            )
            provenance(database, "frequency", f"{vid}:global", "rank", resource_id, ".tag")
        tooltip = tag.attrs.get("data-tooltip", "")
        for corpus, rank in re.findall(r"([^:;]+):(?:&nbsp;|\s)*(\d+)", tooltip):
            database.execute(
                "INSERT OR REPLACE INTO frequencies VALUES (?,?,?,?,?)",
                (vocabulary_id, normalized(corpus), int(rank), "top-band-upper-bound", f"Top {rank}"),
            )
            provenance(database, "frequency", f"{vid}:{normalized(corpus)}", "rank", resource_id, ".tag[data-tooltip]")

    pitch = root.find_class("subsection-pitch-accent")
    if pitch:
        pattern: list[dict[str, str]] = []
        for node in pitch[0].descendants():
            style = node.attrs.get("style", "")
            level = "low" if "pitch-low" in style else "high" if "pitch-high" in style else ""
            if level:
                segments = direct_child_texts(node)
                if segments:
                    pattern.append({"text": segments[0], "level": level})
        value = canonical_json(pattern) if pattern else pitch[0].text()
        audio = next((node.attrs.get("data-audio") for node in pitch[0].descendants() if node.attrs.get("data-audio")), None)
        if value:
            database.execute(
                "INSERT OR IGNORE INTO pronunciations VALUES (?,?,?,?)",
                (vocabulary_id, "pitch-accent", value, audio),
            )
            provenance(database, "pronunciation", f"{vid}:pitch-accent", "value", resource_id, ".subsection-pitch-accent")
            if audio:
                provenance(database, "pronunciation", f"{vid}:pitch-accent", "audio_path", resource_id, "[data-audio]")

    examples = root.find_class("subsection-examples")
    if examples:
        ordinal = 0
        for example in examples[0].find_class("used-in"):
            japanese = example.find_class("jp")
            english = example.find_class("en")
            if not japanese:
                continue
            audio = next(
                (node.attrs.get("data-audio") for node in (example.parent.descendants() if example.parent else []) if node.attrs.get("data-audio")),
                None,
            )
            database.execute(
                "INSERT OR IGNORE INTO example_sentences(japanese,english,audio_path) VALUES (?,?,?)",
                (japanese[0].text(), english[0].text() if english else "", audio),
            )
            example_id = int(database.execute(
                "SELECT id FROM example_sentences WHERE japanese=? AND english=?",
                (japanese[0].text(), english[0].text() if english else ""),
            ).fetchone()[0])
            database.execute(
                "INSERT OR IGNORE INTO vocabulary_examples VALUES (?,?,?)",
                (vocabulary_id, example_id, ordinal),
            )
            provenance(database, "example", str(example_id), "japanese", resource_id, ".subsection-examples .jp")
            if english:
                provenance(database, "example", str(example_id), "english", resource_id, ".subsection-examples .en")
            if audio:
                provenance(database, "example", str(example_id), "audio_path", resource_id, ".example-audio[data-audio]")
            ordinal += 1
    return vocabulary_id


def insert_media_and_appearances(
    database: sqlite3.Connection, resource_id: int, url: str, root: Node
) -> None:
    match = MEDIA_PATH.match(urllib.parse.urlsplit(url).path)
    if not match:
        return
    category, upstream_id, slug = match.group(1), int(match.group(2)), match.group(3)
    heading = next((node.text() for node in root.descendants() if node.tag in ("h1", "h2", "h3", "h4") and node.text()), slug)
    base_url = f"{urllib.parse.urlsplit(url).scheme}://{urllib.parse.urlsplit(url).netloc}/{category}/{upstream_id}/{slug}"
    database.execute(
        "INSERT OR IGNORE INTO media(category,upstream_id,slug,title,url) VALUES (?,?,?,?,?)",
        (category, upstream_id, slug, heading, base_url),
    )
    media_id = int(database.execute("SELECT id FROM media WHERE category=? AND upstream_id=?", (category, upstream_id)).fetchone()[0])
    deck_url = base_url + "/vocabulary-list"
    database.execute("INSERT OR IGNORE INTO decks(media_id,name,url) VALUES (?,?,?)", (media_id, heading, deck_url))
    deck_id = int(database.execute("SELECT id FROM decks WHERE url=?", (deck_url,)).fetchone()[0])
    database.execute(
        "INSERT OR IGNORE INTO upstream_identifiers VALUES ('media',?,'jpdb.media',?)",
        (f"{category}:{upstream_id}", f"{category}:{upstream_id}"),
    )
    provenance(database, "media", f"{category}:{upstream_id}", "title", resource_id, "heading")
    for field in ("category", "upstream_id", "slug", "url"):
        provenance(database, "media", f"{category}:{upstream_id}", field, resource_id, urllib.parse.urlsplit(url).path)
    provenance(database, "deck", str(deck_id), "name", resource_id, "heading")
    provenance(database, "deck", str(deck_id), "url", resource_id, urllib.parse.urlsplit(url).path)
    for link in (node for node in root.descendants() if node.tag == "a"):
        target = urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path
        vocabulary = VOCABULARY_PATH.match(target)
        if not vocabulary:
            continue
        row = database.execute("SELECT id FROM vocabulary WHERE upstream_vid=?", (int(vocabulary.group(1)),)).fetchone()
        if row:
            nearby = link.parent.text() if link.parent else link.text()
            number = re.search(r"(?:Used times\s*)?(\d+)\s*$", nearby)
            database.execute(
                "INSERT OR REPLACE INTO deck_vocabulary VALUES (?,?,?)",
                (deck_id, int(row[0]), int(number.group(1)) if number else None),
            )
            provenance(database, "deck_vocabulary", f"{deck_id}:{int(row[0])}", "occurrences", resource_id, link.attrs.get("href", ""))


def insert_vocabulary_relations(database: sqlite3.Connection, resource_id: int, url: str, root: Node) -> None:
    match = VOCABULARY_PATH.match(urllib.parse.urlsplit(url).path)
    if not match:
        return
    source = database.execute("SELECT id FROM vocabulary WHERE upstream_vid=?", (int(match.group(1)),)).fetchone()
    sections = root.find_class("subsection-used-in")
    if not source or not sections:
        return
    for link in (node for node in sections[0].descendants() if node.tag == "a"):
        target_match = VOCABULARY_PATH.match(
            urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path
        )
        if not target_match:
            continue
        target = database.execute("SELECT id FROM vocabulary WHERE upstream_vid=?", (int(target_match.group(1)),)).fetchone()
        if target and target[0] != source[0]:
            database.execute(
                "INSERT OR IGNORE INTO vocabulary_relations VALUES (?,?,'used-in-vocabulary')",
                (int(source[0]), int(target[0])),
            )
            provenance(database, "vocabulary_relation", f"{int(source[0])}:{int(target[0])}", "relation", resource_id, link.attrs.get("href", ""))


def insert_kanji(database: sqlite3.Connection, resource_id: int, url: str, root: Node) -> None:
    match = KANJI_PATH.match(urllib.parse.urlsplit(url).path)
    if not match:
        return
    character = urllib.parse.unquote(match.group(1))
    meaning_nodes = root.find_class("description")
    meaning = meaning_nodes[0].text() if meaning_nodes else ""
    database.execute("INSERT OR IGNORE INTO kanji(character,meaning) VALUES (?,?)", (character, meaning))
    database.execute(
        "INSERT OR IGNORE INTO upstream_identifiers VALUES ('kanji',?,'jpdb.kanji',?)",
        (character, character),
    )
    provenance(database, "kanji", character, "meaning", resource_id, ".description")
    provenance(database, "kanji", character, "character", resource_id, urllib.parse.urlsplit(url).path)
    component_sections = [
        section for section in root.find_class("subsection-composed-of-kanji")
        if any(label.text() == "Composed of" for label in section.find_class("subsection-label"))
    ]
    for link in (
        node for section in component_sections for node in section.descendants() if node.tag == "a"
    ):
        component = KANJI_PATH.match(urllib.parse.urlsplit(link.attrs.get("href", "")).path)
        if component:
            value = urllib.parse.unquote(component.group(1))
            database.execute("INSERT OR IGNORE INTO kanji(character,meaning) VALUES (?,'')", (value,))
            if value != character:
                database.execute("INSERT OR IGNORE INTO kanji_components VALUES (?,?)", (character, value))
                provenance(database, "kanji_component", f"{character}:{value}", "component", resource_id, link.attrs.get("href", ""))


def insert_structured_evidence(
    database: sqlite3.Connection, resource_id: int, document: dict[str, object]
) -> None:
    evidence = dict(document.get("evidence") or {})
    for ordinal, link in enumerate(evidence.get("externalLinks") or []):
        database.execute(
            "INSERT OR IGNORE INTO source_external_links VALUES (?,?,?,?)",
            (resource_id, ordinal, str(link.get("text", "")), str(link.get("url", ""))),
        )
    for ordinal, image in enumerate(evidence.get("images") or []):
        database.execute(
            "INSERT OR IGNORE INTO source_images VALUES (?,?,?,?,?)",
            (
                resource_id,
                ordinal,
                str(image.get("url", "")),
                str(image.get("alt", "")),
                str(image.get("title", "")),
            ),
        )
    for ordinal, item in enumerate(document.get("unparsedEvidence") or []):
        database.execute(
            "INSERT OR IGNORE INTO unparsed_evidence VALUES (?,?,?,?)",
            (resource_id, ordinal, str(item.get("label", "")), str(item.get("text", ""))),
        )


def insert_structured_vocabulary(
    database: sqlite3.Connection, resource_id: int, document: dict[str, object]
) -> None:
    value = dict(document.get("vocabulary") or {})
    vid = int(value["vid"])
    forms = list(value.get("forms") or [])
    primary = next((form for form in forms if form.get("primary")), forms[0] if forms else {})
    headword = str(primary.get("spelling") or value.get("routeSpelling") or "")
    reading = str(primary.get("reading") or value.get("routeReading") or "")
    if not headword:
        database.execute(
            "INSERT OR IGNORE INTO validation_issues VALUES (?,?,?)",
            (resource_id, "malformed-vocabulary", "structured vocabulary has no primary spelling"),
        )
        return
    prior_vocabulary = database.execute(
        "SELECT headword,primary_reading FROM vocabulary WHERE upstream_vid=?", (vid,)
    ).fetchone()
    if prior_vocabulary and tuple(map(str, prior_vocabulary)) != (headword, reading):
        database.execute(
            "INSERT OR REPLACE INTO conflicts VALUES ('vocabulary',?,'identity',?)",
            (
                str(vid),
                canonical_json(
                    {
                        "existing": {
                            "headword": str(prior_vocabulary[0]),
                            "primaryReading": str(prior_vocabulary[1]),
                        },
                        "observed": {"headword": headword, "primaryReading": reading},
                    }
                ),
            ),
        )
    database.execute(
        "INSERT OR IGNORE INTO vocabulary(upstream_vid,headword,primary_reading) VALUES (?,?,?)",
        (vid, headword, reading),
    )
    vocabulary_id = int(
        database.execute("SELECT id FROM vocabulary WHERE upstream_vid=?", (vid,)).fetchone()[0]
    )
    database.execute(
        "INSERT OR IGNORE INTO upstream_identifiers VALUES ('vocabulary',?,'jpdb.vid',?)",
        (str(vid), str(vid)),
    )
    for form in forms:
        spelling = str(form.get("spelling", ""))
        form_reading = str(form.get("reading", ""))
        if not spelling:
            continue
        database.execute(
            "INSERT OR IGNORE INTO spellings VALUES (?,?,?,?,?)",
            (
                vocabulary_id,
                spelling,
                form_reading,
                form.get("weight"),
                int(bool(form.get("primary"))),
            ),
        )
        if form_reading:
            database.execute(
                "INSERT OR IGNORE INTO readings VALUES (?,?,?)",
                (vocabulary_id, form_reading, int(bool(form.get("primary")))),
            )
    for meaning in value.get("meanings") or []:
        ordinal = int(meaning.get("ordinal", 0))
        text = str(meaning.get("text", ""))
        if not text:
            continue
        database.execute("INSERT OR IGNORE INTO meanings VALUES (?,?,?)", (vocabulary_id, ordinal, text))
        for part in meaning.get("partsOfSpeech") or []:
            database.execute(
                "INSERT OR IGNORE INTO meaning_parts_of_speech VALUES (?,?,?)",
                (vocabulary_id, ordinal, str(part)),
            )
    for frequency in value.get("frequencies") or []:
        corpus = str(frequency.get("corpus", ""))
        observed_rank = int(frequency["rank"])
        prior_frequency = database.execute(
            "SELECT rank,rank_semantics,display_text FROM frequencies "
            "WHERE vocabulary_id=? AND corpus=?",
            (vocabulary_id, corpus),
        ).fetchone()
        observed_frequency = (
            observed_rank,
            str(frequency.get("rankSemantics", "top-band-upper-bound")),
            str(frequency.get("display", f"Top {observed_rank}")),
        )
        if prior_frequency and tuple(prior_frequency) != observed_frequency:
            database.execute(
                "INSERT OR REPLACE INTO conflicts VALUES ('frequency',?,'rank',?)",
                (
                    f"{vid}:{corpus}",
                    canonical_json(
                        {"existing": list(prior_frequency), "observed": list(observed_frequency)}
                    ),
                ),
            )
        database.execute(
            "INSERT OR REPLACE INTO frequencies VALUES (?,?,?,?,?)",
            (
                vocabulary_id,
                corpus,
                *observed_frequency,
            ),
        )
    pitch = list(value.get("pitchAccent") or [])
    if pitch:
        database.execute(
            "INSERT OR IGNORE INTO pronunciations VALUES (?,?,?,NULL)",
            (vocabulary_id, "pitch-accent", canonical_json(pitch)),
        )
    for audio in value.get("pronunciationAudioPaths") or []:
        database.execute(
            "INSERT OR IGNORE INTO pronunciations VALUES (?,?,?,?)",
            (vocabulary_id, "audio", str(audio), str(audio)),
        )
    for ordinal, example in enumerate(value.get("examples") or []):
        japanese = str(example.get("japanese", ""))
        english = str(example.get("english", ""))
        if not japanese:
            continue
        database.execute(
            "INSERT OR IGNORE INTO example_sentences(japanese,english,audio_path) VALUES (?,?,?)",
            (japanese, english, example.get("audioPath")),
        )
        example_id = int(
            database.execute(
                "SELECT id FROM example_sentences WHERE japanese=? AND english=?", (japanese, english)
            ).fetchone()[0]
        )
        database.execute(
            "INSERT OR IGNORE INTO vocabulary_examples VALUES (?,?,?)",
            (vocabulary_id, example_id, ordinal),
        )
    if value.get("usedInMediaCount") is not None:
        database.execute(
            "INSERT OR REPLACE INTO vocabulary_usage_summary VALUES (?,?)",
            (vocabulary_id, int(value["usedInMediaCount"])),
        )
    provenance(database, "vocabulary", str(vid), "structured-record", resource_id, "$.vocabulary")
    structured_field_provenance(
        database,
        resource_id,
        "vocabulary",
        str(vid),
        "vocabulary",
        value,
        (
            "routeSpelling", "routeReading", "forms", "meanings", "frequencies", "pitchAccent",
            "pronunciationAudioPaths", "examples", "relations", "usedInMediaCount",
        ),
    )


def insert_structured_kanji(
    database: sqlite3.Connection, resource_id: int, document: dict[str, object]
) -> None:
    value = dict(document.get("kanji") or {})
    character = str(value.get("character", ""))
    if not character:
        return
    meanings = [str(item) for item in value.get("meanings") or []]
    observed_kanji = (
        "; ".join(meanings),
        str(value.get("keyword", "")),
        str(value.get("mnemonic", "")),
    )
    prior_kanji = database.execute(
        "SELECT meaning,keyword,mnemonic FROM kanji WHERE character=?", (character,)
    ).fetchone()
    if prior_kanji and tuple(prior_kanji) != observed_kanji:
        database.execute(
            "INSERT OR REPLACE INTO conflicts VALUES ('kanji',?,'identity',?)",
            (
                character,
                canonical_json({"existing": list(prior_kanji), "observed": list(observed_kanji)}),
            ),
        )
    database.execute(
        "INSERT OR REPLACE INTO kanji(character,meaning,keyword,mnemonic) VALUES (?,?,?,?)",
        (character, *observed_kanji),
    )
    database.execute(
        "INSERT OR IGNORE INTO upstream_identifiers VALUES ('kanji',?,'jpdb.kanji',?)",
        (character, character),
    )
    for reading in value.get("readings") or []:
        database.execute(
            "INSERT OR IGNORE INTO kanji_readings VALUES (?,?,?,NULL,NULL)",
            (character, str(reading.get("value", "")), reading.get("url")),
        )
    for ordinal, attribute in enumerate(value.get("attributes") or []):
        database.execute(
            "INSERT OR IGNORE INTO kanji_attributes VALUES (?,?,?,?)",
            (character, ordinal, str(attribute.get("name", "")), str(attribute.get("value", ""))),
        )
    for component in value.get("components") or []:
        target = str(component.get("character", ""))
        if not target or target == character:
            continue
        database.execute(
            "INSERT OR IGNORE INTO kanji(character,meaning) VALUES (?,'')", (target,)
        )
        database.execute(
            "INSERT OR IGNORE INTO kanji_components VALUES (?,?)", (character, target)
        )
        database.execute(
            "INSERT OR IGNORE INTO kanji_relations VALUES (?,?,?,?)",
            (character, "component", target, canonical_json(component)),
        )
    for target in value.get("usedInKanji") or []:
        database.execute(
            "INSERT OR IGNORE INTO kanji_relations VALUES (?,?,?,?)",
            (character, "used-in-kanji", str(target), canonical_json({"character": target})),
        )
    for target in value.get("usedInVocabulary") or []:
        database.execute(
            "INSERT OR IGNORE INTO kanji_relations VALUES (?,?,?,?)",
            (character, "used-in-vocabulary", str(target.get("vid", "")), canonical_json(target)),
        )
    provenance(database, "kanji", character, "structured-record", resource_id, "$.kanji")
    structured_field_provenance(
        database,
        resource_id,
        "kanji",
        character,
        "kanji",
        value,
        ("meanings", "keyword", "mnemonic", "readings", "attributes", "components", "usedInKanji", "usedInVocabulary"),
    )


def insert_structured_kanji_reading(
    database: sqlite3.Connection, resource_id: int, document: dict[str, object]
) -> None:
    value = dict(document.get("kanjiReading") or {})
    character = str(value.get("character", ""))
    reading = str(value.get("reading", ""))
    if not character or not reading:
        return
    database.execute(
        "INSERT OR IGNORE INTO kanji(character,meaning) VALUES (?,'')", (character,)
    )
    database.execute(
        "INSERT OR REPLACE INTO kanji_readings VALUES (?,?,?,?,?)",
        (
            character,
            reading,
            str(document.get("sourceURL", "")),
            value.get("frequencyPercent"),
            value.get("usedInTotal"),
        ),
    )
    for item in value.get("vocabulary") or []:
        vid = int(item["vid"])
        row = database.execute("SELECT id FROM vocabulary WHERE upstream_vid=?", (vid,)).fetchone()
        database.execute(
            "INSERT OR REPLACE INTO kanji_reading_vocabulary VALUES (?,?,?,?,?,?,?,?,?)",
            (
                character,
                reading,
                int(item["position"]),
                vid,
                int(row[0]) if row else None,
                str(item.get("spelling", "")),
                str(item.get("reading", "")),
                str(item.get("meaning", "")),
                str(item.get("detailURL", "")),
            ),
        )
    provenance(
        database,
        "kanji_reading",
        f"{character}:{reading}",
        "structured-record",
        resource_id,
        "$.kanjiReading",
    )
    structured_field_provenance(
        database,
        resource_id,
        "kanji_reading",
        f"{character}:{reading}",
        "kanjiReading",
        value,
        ("character", "reading", "frequencyPercent", "usedInTotal", "vocabulary"),
    )


def ensure_structured_media(
    database: sqlite3.Connection, category: str, upstream_id: int, slug: str, title: str, url: str
) -> int:
    observed = (slug, title or slug, url)
    prior = database.execute(
        "SELECT slug,title,url FROM media WHERE category=? AND upstream_id=?",
        (category, upstream_id),
    ).fetchone()
    conflicts = bool(
        prior
        and (
            str(prior[0]) != slug
            or str(prior[2]) != url
            or (bool(title) and str(prior[1]) != title)
        )
    )
    if conflicts:
        database.execute(
            "INSERT OR REPLACE INTO conflicts VALUES ('media',?,'identity',?)",
            (
                f"{category}:{upstream_id}",
                canonical_json({"existing": list(prior), "observed": list(observed)}),
            ),
        )
    database.execute(
        "INSERT OR IGNORE INTO media(category,upstream_id,slug,title,url) VALUES (?,?,?,?,?)",
        (category, upstream_id, *observed),
    )
    return int(
        database.execute(
            "SELECT id FROM media WHERE category=? AND upstream_id=?", (category, upstream_id)
        ).fetchone()[0]
    )


def insert_structured_media(
    database: sqlite3.Connection, resource_id: int, document: dict[str, object]
) -> None:
    route_type = str(document.get("routeType", ""))
    if route_type == "media-stats":
        media = dict(document.get("media") or {})
        category, upstream_id, slug = str(media["category"]), int(media["id"]), str(media["slug"])
        base_url = f"https://jpdb.io/{category}/{upstream_id}/{slug}"
        media_id = ensure_structured_media(
            database, category, upstream_id, slug, str(media.get("title", "")), base_url
        )
        metrics: list[tuple[str, str]] = []
        statistics = dict(document.get("statistics") or {})
        metrics.extend(
            (f"coverage.{item['percent']}", str(item["vocabularyRequired"]))
            for item in statistics.get("coverage") or []
        )
        metrics.extend(
            (f"difficulty.{item['level']}", str(item["percent"]))
            for item in statistics.get("difficultyHistogram") or []
        )
        existing = int(
            database.execute(
                "SELECT count(*) FROM media_metrics WHERE media_id=?", (media_id,)
            ).fetchone()[0]
        )
        for offset, (name, value) in enumerate(metrics):
            database.execute(
                "INSERT OR IGNORE INTO media_metrics VALUES (?,?,?,?)",
                (media_id, existing + offset, name, value),
            )
        return
    if route_type == "media-detail":
        media = dict(document.get("media") or {})
        category, upstream_id, slug = str(media["category"]), int(media["id"]), str(media["slug"])
        media_id = ensure_structured_media(
            database, category, upstream_id, slug, str(media.get("title", "")), str(document.get("sourceURL", ""))
        )
        for ordinal, metric in enumerate(media.get("metrics") or []):
            database.execute(
                "INSERT OR IGNORE INTO media_metrics VALUES (?,?,?,?)",
                (media_id, ordinal, str(metric.get("name", "")), str(metric.get("value", ""))),
            )
        for deck in document.get("decks") or []:
            deck_url = str(deck.get("vocabularyListURL", ""))
            database.execute(
                "INSERT OR IGNORE INTO decks(media_id,name,url) VALUES (?,?,?)",
                (media_id, str(deck.get("title", "")), deck_url),
            )
            deck_id = int(database.execute("SELECT id FROM decks WHERE url=?", (deck_url,)).fetchone()[0])
            for ordinal, metric in enumerate(deck.get("metrics") or []):
                database.execute(
                    "INSERT OR IGNORE INTO deck_metrics VALUES (?,?,?,?)",
                    (deck_id, ordinal, str(metric.get("name", "")), str(metric.get("value", ""))),
                )
        return
    if route_type == "vocabulary-list":
        media = dict(document.get("media") or {})
        deck = dict(document.get("deck") or {})
        category, upstream_id, slug = str(media["category"]), int(media["id"]), str(media["slug"])
        base_url = f"https://jpdb.io/{category}/{upstream_id}/{slug}"
        media_id = ensure_structured_media(database, category, upstream_id, slug, "", base_url)
        deck_url = str(document.get("sourceURL", "")).split("?", 1)[0]
        database.execute(
            "INSERT OR IGNORE INTO decks(media_id,name,url) VALUES (?,?,?)",
            (media_id, str(deck.get("slug") or deck.get("kind") or slug), deck_url),
        )
        deck_id = int(database.execute("SELECT id FROM decks WHERE url=?", (deck_url,)).fetchone()[0])
        for item in document.get("vocabulary") or []:
            vid = int(item["vid"])
            row = database.execute("SELECT id FROM vocabulary WHERE upstream_vid=?", (vid,)).fetchone()
            database.execute(
                "INSERT OR REPLACE INTO deck_vocabulary VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    deck_id,
                    int(item["position"]),
                    vid,
                    int(row[0]) if row else None,
                    item.get("occurrences"),
                    str(item.get("spelling", "")),
                    str(item.get("reading", "")),
                    canonical_json(item.get("meanings") or []),
                    canonical_json(item.get("tags") or []),
                    canonical_json(item.get("frequencies") or []),
                    canonical_json(item.get("numericEvidence") or []),
                ),
            )
        return
    if route_type == "vocabulary-appearances":
        value = dict(document.get("vocabulary") or {})
        row = database.execute(
            "SELECT id FROM vocabulary WHERE upstream_vid=?", (int(value["vid"]),)
        ).fetchone()
        if not row:
            return
        vocabulary_id = int(row[0])
        for item in value.get("appearances") or []:
            database.execute(
                "INSERT OR REPLACE INTO vocabulary_media_appearances VALUES (?,?,?,?,?,?,?)",
                (
                    vocabulary_id,
                    str(item.get("category", "")),
                    int(item["mediaID"]),
                    str(item.get("slug", "")),
                    str(item.get("title", "")),
                    item.get("usedTimes"),
                    str(item.get("mediaURL", "")),
                ),
            )


def representative_checks(
    database: sqlite3.Connection, limit_per_route: int = 3
) -> list[dict[str, object]]:
    checks: list[dict[str, object]] = []
    route_counts: dict[str, int] = {}
    for route_type, document_json in database.execute(
        "SELECT route_type,document_json FROM extracted_documents ORDER BY source_resource_id"
    ):
        if route_type not in {"vocabulary-detail", "kanji-detail", "media-detail"}:
            continue
        if route_counts.get(route_type, 0) >= limit_per_route:
            continue
        route_counts[route_type] = route_counts.get(route_type, 0) + 1
        document = json.loads(document_json)
        if route_type == "vocabulary-detail":
            source = dict(document.get("vocabulary") or {})
            forms = list(source.get("forms") or [])
            primary = next((item for item in forms if item.get("primary")), forms[0] if forms else {})
            actual = database.execute(
                "SELECT headword,primary_reading,id FROM vocabulary WHERE upstream_vid=?",
                (int(source["vid"]),),
            ).fetchone()
            actual_meanings = (
                int(database.execute("SELECT count(*) FROM meanings WHERE vocabulary_id=?", (actual[2],)).fetchone()[0])
                if actual else 0
            )
            expected = {
                "headword": str(primary.get("spelling") or source.get("routeSpelling") or ""),
                "reading": str(primary.get("reading") or source.get("routeReading") or ""),
                "meaningCount": len(source.get("meanings") or []),
            }
            observed = {
                "headword": str(actual[0]) if actual else None,
                "reading": str(actual[1]) if actual else None,
                "meaningCount": actual_meanings,
            }
            key = str(source["vid"])
        elif route_type == "kanji-detail":
            source = dict(document.get("kanji") or {})
            actual = database.execute(
                "SELECT meaning,keyword,mnemonic FROM kanji WHERE character=?",
                (str(source["character"]),),
            ).fetchone()
            expected = {
                "meaning": "; ".join(str(item) for item in source.get("meanings") or []),
                "keyword": str(source.get("keyword", "")),
                "mnemonic": str(source.get("mnemonic", "")),
            }
            observed = (
                {"meaning": str(actual[0]), "keyword": str(actual[1]), "mnemonic": str(actual[2])}
                if actual else {"meaning": None, "keyword": None, "mnemonic": None}
            )
            key = str(source["character"])
        else:
            source = dict(document.get("media") or {})
            actual = database.execute(
                "SELECT slug,title FROM media WHERE category=? AND upstream_id=?",
                (str(source["category"]), int(source["id"])),
            ).fetchone()
            expected = {"slug": str(source.get("slug", "")), "title": str(source.get("title", ""))}
            observed = (
                {"slug": str(actual[0]), "title": str(actual[1])}
                if actual else {"slug": None, "title": None}
            )
            key = f"{source['category']}:{source['id']}"
        checks.append(
            {
                "routeType": route_type,
                "key": key,
                "passed": expected == observed,
                "expected": expected,
                "observed": observed,
            }
        )
    return checks


def write_mapping_reports(
    database: sqlite3.Connection, output_manifest: Path
) -> dict[str, dict[str, object]]:
    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    base = output_manifest.name.removesuffix(".import.json")
    reports: dict[str, dict[str, object]] = {}
    for status in ("mapped", "ambiguous", "unmapped"):
        path = output_manifest.with_name(f"{base}.mappings.{status}.jsonl")
        count = 0
        with path.open("w", encoding="utf-8") as output:
            for vid, headword, reading, zenbu_id, candidate_count in database.execute(
                "SELECT vocabulary.upstream_vid,vocabulary.headword,vocabulary.primary_reading,"
                "zenbu_mappings.zenbu_entry_id,zenbu_mappings.candidate_count "
                "FROM zenbu_mappings JOIN vocabulary ON vocabulary.id=zenbu_mappings.vocabulary_id "
                "WHERE zenbu_mappings.status=? ORDER BY vocabulary.upstream_vid",
                (status,),
            ):
                output.write(
                    canonical_json(
                        {
                            "sourceRecordID": int(vid),
                            "headword": str(headword),
                            "reading": str(reading),
                            "zenbuEntryID": bytes(zenbu_id).hex() if zenbu_id is not None else None,
                            "candidateCount": int(candidate_count),
                        }
                    )
                    + "\n"
                )
                count += 1
        reports[status] = {
            "path": str(path),
            "rows": count,
            "bytes": path.stat().st_size,
            "sha256": file_sha256(path),
        }
    return reports


def map_zenbu(database: sqlite3.Connection, language_data: Path | None) -> None:
    if language_data is None:
        database.execute(
            "INSERT INTO zenbu_mappings(vocabulary_id,status,candidate_count) "
            "SELECT id,'unmapped',0 FROM vocabulary"
        )
        return
    database.execute("ATTACH DATABASE ? AS zenbu", (str(language_data),))
    for vocabulary_id, vid in database.execute("SELECT id,upstream_vid FROM vocabulary ORDER BY id"):
        candidates = list(database.execute("SELECT id FROM zenbu.entries WHERE source_record_id=? ORDER BY id", (vid,)))
        status = "mapped" if len(candidates) == 1 else "ambiguous" if candidates else "unmapped"
        database.execute(
            "INSERT INTO zenbu_mappings VALUES (?,?,?,?)",
            (vocabulary_id, candidates[0][0] if len(candidates) == 1 else None, status, len(candidates)),
        )
    database.commit()
    database.execute("DETACH DATABASE zenbu")


def import_snapshot(arguments: argparse.Namespace) -> dict[str, object]:
    started_at = time.perf_counter()
    representatives: list[dict[str, object]] = []
    snapshot_manifest = arguments.snapshot / "snapshot.json"
    snapshot = json.loads(snapshot_manifest.read_text(encoding="utf-8"))
    if snapshot.get("schema") != "zenbu.jpdb-structured-snapshot.v2":
        raise ValueError("unsupported snapshot schema")
    if not snapshot.get("complete") and not arguments.allow_incomplete:
        raise ValueError("snapshot is incomplete; resume acquisition or pass --allow-incomplete")
    authorization_bytes = arguments.authorization.read_bytes()
    authorization = json.loads(authorization_bytes)
    authorization_sha256 = hashlib.sha256(authorization_bytes).hexdigest()
    if authorization_sha256 != snapshot.get("authorizationSHA256"):
        raise ValueError("authorization checksum does not match the acquired snapshot")
    if canonical_json(authorization) != canonical_json(snapshot.get("authorization", {})):
        raise ValueError("embedded snapshot authorization does not match the pinned record")
    if not isinstance(authorization.get("redistributionAllowed"), bool):
        raise ValueError("authorization redistributionAllowed must be boolean")
    if arguments.allow_redistribution and not authorization.get("redistributionAllowed"):
        raise ValueError("authorization record does not permit redistribution")
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=arguments.output.parent) as directory:
        candidate = Path(directory) / arguments.output.name
        database = sqlite3.connect(candidate)
        try:
            create_schema(database)
            database.execute(
                "INSERT INTO source_licenses(source_name,authorization_sha256,scope,redistribution_allowed,note) "
                "VALUES ('JPDB',?,?,?,?)",
                (
                    authorization_sha256,
                    str(authorization.get("scope", "")),
                    int(bool(authorization.get("redistributionAllowed"))),
                    str(authorization.get("redistributionNote", "")),
                ),
            )
            parsed_resources: list[tuple[int, dict[str, object], dict[str, object]]] = []
            for index, response in enumerate(snapshot["responses"], 1):
                blob = source_blob(arguments.snapshot, str(response["extractedSHA256"]))
                if not blob.is_file():
                    raise ValueError(f"missing extracted document: {response['url']}")
                if response.get("extractedCompression") != "zlib":
                    raise ValueError(f"unsupported extraction compression: {response['url']}")
                try:
                    body = zlib.decompress(blob.read_bytes())
                except zlib.error as error:
                    raise ValueError(f"extracted document checksum mismatch: {response['url']}") from error
                if hashlib.sha256(body).hexdigest() != response["extractedSHA256"]:
                    raise ValueError(f"extracted document checksum mismatch: {response['url']}")
                if len(body) != int(response["extractedBytes"]):
                    raise ValueError(f"extracted document byte count mismatch: {response['url']}")
                document = json.loads(body)
                if document.get("schema") != response["extractionSchema"]:
                    raise ValueError(f"extraction schema mismatch: {response['url']}")
                content_hash = str(document.get("contentSHA256", ""))
                without_hash = dict(document)
                without_hash.pop("contentSHA256", None)
                if hashlib.sha256(canonical_json(without_hash).encode("utf-8")).hexdigest() != content_hash:
                    raise ValueError(f"structured content hash mismatch: {response['url']}")
                database.execute(
                    "INSERT INTO source_resources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        index, response["url"], response["finalURL"], response["retrievedAt"], response["status"],
                        response["contentType"], response["sourceBytes"], response["sourceSHA256"],
                        response["extractedBytes"], response["extractedSHA256"],
                        response["extractedCompression"], response["extractionSchema"],
                    ),
                )
                database.execute(
                    "INSERT INTO extracted_documents VALUES (?,?,?,?)",
                    (index, str(document.get("routeType", "")), content_hash, canonical_json(document)),
                )
                preserve_field_provenance(database, index, document)
                insert_structured_evidence(database, index, document)
                if document.get("routeType") == "vocabulary-detail":
                    insert_structured_vocabulary(database, index, document)
                elif document.get("routeType") == "kanji-detail":
                    insert_structured_kanji(database, index, document)
                elif document.get("routeType") == "kanji-reading":
                    insert_structured_kanji_reading(database, index, document)
                parsed_resources.append((index, response, document))
            for index, response, document in parsed_resources:
                insert_structured_media(database, index, document)
                if document.get("routeType") == "vocabulary-detail":
                    value = dict(document.get("vocabulary") or {})
                    source = database.execute(
                        "SELECT id FROM vocabulary WHERE upstream_vid=?", (int(value["vid"]),)
                    ).fetchone()
                    if source:
                        for relation in value.get("relations") or []:
                            target = database.execute(
                                "SELECT id FROM vocabulary WHERE upstream_vid=?",
                                (int(relation["targetVID"]),),
                            ).fetchone()
                            if target and target[0] != source[0]:
                                database.execute(
                                    "INSERT OR IGNORE INTO vocabulary_relations VALUES (?,?,?)",
                                    (int(source[0]), int(target[0]), str(relation.get("relation", "related"))),
                                )
            database.execute(
                "UPDATE kanji_reading_vocabulary SET vocabulary_id=("
                "SELECT id FROM vocabulary WHERE upstream_vid=kanji_reading_vocabulary.upstream_vid) "
                "WHERE vocabulary_id IS NULL"
            )
            map_zenbu(database, arguments.zenbu_language_data)
            representatives = representative_checks(database)
            if any(not bool(check["passed"]) for check in representatives):
                raise ValueError("representative normalized records differ from extracted source")
            foreign_keys = list(database.execute("PRAGMA foreign_key_check"))
            integrity = str(database.execute("PRAGMA integrity_check").fetchone()[0])
            if foreign_keys or integrity != "ok":
                raise ValueError(f"SQLite validation failed: foreign_keys={foreign_keys}, integrity={integrity}")
            database.commit()
            database.execute("VACUUM")
        finally:
            database.close()
        candidate.replace(arguments.output)

    connection = sqlite3.connect(arguments.output)
    try:
        table_counts = {
            table: int(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0])
            for table in (
                "source_resources", "extracted_documents", "vocabulary", "spellings", "readings", "meanings",
                "meaning_parts_of_speech", "pronunciations", "frequencies", "kanji", "kanji_components",
                "kanji_readings", "kanji_reading_vocabulary", "kanji_attributes", "kanji_relations", "example_sentences",
                "vocabulary_examples", "media", "media_metrics", "decks", "deck_metrics", "deck_vocabulary", "conflicts",
                "vocabulary_relations", "vocabulary_media_appearances", "validation_issues",
                "vocabulary_usage_summary", "upstream_identifiers", "zenbu_mappings", "field_provenance",
                "unparsed_evidence", "source_external_links", "source_images", "source_licenses",
            )
        }
        mapping_counts = {
            status: int(count)
            for status, count in connection.execute(
                "SELECT status,count(*) FROM zenbu_mappings GROUP BY status ORDER BY status"
            )
        }
        foreign_key_check = list(connection.execute("PRAGMA foreign_key_check"))
        integrity_check = str(connection.execute("PRAGMA integrity_check").fetchone()[0])
        issue_counts = {
            str(kind): int(count)
            for kind, count in connection.execute(
                "SELECT kind,count(*) FROM validation_issues GROUP BY kind ORDER BY kind"
            )
        }
        conflict_count = int(connection.execute("SELECT count(*) FROM conflicts").fetchone()[0])
        duplicate_observations = int(
            connection.execute(
                "SELECT COALESCE(SUM(observations-1),0) FROM ("
                "SELECT count(*) AS observations FROM field_provenance "
                "WHERE field_name='structured-record' GROUP BY entity_type,entity_key "
                "HAVING count(*)>1)"
            ).fetchone()[0]
        )
        provenance_rows = int(
            connection.execute("SELECT count(*) FROM field_provenance").fetchone()[0]
        )
        document_locator_rows = int(
            connection.execute(
                "SELECT count(*) FROM field_provenance WHERE entity_type='extracted_document'"
            ).fetchone()[0]
        )
        unparsed_sections = int(
            connection.execute("SELECT count(*) FROM unparsed_evidence").fetchone()[0]
        )
        mapping_reports = write_mapping_reports(connection, arguments.output_manifest)
    finally:
        connection.close()
    duration = time.perf_counter() - started_at
    source_http_bytes = sum(int(response["sourceBytes"]) for response in snapshot["responses"])
    structured_uncompressed_bytes = sum(
        int(response["extractedBytes"]) for response in snapshot["responses"]
    )
    structured_stored_bytes = sum(
        source_blob(arguments.snapshot, digest).stat().st_size
        for digest in sorted({str(response["extractedSHA256"]) for response in snapshot["responses"]})
    )
    normalized_rows = sum(table_counts.values())
    report: dict[str, object] = {
        "schema": "zenbu.jpdb-import.v2",
        "artifactSchema": ARTIFACT_SCHEMA,
        "snapshotManifestSHA256": file_sha256(snapshot_manifest),
        "authorizationSHA256": snapshot["authorizationSHA256"],
        "importerSHA256": file_sha256(Path(__file__)),
        "artifactBytes": arguments.output.stat().st_size,
        "artifactSHA256": file_sha256(arguments.output),
        "snapshotComplete": bool(snapshot.get("complete")),
        "expected": snapshot.get("expected", {}),
        "observed": snapshot.get("observed", {}),
        "tableCounts": table_counts,
        "mappingCounts": mapping_counts,
        "mappingReports": mapping_reports,
        "validationCounts": {
            "duplicateObservations": duplicate_observations,
            "conflicts": conflict_count,
            "issuesByKind": issue_counts,
            "unparsedSections": unparsed_sections,
        },
        "representativeChecks": representatives,
        "provenance": {
            "rows": provenance_rows,
            "documentLocatorRows": document_locator_rows,
            "rowsPerStoredRow": round(provenance_rows / normalized_rows, 6) if normalized_rows else 0,
        },
        "integrityCheck": integrity_check,
        "foreignKeyViolations": foreign_key_check,
        "distributionEnabled": bool(arguments.allow_redistribution and authorization.get("redistributionAllowed")),
        "storage": {
            "sourceHTTPBytes": source_http_bytes,
            "structuredUncompressedBytes": structured_uncompressed_bytes,
            "structuredStoredBytes": structured_stored_bytes,
            "sqliteBytes": arguments.output.stat().st_size,
        },
        "performance": {
            "importDurationSeconds": round(duration, 6),
            "normalizedRows": normalized_rows,
            "normalizedRowsPerSecond": round(normalized_rows / duration, 3) if duration else None,
        },
        "importDurationSeconds": round(duration, 6),
    }
    arguments.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    arguments.output_manifest.write_text(canonical_json(report) + "\n", encoding="utf-8")
    return report


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--snapshot", type=Path, required=True)
    result.add_argument("--authorization", type=Path, required=True)
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--output-manifest", type=Path, required=True)
    result.add_argument("--zenbu-language-data", type=Path)
    result.add_argument("--allow-incomplete", action="store_true")
    result.add_argument("--allow-redistribution", action="store_true")
    return result


if __name__ == "__main__":
    try:
        import_snapshot(parser().parse_args())
    except (OSError, ValueError, KeyError, json.JSONDecodeError, sqlite3.Error) as error:
        print(f"JPDB import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
