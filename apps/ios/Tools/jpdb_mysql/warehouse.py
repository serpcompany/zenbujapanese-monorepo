#!/usr/bin/env python3
"""Export a validated JPDB SQLite artifact and load it into MySQL via its CLI."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence


ROOT = Path(__file__).resolve().parent
MIGRATIONS = ROOT / "migrations"
EXPORT_SCHEMA = "zenbu.jpdb-mysql-export.v1"


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_hash(*values: object) -> str:
    payload = canonical_json(
        [value.hex() if isinstance(value, bytes) else value for value in values]
    ).encode("utf-8")
    return sha256_bytes(payload)


def tsv_value(value: object) -> str:
    if value is None:
        return r"\N"
    if isinstance(value, bytes):
        value = value.hex()
    text = str(value)
    return (
        text.replace("\\", "\\\\")
        .replace("\t", r"\t")
        .replace("\n", r"\n")
        .replace("\r", r"\r")
    )


def write_tsv(path: Path, rows: Iterable[Sequence[object]]) -> tuple[int, str]:
    digest = hashlib.sha256()
    count = 0
    with path.open("wb") as output:
        for row in rows:
            encoded = ("\t".join(tsv_value(value) for value in row) + "\n").encode("utf-8")
            output.write(encoded)
            digest.update(encoded)
            count += 1
    return count, digest.hexdigest()


@dataclass(frozen=True)
class TableSpec:
    export_name: str
    target: str
    columns: tuple[str, ...]
    binary_columns: frozenset[str] = frozenset()
    snapshot_scoped: bool = True


TABLE_SPECS = (
    TableSpec("extracted_documents", "jpdb_extracted_documents", ("document_sha", "schema_name", "schema_version", "route_type", "canonical_json"), frozenset(("document_sha",)), False),
    TableSpec("source_resources", "jpdb_source_resources", ("local_id", "requested_url", "requested_url_sha", "final_url", "canonical_url", "retrieved_at", "http_status", "content_type", "response_byte_count", "response_content_sha", "extracted_document_sha", "extracted_compression", "extracted_schema", "extracted_schema_version", "etag", "last_modified", "attempts", "discovered_from_url_sha"), frozenset(("requested_url_sha", "response_content_sha", "extracted_document_sha", "discovered_from_url_sha"))),
    TableSpec("closure_checks", "jpdb_closure_checks", ("listing_path_sha", "listing_path", "listing_kind", "expected_count", "covered_positions", "observed_ids", "closed"), frozenset(("listing_path_sha",))),
    TableSpec("vocabulary", "jpdb_vocabulary", ("local_id", "upstream_vid", "headword", "primary_reading")),
    TableSpec("spellings", "jpdb_spellings", ("vocabulary_id", "spelling", "reading", "weight", "is_primary", "form_sha"), frozenset(("form_sha",))),
    TableSpec("readings", "jpdb_readings", ("vocabulary_id", "reading", "is_primary")),
    TableSpec("meanings", "jpdb_meanings", ("vocabulary_id", "ordinal", "meaning")),
    TableSpec("meaning_parts_of_speech", "jpdb_meaning_parts_of_speech", ("vocabulary_id", "meaning_ordinal", "part_of_speech")),
    TableSpec("pronunciations", "jpdb_pronunciations", ("vocabulary_id", "kind", "value_sha", "value_text", "audio_path"), frozenset(("value_sha",))),
    TableSpec(
        "frequencies",
        "jpdb_frequencies",
        ("vocabulary_id", "corpus", "frequency_rank", "rank_semantics", "display_text"),
    ),
    TableSpec("kanji", "jpdb_kanji", ("character_text", "meaning", "keyword_text", "mnemonic_text")),
    TableSpec("kanji_components", "jpdb_kanji_components", ("character_text", "component_text")),
    TableSpec("example_sentences", "jpdb_example_sentences", ("local_id", "japanese", "english", "audio_path")),
    TableSpec("vocabulary_examples", "jpdb_vocabulary_examples", ("vocabulary_id", "example_id", "ordinal")),
    TableSpec("media", "jpdb_media", ("local_id", "category", "upstream_id", "slug", "title", "canonical_url")),
    TableSpec("decks", "jpdb_decks", ("local_id", "media_id", "name", "canonical_url", "canonical_url_sha"), frozenset(("canonical_url_sha",))),
    TableSpec("deck_vocabulary", "jpdb_deck_vocabulary", ("deck_id", "position_number", "upstream_vid", "vocabulary_id", "occurrences", "spelling", "reading", "meanings_json", "tags_json", "frequencies_json", "numeric_evidence_json")),
    TableSpec("vocabulary_relations", "jpdb_vocabulary_relations", ("source_vocabulary_id", "target_vocabulary_id", "relation")),
    TableSpec("upstream_identifiers", "jpdb_upstream_identifiers", ("entity_type", "entity_key", "namespace", "upstream_id")),
    TableSpec("zenbu_mappings", "jpdb_zenbu_mappings", ("vocabulary_id", "zenbu_entry_id", "status", "candidate_count"), frozenset(("zenbu_entry_id",))),
    TableSpec("field_provenance", "jpdb_field_provenance", ("observation_sha", "entity_type", "entity_key", "field_name", "source_resource_id", "source_locator"), frozenset(("observation_sha",))),
    TableSpec("conflicts", "jpdb_conflicts", ("conflict_sha", "entity_type", "entity_key", "field_name", "values_json"), frozenset(("conflict_sha",))),
    TableSpec("validation_issues", "jpdb_validation_issues", ("issue_sha", "source_resource_id", "issue_kind", "detail"), frozenset(("issue_sha",))),
    TableSpec("source_licenses", "jpdb_source_licenses", ("local_id", "source_name", "authorization_sha", "scope_text", "redistribution_allowed", "note"), frozenset(("authorization_sha",))),
    TableSpec("frontend_decks", "jpdb_frontend_decks", ("deck_key_sha", "deck_key", "category", "upstream_media_id", "media_slug", "deck_kind", "deck_ordinal", "deck_slug", "title", "vocabulary_list_url", "source_document_sha"), frozenset(("deck_key_sha", "source_document_sha"))),
    TableSpec("media_metrics", "jpdb_media_metrics", ("media_id", "metric_ordinal", "metric_name", "metric_value")),
    TableSpec("deck_metrics", "jpdb_deck_metrics", ("deck_id", "metric_ordinal", "metric_name", "metric_value")),
    TableSpec("deck_listing_rows", "jpdb_deck_listing_rows", ("deck_key_sha", "position_number", "row_ordinal", "upstream_vid", "spelling", "reading", "occurrences", "meanings_json", "tags_json", "frequencies_json", "numeric_evidence_json", "source_document_sha"), frozenset(("deck_key_sha", "source_document_sha"))),
    TableSpec("vocabulary_media_appearances", "jpdb_vocabulary_media_appearances", ("upstream_vid", "category", "upstream_media_id", "media_slug", "title", "used_times", "media_url", "source_document_sha"), frozenset(("source_document_sha",))),
    TableSpec("vocabulary_usage_summary", "jpdb_vocabulary_usage_summary", ("vocabulary_id", "used_in_media_count")),
    TableSpec("kanji_details", "jpdb_kanji_details", ("character_text", "keyword_text", "meanings_json", "mnemonic_text", "pronunciation_audio_json", "source_document_sha"), frozenset(("source_document_sha",))),
    TableSpec("kanji_readings", "jpdb_kanji_readings", ("character_text", "reading_ordinal", "reading_text", "reading_url", "source_document_sha"), frozenset(("source_document_sha",))),
    TableSpec("kanji_attributes", "jpdb_kanji_attributes", ("character_text", "attribute_ordinal", "attribute_name", "attribute_value", "source_document_sha"), frozenset(("source_document_sha",))),
    TableSpec("kanji_frontend_relations", "jpdb_kanji_frontend_relations", ("source_character", "relation_type", "target_key", "description_text", "relation_ordinal", "source_document_sha"), frozenset(("source_document_sha",))),
    TableSpec("kanji_reading_details", "jpdb_kanji_reading_details", ("character_text", "reading_text", "frequency_percent", "used_in_total", "source_document_sha"), frozenset(("source_document_sha",))),
    TableSpec("kanji_reading_vocabulary", "jpdb_kanji_reading_vocabulary", ("character_text", "reading_text", "position_number", "upstream_vid", "spelling", "vocabulary_reading", "meaning_text", "detail_url", "source_document_sha"), frozenset(("source_document_sha",))),
    TableSpec("document_external_links", "jpdb_document_external_links", ("source_document_sha", "link_ordinal", "link_text", "link_url"), frozenset(("source_document_sha",))),
    TableSpec("document_images", "jpdb_document_images", ("source_document_sha", "image_ordinal", "image_url", "alt_text", "title_text"), frozenset(("source_document_sha",))),
    TableSpec("document_diagnostics", "jpdb_document_diagnostics", ("source_document_sha", "visible_text_sha", "headings_json", "tables_json", "metadata_json", "unparsed_evidence_json"), frozenset(("source_document_sha", "visible_text_sha"))),
)


def sqlite_rows(database: sqlite3.Connection, table: str, order: str) -> Iterable[tuple[object, ...]]:
    return database.execute(f"SELECT * FROM {table} ORDER BY {order}")


def read_extracted_documents(
    database: sqlite3.Connection,
) -> tuple[dict[int, dict[str, object]], list[dict[str, object]]]:
    by_resource: dict[int, dict[str, object]] = {}
    documents: dict[str, dict[str, object]] = {}
    for resource_id, route_type, content_sha, document_json in database.execute(
        "SELECT source_resource_id,route_type,content_sha256,document_json "
        "FROM extracted_documents ORDER BY source_resource_id"
    ):
        document = json.loads(document_json)
        unhashed = dict(document)
        unhashed.pop("contentSHA256", None)
        observed = sha256_bytes(canonical_json(unhashed).encode("utf-8"))
        if str(content_sha) != str(document.get("contentSHA256", "")) or observed != str(content_sha):
            raise ValueError(f"extracted document checksum mismatch: source resource {resource_id}")
        if str(route_type) != str(document.get("routeType", "")):
            raise ValueError(f"extracted document route mismatch: source resource {resource_id}")
        by_resource[int(resource_id)] = document
        documents.setdefault(str(content_sha), document)
    return by_resource, [documents[key] for key in sorted(documents)]


def verify_structured_snapshot_blobs(
    snapshot_root: Path,
    snapshot: dict[str, object],
    extracted_by_resource: dict[int, dict[str, object]],
) -> None:
    for resource_id, response in enumerate(snapshot["responses"], 1):
        digest = str(response["extractedSHA256"])
        path = snapshot_root / "structured" / "sha256" / digest[:2] / digest[2:]
        if not path.is_file():
            raise ValueError(f"missing structured snapshot blob: {response['url']}")
        stored = path.read_bytes()
        compression = str(response.get("extractedCompression", "identity"))
        if compression == "zlib":
            try:
                payload = zlib.decompress(stored)
            except zlib.error as error:
                raise ValueError(f"invalid compressed structured snapshot blob: {response['url']}") from error
        elif compression == "identity":
            payload = stored
        else:
            raise ValueError(f"unsupported extracted compression: {compression}")
        if len(payload) != int(response["extractedBytes"]) or sha256_bytes(payload) != digest:
            raise ValueError(f"structured snapshot blob mismatch: {response['url']}")
        document = extracted_by_resource.get(resource_id)
        if document is None or canonical_json(json.loads(payload)) != canonical_json(document):
            raise ValueError(f"structured snapshot and SQLite document differ: {response['url']}")


def extracted_observation_rows(
    documents: list[dict[str, object]]
) -> dict[str, list[tuple[object, ...]]]:
    result: dict[str, list[tuple[object, ...]]] = {
        spec.export_name: []
        for spec in TABLE_SPECS
        if spec.export_name in {
            "frontend_decks", "deck_listing_rows",
            "vocabulary_media_appearances", "kanji_details", "kanji_readings",
            "kanji_attributes", "kanji_frontend_relations", "kanji_reading_details",
            "kanji_reading_vocabulary", "document_external_links",
            "document_images", "document_diagnostics",
        }
    }
    deck_seen: set[tuple[str, str]] = set()
    for document in documents:
        document_sha = str(document["contentSHA256"])
        evidence = dict(document.get("evidence", {}))
        for ordinal, link in enumerate(evidence.get("externalLinks", [])):
            result["document_external_links"].append(
                (document_sha, ordinal, link.get("text", ""), link.get("url", ""))
            )
        for ordinal, image in enumerate(evidence.get("images", [])):
            result["document_images"].append(
                (document_sha, ordinal, image.get("url", ""), image.get("alt", ""), image.get("title", ""))
            )
        visible_sha = str(evidence.get("visibleTextSHA256", ""))
        if not re.fullmatch(r"[0-9a-f]{64}", visible_sha):
            raise ValueError(f"invalid visible text checksum: {document.get('sourceURL', document_sha)}")
        result["document_diagnostics"].append(
            (
                document_sha,
                visible_sha,
                canonical_json(evidence.get("headings", [])),
                canonical_json(evidence.get("genericTables", [])),
                canonical_json(evidence.get("metadata", [])),
                canonical_json(document.get("unparsedEvidence", [])),
            )
        )
        route = document.get("routeType")
        if route == "media-detail":
            media = dict(document.get("media", {}))
            category = str(media.get("category", ""))
            media_id = int(media.get("id", 0))
            for deck in document.get("decks", []):
                key = str(deck.get("key", ""))
                key_sha = stable_hash(key)
                observation_key = (key, document_sha)
                if observation_key not in deck_seen:
                    deck_seen.add(observation_key)
                    result["frontend_decks"].append(
                        (
                            key_sha, key, category, media_id, str(media.get("slug", "")),
                            deck.get("kind", "aggregate"), deck.get("ordinal"), deck.get("slug"),
                            deck.get("title", ""), deck.get("vocabularyListURL", ""), document_sha,
                        )
                    )
        elif route == "vocabulary-list":
            media = dict(document.get("media", {}))
            deck = dict(document.get("deck", {}))
            key = str(deck.get("key", ""))
            key_sha = stable_hash(key)
            observation_key = (key, document_sha)
            if observation_key not in deck_seen:
                deck_seen.add(observation_key)
                result["frontend_decks"].append(
                    (
                        key_sha, key, media.get("category", ""), int(media.get("id", 0)),
                        media.get("slug", ""), deck.get("kind", "aggregate"), deck.get("ordinal"),
                        deck.get("slug"), "", document.get("sourceURL", ""), document_sha,
                    )
                )
            for row_ordinal, row in enumerate(document.get("vocabulary", [])):
                result["deck_listing_rows"].append(
                    (
                        key_sha, int(row.get("position", row_ordinal + 1)), row_ordinal,
                        int(row.get("vid", 0)), row.get("spelling", ""), row.get("reading", ""),
                        row.get("occurrences"), canonical_json(row.get("meanings", [])),
                        canonical_json(row.get("tags", [])), canonical_json(row.get("frequencies", [])),
                        canonical_json(row.get("numericEvidence", [])),
                        document_sha,
                    )
                )
        elif route == "vocabulary-appearances":
            vocabulary = dict(document.get("vocabulary", {}))
            for appearance in vocabulary.get("appearances", []):
                result["vocabulary_media_appearances"].append(
                    (
                        int(vocabulary.get("vid", 0)), appearance.get("category", ""),
                        int(appearance.get("mediaID", 0)), appearance.get("slug", ""),
                        appearance.get("title", ""), appearance.get("usedTimes"),
                        appearance.get("mediaURL", ""), document_sha,
                    )
                )
        elif route == "kanji-detail":
            kanji = dict(document.get("kanji", {}))
            character = str(kanji.get("character", ""))
            result["kanji_details"].append(
                (
                    character, kanji.get("keyword", ""), canonical_json(kanji.get("meanings", [])),
                    kanji.get("mnemonic", ""), canonical_json(kanji.get("pronunciationAudioPaths", [])),
                    document_sha,
                )
            )
            for ordinal, reading in enumerate(kanji.get("readings", [])):
                result["kanji_readings"].append(
                    (character, ordinal, reading.get("value", ""), reading.get("url", ""), document_sha)
                )
            for ordinal, attribute in enumerate(kanji.get("attributes", [])):
                result["kanji_attributes"].append(
                    (character, ordinal, attribute.get("name", ""), attribute.get("value", ""), document_sha)
                )
            relation_ordinal = 0
            for component in kanji.get("components", []):
                result["kanji_frontend_relations"].append(
                    (character, "component", component.get("character", ""), component.get("description", ""), relation_ordinal, document_sha)
                )
                relation_ordinal += 1
            for target in kanji.get("usedInKanji", []):
                result["kanji_frontend_relations"].append(
                    (character, "used-in-kanji", target, "", relation_ordinal, document_sha)
                )
                relation_ordinal += 1
            for target in kanji.get("usedInVocabulary", []):
                result["kanji_frontend_relations"].append(
                    (character, "used-in-vocabulary", str(target.get("vid", "")), target.get("text", ""), relation_ordinal, document_sha)
                )
                relation_ordinal += 1
        elif route == "kanji-reading":
            reading = dict(document.get("kanjiReading", {}))
            character = str(reading.get("character", ""))
            reading_text = str(reading.get("reading", ""))
            result["kanji_reading_details"].append(
                (
                    character,
                    reading_text,
                    reading.get("frequencyPercent"),
                    reading.get("usedInTotal"),
                    document_sha,
                )
            )
            for item in reading.get("vocabulary", []):
                result["kanji_reading_vocabulary"].append(
                    (
                        character,
                        reading_text,
                        int(item.get("position", 0)),
                        int(item.get("vid", 0)),
                        item.get("spelling", ""),
                        item.get("reading", ""),
                        item.get("meaning", ""),
                        item.get("detailURL", ""),
                        document_sha,
                    )
                )
    for rows in result.values():
        rows.sort(key=lambda row: tuple("" if value is None else str(value) for value in row))
    return result


def export_rows(
    database: sqlite3.Connection,
    snapshot: dict[str, object],
    extracted_by_resource: dict[int, dict[str, object]],
    documents: list[dict[str, object]],
) -> dict[str, Iterable[Sequence[object]]]:
    responses = list(snapshot["responses"])
    source_count = int(database.execute("SELECT count(*) FROM source_resources").fetchone()[0])
    if source_count != len(responses):
        raise ValueError("SQLite/source snapshot resource counts differ")

    def document_rows() -> Iterable[Sequence[object]]:
        for document in documents:
            yield (
                document["contentSHA256"],
                document["schema"],
                document["schemaVersion"],
                document["routeType"],
                canonical_json(document),
            )

    def resource_rows() -> Iterable[Sequence[object]]:
        sources = sqlite_rows(database, "source_resources", "id")
        for local_id, (response, sqlite_source) in enumerate(zip(responses, sources), 1):
            digest = str(response["sourceSHA256"])
            identity_pairs = (
                (int(sqlite_source[0]), local_id),
                (str(sqlite_source[1]), str(response["url"])),
                (str(sqlite_source[2]), str(response["finalURL"])),
                (str(sqlite_source[3]), str(response["retrievedAt"])),
                (int(sqlite_source[4]), int(response["status"])),
                (str(sqlite_source[5]), str(response["contentType"])),
                (int(sqlite_source[6]), int(response["sourceBytes"])),
                (str(sqlite_source[7]), digest),
                (int(sqlite_source[8]), int(response["extractedBytes"])),
                (str(sqlite_source[9]), str(response["extractedSHA256"])),
                (str(sqlite_source[10]), str(response["extractedCompression"])),
                (str(sqlite_source[11]), str(response["extractionSchema"])),
            )
            if any(observed != expected for observed, expected in identity_pairs):
                raise ValueError(f"SQLite/source snapshot identity mismatch: {response['url']}")
            document = extracted_by_resource.get(local_id)
            if document is None:
                raise ValueError(f"missing extracted document: {response['url']}")
            if str(document.get("schema")) != str(sqlite_source[11]):
                raise ValueError(f"SQLite extracted document metadata mismatch: {response['url']}")
            discovered = response.get("discoveredFrom")
            yield (
                local_id,
                response["url"],
                sha256_bytes(str(response["url"]).encode()),
                response["finalURL"],
                document.get("canonicalURL"),
                response["retrievedAt"],
                response["status"],
                response["contentType"],
                response["sourceBytes"],
                digest,
                document["contentSHA256"],
                str(sqlite_source[10]),
                str(sqlite_source[11]),
                int(document["schemaVersion"]),
                response.get("etag"),
                response.get("lastModified"),
                response.get("attempts", 0),
                sha256_bytes(str(discovered).encode()) if discovered else None,
            )

    closure_rows: list[tuple[object, ...]] = []
    closure = snapshot.get("frontendClosure") or {}
    for path, record in sorted(dict(closure.get("listings", {})).items()):
        closure_rows.append(
            (
                sha256_bytes(path.encode()),
                path,
                "difficulty" if path.endswith("-difficulty-list") else "vocabulary",
                record.get("expected"),
                record.get("coveredPositions", 0),
                record.get("observedIDs", 0),
                int(bool(record.get("closed"))),
            )
        )

    result: dict[str, Iterable[Sequence[object]]] = {
        "extracted_documents": document_rows(),
        "source_resources": resource_rows(),
        "closure_checks": closure_rows,
        "vocabulary": sqlite_rows(database, "vocabulary", "id"),
        "spellings": ((*row, stable_hash(row[1], row[2])) for row in sqlite_rows(database, "spellings", "vocabulary_id,spelling,reading")),
        "readings": sqlite_rows(database, "readings", "vocabulary_id,reading"),
        "meanings": sqlite_rows(database, "meanings", "vocabulary_id,ordinal"),
        "meaning_parts_of_speech": sqlite_rows(database, "meaning_parts_of_speech", "vocabulary_id,meaning_ordinal,part_of_speech"),
        "pronunciations": ((row[0], row[1], stable_hash(row[2]), row[2], row[3]) for row in sqlite_rows(database, "pronunciations", "vocabulary_id,kind,value")),
        "frequencies": sqlite_rows(database, "frequencies", "vocabulary_id,corpus"),
        "kanji": sqlite_rows(database, "kanji", "character"),
        "kanji_components": sqlite_rows(database, "kanji_components", "character,component"),
        "example_sentences": sqlite_rows(database, "example_sentences", "id"),
        "vocabulary_examples": sqlite_rows(database, "vocabulary_examples", "vocabulary_id,example_id"),
        "media": sqlite_rows(database, "media", "id"),
        "decks": ((*row, sha256_bytes(str(row[3]).encode())) for row in sqlite_rows(database, "decks", "id")),
        "media_metrics": sqlite_rows(database, "media_metrics", "media_id,ordinal"),
        "deck_metrics": sqlite_rows(database, "deck_metrics", "deck_id,ordinal"),
        "deck_vocabulary": sqlite_rows(database, "deck_vocabulary", "deck_id,position"),
        "vocabulary_relations": sqlite_rows(database, "vocabulary_relations", "source_vocabulary_id,target_vocabulary_id,relation"),
        "vocabulary_usage_summary": sqlite_rows(database, "vocabulary_usage_summary", "vocabulary_id"),
        "upstream_identifiers": sqlite_rows(database, "upstream_identifiers", "entity_type,entity_key,namespace"),
        "zenbu_mappings": sqlite_rows(database, "zenbu_mappings", "vocabulary_id"),
        "field_provenance": ((stable_hash(*row), *row) for row in sqlite_rows(database, "field_provenance", "entity_type,entity_key,field_name,source_resource_id,source_locator")),
        "conflicts": ((stable_hash(*row), *row) for row in sqlite_rows(database, "conflicts", "entity_type,entity_key,field_name")),
        "validation_issues": ((stable_hash(*row), *row) for row in sqlite_rows(database, "validation_issues", "source_resource_id,kind,detail")),
        "source_licenses": sqlite_rows(database, "source_licenses", "id"),
    }
    result.update(extracted_observation_rows(documents))
    return result


def export_warehouse(arguments: argparse.Namespace) -> dict[str, object]:
    snapshot_manifest = arguments.snapshot / "snapshot.json"
    snapshot_bytes = snapshot_manifest.read_bytes()
    snapshot = json.loads(snapshot_bytes)
    if not snapshot.get("complete") and not bool(getattr(arguments, "allow_incomplete", False)):
        raise ValueError("MySQL export requires a complete scoped snapshot")
    artifact_manifest = json.loads(arguments.artifact_manifest.read_text(encoding="utf-8"))
    if file_sha256(arguments.sqlite) != artifact_manifest["artifactSHA256"]:
        raise ValueError("normalized SQLite checksum mismatch")
    if sha256_bytes(snapshot_bytes) != artifact_manifest["snapshotManifestSHA256"]:
        raise ValueError("structured snapshot manifest checksum mismatch")
    arguments.output.mkdir(parents=True, exist_ok=True)
    tables: dict[str, object] = {}
    database = sqlite3.connect(arguments.sqlite)
    try:
        extracted_by_resource, documents = read_extracted_documents(database)
        verify_structured_snapshot_blobs(arguments.snapshot, snapshot, extracted_by_resource)
        rows_by_table = export_rows(database, snapshot, extracted_by_resource, documents)
        for spec in TABLE_SPECS:
            count, digest = write_tsv(arguments.output / f"{spec.export_name}.tsv", rows_by_table[spec.export_name])
            tables[spec.export_name] = {"rows": count, "sha256": digest, "target": spec.target}
    finally:
        database.close()
    authorization = dict(snapshot.get("authorization", {}))
    manifest: dict[str, object] = {
        "schema": EXPORT_SCHEMA,
        "snapshotSHA256": sha256_bytes(snapshot_bytes),
        "snapshotManifestSHA256": sha256_bytes(snapshot_bytes),
        "artifactSHA256": artifact_manifest["artifactSHA256"],
        "artifactManifestSHA256": file_sha256(arguments.artifact_manifest),
        "authorizationSHA256": snapshot["authorizationSHA256"],
        "discoveryMode": snapshot.get("discoveryMode", ""),
        "scope": authorization.get("scope", ""),
        "frontendClosure": snapshot.get("frontendClosure"),
        "isFullJPDB": False,
        "snapshotComplete": bool(snapshot.get("complete")),
        "tables": tables,
    }
    (arguments.output / "manifest.json").write_text(canonical_json(manifest) + "\n", encoding="utf-8")
    (arguments.output / "load.sql.template").write_text(build_load_sql(manifest), encoding="utf-8")
    return manifest


def load_columns(spec: TableSpec) -> tuple[str, str]:
    fields = []
    setters = []
    if spec.snapshot_scoped:
        setters.append("snapshot_id=@snapshot_id")
    for column in spec.columns:
        if column in spec.binary_columns:
            fields.append(f"@{column}")
            setters.append(f"{column}=UNHEX(NULLIF(@{column},''))")
        else:
            fields.append(f"`{column}`")
    return ",".join(fields), ",".join(setters)


def build_load_sql(manifest: dict[str, object]) -> str:
    snapshot_sha = str(manifest["snapshotSHA256"])
    closure_json = canonical_json(manifest.get("frontendClosure")) if manifest.get("frontendClosure") is not None else None
    closure_sql = "NULL" if closure_json is None else "CONVERT(0x" + closure_json.encode().hex() + " USING utf8mb4)"
    scope_hex = str(manifest.get("scope", "")).encode().hex()
    mode_hex = str(manifest.get("discoveryMode", "")).encode().hex()
    lines = [
        "SET NAMES utf8mb4 COLLATE utf8mb4_0900_bin;",
        "SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';",
        "SELECT GET_LOCK('zenbu.jpdb.mysql-load',60) INTO @lock_acquired;",
        "CREATE TEMPORARY TABLE load_assertions(ok TINYINT NOT NULL CHECK(ok=1));",
        "INSERT INTO load_assertions VALUES (@lock_acquired);",
        "START TRANSACTION;",
        f"SELECT COUNT(*) INTO @already_published FROM jpdb_snapshots WHERE snapshot_sha=UNHEX('{snapshot_sha}') AND state='published';",
        (
            "INSERT INTO jpdb_snapshots(snapshot_sha,manifest_sha,artifact_sha,authorization_sha,"
            "discovery_mode,scope_text,extract_root_uri,frontend_closure,state,is_full_jpdb,created_at) VALUES ("
            f"UNHEX('{snapshot_sha}'),UNHEX('{manifest['artifactManifestSHA256']}'),"
            f"UNHEX('{manifest['artifactSHA256']}'),UNHEX('{manifest['authorizationSHA256']}'),"
            f"CONVERT(0x{mode_hex} USING utf8mb4),CONVERT(0x{scope_hex} USING utf8mb4),"
            f"'__EXTRACT_ROOT_URI__',{closure_sql},'loading',FALSE,UTC_TIMESTAMP(6)) "
            "ON DUPLICATE KEY UPDATE snapshot_id=LAST_INSERT_ID(snapshot_id);"
        ),
        "SET @snapshot_id=LAST_INSERT_ID();",
        (
            "INSERT INTO load_assertions SELECT artifact_sha=UNHEX('"
            + str(manifest["artifactSHA256"])
            + "') AND authorization_sha=UNHEX('"
            + str(manifest["authorizationSHA256"])
            + "') FROM jpdb_snapshots WHERE snapshot_id=@snapshot_id;"
        ),
    ]
    tables = dict(manifest["tables"])
    for spec in TABLE_SPECS:
        metadata = dict(tables[spec.export_name])
        fields, setters = load_columns(spec)
        lines.extend(
            [
                f"CREATE TEMPORARY TABLE stg_{spec.export_name} LIKE {spec.target};",
                (
                    f"LOAD DATA LOCAL INFILE '__LOAD_DIR__/{spec.export_name}.tsv' INTO TABLE stg_{spec.export_name} "
                    "CHARACTER SET utf8mb4 FIELDS TERMINATED BY '\\t' ESCAPED BY '\\\\' "
                    f"LINES TERMINATED BY '\\n' ({fields})" + (f" SET {setters};" if setters else ";")
                ),
                "INSERT INTO load_assertions VALUES (@@warning_count=0);",
                (
                    f"INSERT INTO {spec.target} SELECT * FROM stg_{spec.export_name} WHERE @already_published=0;"
                    if spec.snapshot_scoped
                    else (
                        f"INSERT INTO {spec.target} SELECT * FROM (SELECT * FROM stg_{spec.export_name}) AS new "
                        "ON DUPLICATE KEY UPDATE document_sha=IF("
                        f"{spec.target}.schema_name=new.schema_name AND "
                        f"{spec.target}.schema_version=new.schema_version AND "
                        f"{spec.target}.route_type=new.route_type AND "
                        f"{spec.target}.canonical_json=new.canonical_json,"
                        f"{spec.target}.document_sha,NULL);"
                    )
                ),
                "INSERT INTO load_assertions VALUES (@@warning_count=0);",
                (
                    "INSERT INTO jpdb_snapshot_table_manifests "
                    f"SELECT @snapshot_id,'{spec.export_name}',{metadata['rows']},UNHEX('{metadata['sha256']}') "
                    "WHERE @already_published=0;"
                ),
                (
                    "INSERT INTO load_assertions SELECT COUNT(*)=1 AND "
                    f"COALESCE(MAX(row_count),0)={metadata['rows']} AND "
                    f"COALESCE(MAX(content_sha),X'00')=UNHEX('{metadata['sha256']}') "
                    "FROM jpdb_snapshot_table_manifests WHERE snapshot_id=@snapshot_id "
                    f"AND table_name='{spec.export_name}';"
                ),
            ]
        )
        if spec.snapshot_scoped:
            lines.append(
                f"INSERT INTO load_assertions SELECT COUNT(*)={metadata['rows']} FROM {spec.target} WHERE snapshot_id=@snapshot_id;"
            )
    lines.extend(
        [
            "UPDATE jpdb_snapshots SET state='validated',validated_at=UTC_TIMESTAMP(6) WHERE snapshot_id=@snapshot_id AND @already_published=0;",
            "INSERT INTO jpdb_current_snapshot SELECT 'jpdb',@snapshot_id,UTC_TIMESTAMP(6) WHERE @already_published=0 ON DUPLICATE KEY UPDATE snapshot_id=VALUES(snapshot_id),switched_at=VALUES(switched_at);",
            "UPDATE jpdb_snapshots SET state='published',published_at=UTC_TIMESTAMP(6) WHERE snapshot_id=@snapshot_id AND @already_published=0;",
            "COMMIT;",
            "SELECT RELEASE_LOCK('zenbu.jpdb.mysql-load');",
            "",
        ]
    )
    return "\n".join(lines)


def mysql_command(arguments: argparse.Namespace, *, local_infile: bool = False) -> list[str]:
    if any(option == "-p" or option.startswith("--password") for option in arguments.mysql_arg):
        raise ValueError("do not pass passwords on the command line; use a MySQL login path")
    login_paths = [option for option in arguments.mysql_arg if option.startswith("--login-path=")]
    if len(login_paths) > 1:
        raise ValueError("pass at most one MySQL login path")
    remaining = [option for option in arguments.mysql_arg if option not in login_paths]
    # mysql requires --login-path to precede every other option.
    command = [arguments.mysql_binary, *login_paths, "--batch", "--skip-column-names"]
    if local_infile:
        command.append("--local-infile=1")
    command.extend(remaining)
    command.append(arguments.database)
    return command


def run_mysql(arguments: argparse.Namespace, sql: str, *, local_infile: bool = False) -> str:
    result = subprocess.run(
        mysql_command(arguments, local_infile=local_infile),
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "mysql command failed")
    return result.stdout.strip()


def migrate(arguments: argparse.Namespace) -> None:
    for migration in sorted(MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql")):
        version = int(migration.name.split("_", 1)[0])
        checksum = file_sha256(migration)
        exists = run_mysql(
            arguments,
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='schema_migrations';",
        )
        if exists == "1":
            applied = run_mysql(arguments, f"SELECT HEX(checksum) FROM schema_migrations WHERE version={version};")
            if applied:
                if applied.casefold() != checksum:
                    raise ValueError(f"migration checksum mismatch: {migration.name}")
                continue
        run_mysql(
            arguments,
            migration.read_text(encoding="utf-8")
            + f"\nINSERT INTO schema_migrations VALUES ({version},UNHEX('{checksum}'),UTC_TIMESTAMP(6));\n",
        )


def mysql_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "''")


def load(arguments: argparse.Namespace) -> None:
    export_dir = arguments.export.resolve()
    manifest_path = export_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != EXPORT_SCHEMA:
        raise ValueError("unsupported MySQL export manifest")
    if not manifest.get("snapshotComplete"):
        raise ValueError("refusing to publish an incomplete MySQL snapshot")
    tables = dict(manifest["tables"])
    expected_names = {spec.export_name for spec in TABLE_SPECS}
    if set(tables) != expected_names:
        raise ValueError("MySQL export manifest table set does not match the loader")
    for name, metadata in tables.items():
        path = export_dir / f"{name}.tsv"
        if file_sha256(path) != metadata["sha256"]:
            raise ValueError(f"staging checksum mismatch: {name}")
    sql = build_load_sql(manifest)
    if (export_dir / "load.sql.template").read_text(encoding="utf-8") != sql:
        raise ValueError("load SQL template does not match the verified manifest")
    sql = sql.replace("__LOAD_DIR__", mysql_quote(str(export_dir)))
    sql = sql.replace("__EXTRACT_ROOT_URI__", mysql_quote(arguments.extract_root_uri))
    run_mysql(arguments, sql, local_infile=True)


def add_mysql_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--mysql-binary", default="mysql")
    parser.add_argument("--mysql-arg", action="append", default=[], help="Repeat; use --mysql-arg=--login-path=name")
    parser.add_argument("--database", required=True)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    export_parser = commands.add_parser("export")
    export_parser.add_argument("--sqlite", type=Path, required=True)
    export_parser.add_argument("--artifact-manifest", type=Path, required=True)
    export_parser.add_argument("--snapshot", type=Path, required=True)
    export_parser.add_argument("--output", type=Path, required=True)
    export_parser.add_argument("--allow-incomplete", action="store_true")
    migrate_parser = commands.add_parser("migrate")
    add_mysql_arguments(migrate_parser)
    load_parser = commands.add_parser("load")
    add_mysql_arguments(load_parser)
    load_parser.add_argument("--export", type=Path, required=True)
    load_parser.add_argument("--extract-root-uri", required=True)
    return result


def main() -> None:
    arguments = parser().parse_args()
    if arguments.command == "export":
        export_warehouse(arguments)
    elif arguments.command == "migrate":
        migrate(arguments)
    else:
        load(arguments)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError, sqlite3.Error, RuntimeError) as error:
        print(f"JPDB MySQL warehouse failed: {error}", file=sys.stderr)
        raise SystemExit(1)
