#!/usr/bin/env python3
"""Audit integrity and typed-field completeness of a JPDB structured checkpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import zlib
from collections import Counter
from pathlib import Path

import jpdb_extract


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def audit(root: Path) -> dict[str, object]:
    database = sqlite3.connect(f"file:{root / 'checkpoint.sqlite'}?mode=ro", uri=True)
    routes: Counter[str] = Counter()
    typed_rows: Counter[str] = Counter()
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    try:
        queue = dict(database.execute("SELECT state,count(*) FROM queue GROUP BY state"))
        rows = database.execute(
            "SELECT url,extracted_byte_count,extracted_sha256,extracted_compression,extraction_schema "
            "FROM responses ORDER BY url"
        )
        for url, byte_count, digest, compression, schema in rows:
            path = root / "structured" / "sha256" / str(digest)[:2] / str(digest)[2:]
            try:
                stored = path.read_bytes()
                payload = zlib.decompress(stored) if compression == "zlib" else stored
                if len(payload) != int(byte_count) or hashlib.sha256(payload).hexdigest() != digest:
                    raise ValueError("byte count or SHA-256 mismatch")
                document = json.loads(payload)
            except (OSError, ValueError, zlib.error, json.JSONDecodeError) as error:
                errors.append({"url": str(url), "error": f"document integrity: {error}"})
                continue
            if document.get("schema") != schema or schema != jpdb_extract.EXTRACT_SCHEMA:
                errors.append({"url": str(url), "error": "extraction schema mismatch"})
            unhashed = dict(document)
            observed_content = str(unhashed.pop("contentSHA256", ""))
            if jpdb_extract.sha256_text(canonical_json(unhashed)) != observed_content:
                errors.append({"url": str(url), "error": "semantic content SHA-256 mismatch"})
            route = str(document.get("routeType", "missing"))
            routes[route] += 1
            unparsed = list(document.get("unparsedEvidence") or [])
            if unparsed:
                typed_rows["unparsedSections"] += len(unparsed)
            if route == "difficulty-index":
                listing = document.get("range") or {}
                entries = list(document.get("entries") or [])
                if not all(isinstance(listing.get(key), int) for key in ("start", "end", "total")):
                    errors.append({"url": str(url), "error": "missing difficulty range"})
                elif len(entries) != listing["end"] - listing["start"] + 1:
                    errors.append({"url": str(url), "error": "difficulty row count differs from range"})
                if len({(entry.get("category"), entry.get("id")) for entry in entries}) != len(entries):
                    errors.append({"url": str(url), "error": "duplicate media identity on difficulty page"})
                typed_rows["difficultyEntries"] += len(entries)
            elif route == "media-detail":
                media = document.get("media") or {}
                if (
                    not media.get("category")
                    or media.get("id") is None
                    or "slug" not in media
                ):
                    errors.append({"url": str(url), "error": "missing media identity"})
                typed_rows["decks"] += len(document.get("decks") or [])
            elif route == "media-stats":
                statistics = document.get("statistics") or {}
                coverage = list(statistics.get("coverage") or [])
                histogram = list(statistics.get("difficultyHistogram") or [])
                if not coverage:
                    errors.append({"url": str(url), "error": "missing coverage statistics"})
                if not histogram:
                    errors.append({"url": str(url), "error": "missing difficulty histogram"})
                typed_rows["coverageRows"] += len(coverage)
                typed_rows["histogramBins"] += len(histogram)
            elif route == "vocabulary-list":
                listing = document.get("range") or {}
                vocabulary = list(document.get("vocabulary") or [])
                start, end = listing.get("start"), listing.get("end")
                if not all(isinstance(listing.get(key), int) for key in ("start", "end", "total")):
                    errors.append({"url": str(url), "error": "missing vocabulary-list range"})
                elif len(vocabulary) != end - start + 1:
                    errors.append({"url": str(url), "error": "vocabulary-list row count differs from range"})
                typed_rows["deckVocabularyRows"] += len(vocabulary)
            elif route == "vocabulary-detail":
                vocabulary = document.get("vocabulary") or {}
                if vocabulary.get("vid") is None or not vocabulary.get("forms"):
                    errors.append({"url": str(url), "error": "missing vocabulary identity or forms"})
                if not vocabulary.get("meanings"):
                    warnings.append({"url": str(url), "warning": "vocabulary has no extracted meanings"})
                typed_rows["meanings"] += len(vocabulary.get("meanings") or [])
                typed_rows["frequencies"] += len(vocabulary.get("frequencies") or [])
                typed_rows["examples"] += len(vocabulary.get("examples") or [])
            elif route == "vocabulary-appearances":
                typed_rows["mediaAppearances"] += len(
                    (document.get("vocabulary") or {}).get("appearances") or []
                )
            elif route == "kanji-detail":
                kanji = document.get("kanji") or {}
                if not kanji.get("character"):
                    errors.append({"url": str(url), "error": "missing kanji identity"})
                typed_rows["kanjiReadings"] += len(kanji.get("readings") or [])
                typed_rows["kanjiComponents"] += len(kanji.get("components") or [])
            elif route == "kanji-reading":
                reading = document.get("kanjiReading") or {}
                vocabulary = list(reading.get("vocabulary") or [])
                if not reading.get("character") or not reading.get("reading"):
                    errors.append({"url": str(url), "error": "missing kanji-reading identity"})
                if reading.get("frequencyPercent") is None:
                    errors.append({"url": str(url), "error": "missing kanji-reading frequency"})
                if reading.get("usedInTotal") is not None and len(vocabulary) != reading["usedInTotal"]:
                    errors.append({"url": str(url), "error": "kanji-reading vocabulary count differs from total"})
                typed_rows["kanjiReadingVocabulary"] += len(vocabulary)
            elif route == "generic-public-page" and str(url).rstrip("/") != "https://jpdb.io":
                warnings.append({"url": str(url), "warning": "unexpected generic public page"})
    finally:
        database.close()
    return {
        "schema": "zenbu.jpdb-structured-audit.v1",
        "queue": {str(key): int(value) for key, value in sorted(queue.items())},
        "routes": dict(sorted(routes.items())),
        "typedRows": dict(sorted(typed_rows.items())),
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "errors": errors,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--allow-incomplete", action="store_true")
    parser.add_argument("--max-details", type=int, default=20)
    arguments = parser.parse_args()
    result = audit(arguments.snapshot)
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(canonical_json(result) + "\n", encoding="utf-8")
    displayed = dict(result)
    displayed["errors"] = result["errors"][: max(0, arguments.max_details)]
    displayed["warnings"] = result["warnings"][: max(0, arguments.max_details)]
    print(json.dumps(displayed, ensure_ascii=False, indent=2))
    if result["errorCount"] or (not arguments.allow_incomplete and result["queue"].get("pending", 0)):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
