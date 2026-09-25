#!/usr/bin/env python3
"""Acquire an owner-authorized JPDB public snapshot into an external cache.

The cache is append-only and content addressed. A SQLite checkpoint makes the
crawl resumable; importing the snapshot never needs network access.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import http.client
import json
import math
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import zlib
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable

import jpdb_extract


SNAPSHOT_SCHEMA = "zenbu.jpdb-structured-snapshot.v2"
CANONICALIZATION_SCHEMA = "jpdb.public-url.v3"
USER_AGENT = "ZenbuJapanese-JPDB-Importer/1.0 (+owner-authorized)"
DEFAULT_PATHS = (
    re.compile(r"^/$"),
    re.compile(r"^/(anime|novel|visual-novel|web-novel|live-action)-difficulty-list$"),
    re.compile(r"^/vocabulary/\d+/"),
    re.compile(r"^/kanji/[^/]+"),
    re.compile(r"^/kanji-reading/[^/]+/[^/]+"),
    re.compile(r"^/(anime|novel|visual-novel|web-novel|live-action|video-game)/\d+/"),
)
DIFFICULTY_FAMILIES = ("anime", "novel", "visual-novel", "web-novel", "live-action")
MEDIA_PATH_FOR_DISCOVERY = re.compile(
    r"^/(anime|novel|visual-novel|web-novel|live-action|video-game)/(\d+)/[^/]+"
)


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def source_blob_path(snapshot_root: Path, digest: str) -> Path:
    return snapshot_root / "structured" / "sha256" / digest[:2] / digest[2:]


def structured_document_bytes(snapshot_root: Path, digest: str) -> bytes:
    return zlib.decompress(source_blob_path(snapshot_root, digest).read_bytes())


def canonical_url(url: str, origin: str) -> str | None:
    absolute = urllib.parse.urljoin(origin, url)
    parsed = urllib.parse.urlsplit(absolute)
    expected = urllib.parse.urlsplit(origin)
    if parsed.scheme != expected.scheme or parsed.netloc != expected.netloc:
        return None
    path = urllib.parse.quote(urllib.parse.unquote(parsed.path or "/"), safe="/:@-._~")
    raw_query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query: list[tuple[str, str]] = []
    if re.match(r"^/(?:anime|novel|visual-novel|web-novel|live-action)-difficulty-list$", path):
        offsets = [value for key, value in raw_query if key == "offset"]
        if offsets:
            try:
                offset = int(offsets[-1])
            except ValueError:
                return None
            if offset < 0:
                return None
            if offset:
                query.append(("offset", str(offset)))
    elif path.endswith("/vocabulary-list"):
        offsets = [value for key, value in raw_query if key == "offset"]
        if offsets:
            try:
                offset = int(offsets[-1])
            except ValueError:
                return None
            if offset < 0:
                return None
            if offset:
                query.append(("offset", str(offset)))
        query.append(("page_size", "100"))
    elif re.match(r"^/vocabulary/\d+/", path):
        expands = sorted(
            {value for key, value in raw_query if key == "expand" and value in {"v", "e"}}
        )
        query.extend(("expand", value) for value in expands)
    elif re.match(r"^/kanji/[^/]+", path):
        expands = sorted(
            {value for key, value in raw_query if key == "expand" and value in {"k", "v", "e"}}
        )
        query.extend(("expand", value) for value in expands)
    return urllib.parse.urlunsplit(
        (expected.scheme, expected.netloc, path, urllib.parse.urlencode(query), "")
    )


def allowed_url(url: str, origin: str) -> bool:
    parsed = urllib.parse.urlsplit(url)
    expected = urllib.parse.urlsplit(origin)
    if parsed.scheme != expected.scheme or parsed.netloc != expected.netloc:
        return False
    return any(pattern.match(parsed.path) for pattern in DEFAULT_PATHS)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.text_parts: list[str] = []
        self.canonical: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        href = attributes.get("href")
        if tag == "a" and href:
            self.links.append(href)
        if tag == "link" and "canonical" in attributes.get("rel", "").split() and href:
            self.canonical = href

    def handle_data(self, data: str) -> None:
        self.text_parts.append(data)

    @property
    def text(self) -> str:
        return " ".join(" ".join(self.text_parts).split())


def response_schema(content_type: str, body: bytes) -> str:
    if "html" not in content_type.lower():
        return canonical_json({"contentType": content_type})
    text = body.decode("utf-8", errors="replace")
    parser = LinkParser()
    parser.feed(text)
    markers = sorted(set(re.findall(r'class=["\']([^"\']+)["\']', text)))
    return canonical_json(
        {
            "canonicalURL": parser.canonical,
            "contentType": content_type,
            "htmlClasses": markers,
            "schema": "jpdb.public-html.v1",
        }
    )


class BufferedHTTPResponse:
    def __init__(self, url: str, status: int, headers: object, body: bytes) -> None:
        self.url = url
        self.status = status
        self.headers = headers
        self.body = body

    def __enter__(self) -> "BufferedHTTPResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self, limit: int) -> bytes:
        return self.body[:limit]


class PooledHTTPXOpener:
    def __init__(self, concurrency: int) -> None:
        try:
            import httpx
        except ImportError as error:
            raise ValueError(
                "the pooled client requires httpx; install apps/ios/Tools/requirements-jpdb.txt"
            ) from error
        self.httpx = httpx
        self.client = httpx.Client(
            follow_redirects=True,
            limits=httpx.Limits(
                max_connections=max(1, concurrency),
                max_keepalive_connections=max(1, concurrency),
            ),
        )

    def close(self) -> None:
        self.client.close()

    def __call__(self, request: urllib.request.Request, timeout: float) -> BufferedHTTPResponse:
        try:
            response = self.client.get(
                request.full_url,
                headers=dict(request.header_items()),
                timeout=timeout,
            )
        except self.httpx.HTTPError as error:
            raise urllib.error.URLError(str(error)) from error
        if response.status_code >= 400:
            raise urllib.error.HTTPError(
                str(response.url),
                response.status_code,
                response.reason_phrase,
                response.headers,
                None,
            )
        return BufferedHTTPResponse(
            str(response.url), response.status_code, response.headers, response.content
        )


def read_authorization(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    required = ("schema", "authorizedBy", "authorizedAt", "scope", "redistributionAllowed")
    missing = [key for key in required if key not in value]
    if missing:
        raise ValueError(f"authorization record missing: {', '.join(missing)}")
    if value["schema"] != "zenbu.jpdb-authorization.v1":
        raise ValueError("unsupported authorization record schema")
    if not isinstance(value["redistributionAllowed"], bool):
        raise ValueError("authorization redistributionAllowed must be boolean")
    if "allowedOrigins" in value and not isinstance(value["allowedOrigins"], list):
        raise ValueError("authorization allowedOrigins must be an array")
    if not str(value["authorizedBy"]).strip() or not str(value["scope"]).strip():
        raise ValueError("authorization owner and scope must be non-empty")
    return value


def read_seeds(path: Path, origin: str) -> tuple[list[str], dict[str, int], str]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema") != "zenbu.jpdb-seeds.v1":
        raise ValueError("unsupported seed manifest schema")
    seeds: list[str] = []
    for raw in value.get("urls", []):
        url = canonical_url(str(raw), origin)
        if url is None or not allowed_url(url, origin):
            raise ValueError(f"seed URL is outside the approved public surface: {raw}")
        seeds.append(url)
    if not seeds:
        raise ValueError("seed manifest contains no URLs")
    discovery_mode = str(value.get("discoveryMode", "explicit-inventory-v1"))
    expected = {str(key): int(count) for key, count in value.get("expected", {}).items()}
    if discovery_mode == "public-frontend-closure-v1":
        if expected:
            raise ValueError("frontend closure discovers counts; do not also provide expected counts")
        return sorted(set(seeds)), {}, discovery_mode
    if discovery_mode != "explicit-inventory-v1":
        raise ValueError("unsupported discovery mode")
    required_expected = {"responses", "vocabulary", "kanji", "media"}
    if set(expected) != required_expected:
        raise ValueError(f"expected counts must contain exactly: {', '.join(sorted(required_expected))}")
    if any(count < 0 for count in expected.values()) or expected["responses"] == 0 or expected["vocabulary"] == 0:
        raise ValueError("replace placeholder expected counts with the owner-known record inventory")
    return sorted(set(seeds)), expected, discovery_mode


def is_kanji(character: str) -> bool:
    name = unicodedata.name(character, "")
    return name.startswith("CJK UNIFIED IDEOGRAPH-") or name.startswith("CJK COMPATIBILITY IDEOGRAPH-")


def frontend_closure(rows: list[dict[str, object]], snapshot_root: Path, origin: str) -> dict[str, object]:
    listings: dict[str, dict[str, object]] = {}
    media_pages: dict[str, bool] = {}
    for row in rows:
        final_url = str(row["finalURL"])
        path = urllib.parse.urlsplit(final_url).path
        document = json.loads(structured_document_bytes(snapshot_root, str(row["extractedSHA256"])))
        route_type = document.get("routeType")
        if route_type == "difficulty-index":
            range_value = document.get("range") or {}
            record = listings.setdefault(
                path, {"kind": "difficulty", "expected": None, "ranges": [], "ids": set(), "positions": set()}
            )
            total = range_value.get("total")
            if isinstance(total, int):
                record["expected"] = total if record["expected"] in (None, total) else -1
            if isinstance(range_value.get("start"), int) and isinstance(range_value.get("end"), int):
                record["ranges"].append((range_value["start"], range_value["end"]))
            record["ids"].update(str(entry["id"]) for entry in document.get("entries", []) if "id" in entry)
        elif route_type == "vocabulary-list":
            range_value = document.get("range") or {}
            record = listings.setdefault(
                path, {"kind": "vocabulary", "expected": None, "ranges": [], "ids": set(), "positions": set()}
            )
            total = range_value.get("total")
            if isinstance(total, int):
                record["expected"] = total if record["expected"] in (None, total) else -1
            if isinstance(range_value.get("start"), int) and isinstance(range_value.get("end"), int):
                record["ranges"].append((range_value["start"], range_value["end"]))
            for item in document.get("vocabulary", []):
                if "vid" in item:
                    record["ids"].add(str(item["vid"]))
                if isinstance(item.get("position"), int):
                    record["positions"].add(item["position"])
        elif route_type == "media-detail":
            media = document.get("media") or {}
            if media.get("category") and media.get("id") is not None:
                media_key = f"{media['category']}:{media['id']}"
                media_pages[media_key] = media_pages.get(media_key, False) or bool(document.get("decks"))

    normalized_listings: dict[str, object] = {}
    indexed_media_pages: set[str] = set()
    closed = True
    missing_families: list[str] = []
    for family in DIFFICULTY_FAMILIES:
        if f"/{family}-difficulty-list" not in listings:
            missing_families.append(family)
            closed = False
    for path, record in sorted(listings.items()):
        expected = record["expected"]
        ranges = sorted(record["ranges"])
        covered = set()
        for start, end in ranges:
            covered.update(range(start, end + 1))
        ids = record["ids"]
        difficulty_match = re.match(
            r"^/(anime|novel|visual-novel|web-novel|live-action)-difficulty-list$", path
        )
        if difficulty_match:
            indexed_media_pages.update(f"{difficulty_match.group(1)}:{identifier}" for identifier in ids)
        positions = record["positions"]
        observed_count = len(ids) if record["kind"] == "difficulty" else len(positions)
        listing_closed = isinstance(expected, int) and expected >= 0 and len(covered) == expected and observed_count == expected
        closed = closed and listing_closed
        normalized_listings[path] = {
            "expected": expected,
            "observedIDs": len(ids),
            "observedPositions": len(positions),
            "coveredPositions": len(covered),
            "closed": listing_closed,
        }
    missing_media_pages = sorted(indexed_media_pages - set(media_pages))
    media_without_lists = sorted(key for key, has_list in media_pages.items() if not has_list)
    closed = closed and not missing_media_pages and not media_without_lists
    return {
        "schema": "zenbu.jpdb-public-frontend-closure.v1",
        "closed": closed,
        "missingDifficultyFamilies": missing_families,
        "mediaPages": len(media_pages),
        "missingMediaPages": missing_media_pages,
        "mediaWithoutVocabularyLists": media_without_lists,
        "listings": normalized_listings,
        "guarantee": "All media and vocabulary exposed by the five public difficulty indexes, plus kanji derived from their vocabulary and recursively linked public kanji pages.",
        "notGuaranteed": [
            "Vocabulary absent from every public indexed media deck",
            "Kanji disconnected from discovered vocabulary and recursively linked kanji pages",
            "Media categories without a public difficulty index",
        ],
    }


class SnapshotStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.blobs = root / "structured" / "sha256"
        root.mkdir(parents=True, exist_ok=True)
        self.database = sqlite3.connect(root / "checkpoint.sqlite")
        self.database.execute("PRAGMA foreign_keys=ON")
        self.database.executescript(
            "CREATE TABLE IF NOT EXISTS queue ("
            "url TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('pending','done','failed')), "
            "discovered_from TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT);"
            "CREATE TABLE IF NOT EXISTS responses ("
            "url TEXT PRIMARY KEY REFERENCES queue(url), final_url TEXT NOT NULL, "
            "retrieved_at TEXT NOT NULL, status INTEGER NOT NULL, content_type TEXT NOT NULL, "
            "source_byte_count INTEGER NOT NULL, source_sha256 TEXT NOT NULL, "
            "extracted_byte_count INTEGER NOT NULL, extracted_sha256 TEXT NOT NULL, "
            "extracted_compression TEXT NOT NULL, etag TEXT, last_modified TEXT, extraction_schema TEXT NOT NULL);"
            "CREATE INDEX IF NOT EXISTS queue_state_url ON queue(state, url);"
            "CREATE TABLE IF NOT EXISTS acquisition_context (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;"
            "CREATE TABLE IF NOT EXISTS throttle_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1),"
            "rate REAL NOT NULL,concurrency INTEGER NOT NULL,reductions INTEGER NOT NULL,"
            "recoveries INTEGER NOT NULL,transient_signals INTEGER NOT NULL);"
            "CREATE TABLE IF NOT EXISTS throttle_events (id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "recorded_at TEXT NOT NULL,event TEXT NOT NULL,reason TEXT NOT NULL,"
            "prior_rate REAL NOT NULL,new_rate REAL NOT NULL,prior_concurrency INTEGER NOT NULL,"
            "new_concurrency INTEGER NOT NULL);"
            "CREATE TABLE IF NOT EXISTS circuit_breaker_state ("
            "singleton INTEGER PRIMARY KEY CHECK(singleton=1),cooldown_until REAL NOT NULL DEFAULT 0,"
            "reason TEXT NOT NULL DEFAULT '',consecutive_minimum_signals INTEGER NOT NULL DEFAULT 0,"
            "trips INTEGER NOT NULL DEFAULT 0);"
            "CREATE TABLE IF NOT EXISTS circuit_breaker_events (id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "recorded_at TEXT NOT NULL,event TEXT NOT NULL,reason TEXT NOT NULL,"
            "cooldown_until REAL NOT NULL);"
            "INSERT OR IGNORE INTO circuit_breaker_state VALUES (1,0,'',0,0);"
        )

    def close(self) -> None:
        self.database.close()

    def enqueue(self, url: str, discovered_from: str | None = None) -> None:
        self.enqueue_many([url], discovered_from)

    def enqueue_many(self, urls: list[str], discovered_from: str | None = None) -> None:
        self.database.executemany(
            "INSERT OR IGNORE INTO queue(url,state,discovered_from) VALUES (?, 'pending', ?)",
            ((url, discovered_from) for url in sorted(set(urls))),
        )
        self.database.commit()

    def bind_context(self, values: dict[str, str]) -> None:
        existing = dict(self.database.execute("SELECT key,value FROM acquisition_context"))
        if existing and existing != values:
            raise ValueError("snapshot checkpoint belongs to different origin, authorization, or seeds")
        if not existing:
            self.database.executemany(
                "INSERT INTO acquisition_context VALUES (?,?)", sorted(values.items())
            )
            self.database.commit()

    def next_url(self) -> str | None:
        row = self.database.execute(
            "SELECT url FROM queue WHERE state='pending' ORDER BY url LIMIT 1"
        ).fetchone()
        return str(row[0]) if row else None

    def pending_urls(self, limit: int) -> list[str]:
        return [
            str(row[0])
            for row in self.database.execute(
                "SELECT url FROM queue WHERE state='pending' ORDER BY "
                "CASE "
                "WHEN url LIKE '%-difficulty-list%' THEN 0 "
                "WHEN url LIKE '%/vocabulary-list%' THEN 3 "
                "WHEN url LIKE '%/vocabulary/%/used-in%' THEN 5 "
                "WHEN url LIKE '%/vocabulary/%' THEN 4 "
                "WHEN url LIKE '%/kanji/%' THEN 6 "
                "WHEN url LIKE '%/kanji-reading/%' THEN 7 "
                "WHEN url LIKE '%/stats' THEN 2 "
                "WHEN url LIKE '%/anime/%' OR url LIKE '%/novel/%' "
                "OR url LIKE '%/visual-novel/%' OR url LIKE '%/web-novel/%' "
                "OR url LIKE '%/live-action/%' OR url LIKE '%/video-game/%' THEN 1 "
                "ELSE 0 END,url LIMIT ?",
                (limit,),
            )
        ]

    def attempts(self, url: str) -> int:
        row = self.database.execute("SELECT attempts FROM queue WHERE url=?", (url,)).fetchone()
        return int(row[0]) if row else 0

    def record_failure(self, url: str, error: str, terminal: bool) -> None:
        self.database.execute(
            "UPDATE queue SET attempts=attempts+1,state=?,last_error=? WHERE url=?",
            ("failed" if terminal else "pending", error[:2000], url),
        )
        self.database.commit()

    def record_response(
        self,
        url: str,
        final_url: str,
        retrieved_at: str,
        status: int,
        headers: object,
        body: bytes,
        extracted: dict[str, object],
    ) -> str:
        extracted_bytes = (canonical_json(extracted) + "\n").encode("utf-8")
        compressed = zlib.compress(extracted_bytes, level=9)
        digest = sha256_bytes(extracted_bytes)
        destination = self.blobs / digest[:2] / digest[2:]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() and zlib.decompress(destination.read_bytes()) != extracted_bytes:
            raise ValueError(f"content-address collision for {digest}")
        if not destination.exists():
            temporary = destination.with_suffix(".tmp")
            temporary.write_bytes(compressed)
            temporary.replace(destination)
        content_type = str(headers.get("Content-Type", "application/octet-stream"))
        self.database.execute(
            "INSERT OR REPLACE INTO responses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                url,
                final_url,
                retrieved_at,
                status,
                content_type,
                len(body),
                sha256_bytes(body),
                len(extracted_bytes),
                digest,
                "zlib",
                headers.get("ETag"),
                headers.get("Last-Modified"),
                str(extracted.get("schema", "")),
            ),
        )
        self.database.execute(
            "UPDATE queue SET state='done',attempts=attempts+1,last_error=NULL WHERE url=?", (url,)
        )
        self.database.commit()
        return digest

    def counts(self) -> dict[str, int]:
        return {
            str(state): int(count)
            for state, count in self.database.execute(
                "SELECT state,count(*) FROM queue GROUP BY state ORDER BY state"
            )
        }

    def snapshot_rows(self) -> list[dict[str, object]]:
        return [
            {
                "url": row[0],
                "finalURL": row[1],
                "retrievedAt": row[2],
                "status": row[3],
                "contentType": row[4],
                "sourceBytes": row[5],
                "sourceSHA256": row[6],
                "extractedBytes": row[7],
                "extractedSHA256": row[8],
                "extractedCompression": row[9],
                "etag": row[10],
                "lastModified": row[11],
                "extractionSchema": row[12],
                "attempts": row[13],
                "discoveredFrom": row[14],
            }
            for row in self.database.execute(
                "SELECT url,final_url,retrieved_at,status,content_type,source_byte_count,source_sha256,"
                "extracted_byte_count,extracted_sha256,extracted_compression,etag,last_modified,extraction_schema,"
                "queue.attempts,queue.discovered_from "
                "FROM responses JOIN queue USING(url) ORDER BY url"
            )
        ]

    def failures(self) -> list[dict[str, object]]:
        return [
            {"url": url, "attempts": attempts, "error": error}
            for url, attempts, error in self.database.execute(
                "SELECT url,attempts,last_error FROM queue WHERE state='failed' ORDER BY url"
            )
        ]

    def throttle_state(self) -> dict[str, object] | None:
        row = self.database.execute(
            "SELECT rate,concurrency,reductions,recoveries,transient_signals "
            "FROM throttle_state WHERE singleton=1"
        ).fetchone()
        if not row:
            return None
        return {
            "rate": row[0],
            "concurrency": row[1],
            "reductions": row[2],
            "recoveries": row[3],
            "transient_signals": row[4],
        }

    def record_throttle_event(
        self,
        event: str,
        reason: str,
        prior_rate: float,
        prior_concurrency: int,
        throttle: "AdaptiveThrottle",
    ) -> None:
        self.database.execute(
            "INSERT INTO throttle_events(recorded_at,event,reason,prior_rate,new_rate,"
            "prior_concurrency,new_concurrency) VALUES (?,?,?,?,?,?,?)",
            (
                dt.datetime.now(dt.timezone.utc).isoformat(),
                event,
                reason[:1000],
                prior_rate,
                throttle.rate,
                prior_concurrency,
                throttle.concurrency,
            ),
        )
        self.database.execute(
            "INSERT OR REPLACE INTO throttle_state VALUES (1,?,?,?,?,?)",
            (
                throttle.rate,
                throttle.concurrency,
                throttle.reductions,
                throttle.recoveries,
                throttle.transient_signals,
            ),
        )
        self.database.commit()

    def throttle_events(self) -> list[dict[str, object]]:
        return [
            {
                "recordedAt": row[0],
                "event": row[1],
                "reason": row[2],
                "priorRate": row[3],
                "newRate": row[4],
                "priorConcurrency": row[5],
                "newConcurrency": row[6],
            }
            for row in self.database.execute(
                "SELECT recorded_at,event,reason,prior_rate,new_rate,prior_concurrency,"
                "new_concurrency FROM throttle_events ORDER BY id"
            )
        ]

    def circuit_breaker_state(self, now: float) -> dict[str, object]:
        row = self.database.execute(
            "SELECT cooldown_until,reason,consecutive_minimum_signals,trips "
            "FROM circuit_breaker_state WHERE singleton=1"
        ).fetchone()
        deadline = float(row[0]) if row else 0.0
        return {
            "active": deadline > now,
            "cooldownUntilEpoch": deadline,
            "cooldownUntil": (
                dt.datetime.fromtimestamp(deadline, dt.timezone.utc).isoformat()
                if deadline > 0 else None
            ),
            "reason": str(row[1]) if row else "",
            "consecutiveMinimumSignals": int(row[2]) if row else 0,
            "trips": int(row[3]) if row else 0,
        }

    def record_connection_pressure(
        self,
        now: float,
        reason: str,
        at_minimum: bool,
        threshold: int,
        cooldown_seconds: float,
    ) -> bool:
        state = self.circuit_breaker_state(now)
        signals = int(state["consecutiveMinimumSignals"]) + 1 if at_minimum else 0
        opened = at_minimum and signals >= threshold
        deadline = max(float(state["cooldownUntilEpoch"]), now + cooldown_seconds) if opened else float(state["cooldownUntilEpoch"])
        trips = int(state["trips"]) + int(opened)
        self.database.execute(
            "UPDATE circuit_breaker_state SET cooldown_until=?,reason=?,"
            "consecutive_minimum_signals=?,trips=? WHERE singleton=1",
            (deadline, reason[:1000] if opened else str(state["reason"]), 0 if opened else signals, trips),
        )
        if opened:
            self.database.execute(
                "INSERT INTO circuit_breaker_events(recorded_at,event,reason,cooldown_until) "
                "VALUES (?,?,?,?)",
                (
                    dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat(),
                    "opened",
                    reason[:1000],
                    deadline,
                ),
            )
        self.database.commit()
        return opened

    def reset_connection_pressure(self) -> None:
        cursor = self.database.execute(
            "UPDATE circuit_breaker_state SET consecutive_minimum_signals=0 "
            "WHERE singleton=1 AND consecutive_minimum_signals<>0"
        )
        if cursor.rowcount:
            self.database.commit()

    def close_circuit_breaker(self, now: float) -> None:
        state = self.circuit_breaker_state(now)
        deadline = float(state["cooldownUntilEpoch"])
        if deadline <= 0 or deadline > now:
            return
        self.database.execute(
            "UPDATE circuit_breaker_state SET cooldown_until=0,reason='' WHERE singleton=1"
        )
        self.database.execute(
            "INSERT INTO circuit_breaker_events(recorded_at,event,reason,cooldown_until) "
            "VALUES (?,?,?,0)",
            (
                dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat(),
                "closed",
                str(state["reason"]),
            ),
        )
        self.database.commit()

    def circuit_breaker_events(self) -> list[dict[str, object]]:
        return [
            {
                "recordedAt": recorded_at,
                "event": event,
                "reason": reason,
                "cooldownUntilEpoch": cooldown_until,
            }
            for recorded_at, event, reason, cooldown_until in self.database.execute(
                "SELECT recorded_at,event,reason,cooldown_until "
                "FROM circuit_breaker_events ORDER BY id"
            )
        ]


def retry_delay(error: urllib.error.HTTPError, attempt: int) -> float:
    retry_after = error.headers.get("Retry-After") if error.headers else None
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            try:
                parsed = email.utils.parsedate_to_datetime(retry_after)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=dt.timezone.utc)
                return max(0.0, parsed.timestamp() - time.time())
            except (TypeError, ValueError, OverflowError):
                pass
    return min(300.0, float(2**attempt))


class AdaptiveThrottle:
    """Conservative additive-increase/multiplicative-decrease request control."""

    def __init__(
        self,
        rate_ceiling: float,
        concurrency_ceiling: int,
        enabled: bool,
        start_rate: float = 6.0,
        start_concurrency: int = 3,
        minimum_rate: float = 1.0,
        backoff_factor: float = 0.5,
        recovery_successes: int = 200,
        rate_step: float = 0.5,
    ) -> None:
        self.rate_ceiling = rate_ceiling
        self.concurrency_ceiling = concurrency_ceiling
        self.enabled = enabled
        self.minimum_rate = min(minimum_rate, rate_ceiling)
        self.backoff_factor = backoff_factor
        self.recovery_successes = recovery_successes
        self.rate_step = rate_step
        self.rate = min(rate_ceiling, start_rate) if enabled else rate_ceiling
        self.concurrency = (
            min(concurrency_ceiling, start_concurrency) if enabled else concurrency_ceiling
        )
        self.success_streak = 0
        self.initial_rate = self.rate
        self.initial_concurrency = self.concurrency
        self.reductions = 0
        self.recoveries = 0
        self.transient_signals = 0

    @property
    def interval(self) -> float:
        return 1.0 / self.rate

    @property
    def at_minimum(self) -> bool:
        return self.rate <= self.minimum_rate and self.concurrency == 1

    def record_success(self) -> bool:
        if not self.enabled:
            return False
        self.success_streak += 1
        if self.success_streak < self.recovery_successes:
            return False
        prior_rate = self.rate
        prior_concurrency = self.concurrency
        self.rate = min(self.rate_ceiling, self.rate + self.rate_step)
        desired_concurrency = max(1, math.ceil(self.rate / 2.0))
        if desired_concurrency > self.concurrency:
            self.concurrency = min(self.concurrency_ceiling, self.concurrency + 1)
        if self.rate != prior_rate or self.concurrency != prior_concurrency:
            self.recoveries += 1
            changed = True
        else:
            changed = False
        self.success_streak = 0
        return changed

    def record_transient_failure(self) -> bool:
        if not self.enabled:
            return False
        self.transient_signals += 1
        prior = (self.rate, self.concurrency)
        self.rate = max(self.minimum_rate, self.rate * self.backoff_factor)
        self.concurrency = max(1, self.concurrency - 1)
        self.success_streak = 0
        changed = prior != (self.rate, self.concurrency)
        if changed:
            self.reductions += 1
        return changed

    def restore(self, state: dict[str, object] | None) -> None:
        if not self.enabled or not state:
            return
        self.rate = min(
            self.rate_ceiling,
            max(self.minimum_rate, float(state.get("rate", self.rate))),
        )
        self.concurrency = min(
            self.concurrency_ceiling,
            max(1, int(state.get("concurrency", self.concurrency))),
        )
        self.reductions = int(state.get("reductions", 0))
        self.recoveries = int(state.get("recoveries", 0))
        self.transient_signals = int(state.get("transient_signals", 0))
        self.initial_rate = self.rate
        self.initial_concurrency = self.concurrency

    def report(self) -> dict[str, object]:
        return {
            "enabled": self.enabled,
            "rateCeiling": self.rate_ceiling,
            "concurrencyCeiling": self.concurrency_ceiling,
            "initialRate": self.initial_rate,
            "initialConcurrency": self.initial_concurrency,
            "minimumRate": self.minimum_rate,
            "finalRate": self.rate,
            "finalConcurrency": self.concurrency,
            "reductions": self.reductions,
            "recoveries": self.recoveries,
            "transientSignals": self.transient_signals,
        }


def next_request_after_pressure(
    next_request_at: float, now: float, throttle: AdaptiveThrottle
) -> float:
    return max(next_request_at, now + throttle.interval)


def fetch_response(
    url: str,
    arguments: argparse.Namespace,
    origin: str,
    opener: Callable[..., object],
    delay: float,
    sleeper: Callable[[float], None],
) -> tuple[str, str, int, object, bytes]:
    if delay > 0:
        sleeper(delay)
    request = urllib.request.Request(
        url,
        headers={"Accept": "text/html", "User-Agent": USER_AGENT},
        method="GET",
    )
    with opener(request, timeout=arguments.timeout) as response:
        body = response.read(arguments.max_response_bytes + 1)
        if len(body) > arguments.max_response_bytes:
            raise ValueError("response exceeds --max-response-bytes")
        final_url = canonical_url(str(response.url), origin)
        if final_url is None or not allowed_url(final_url, origin):
            raise ValueError("redirect left the approved public surface")
        return (
            final_url,
            dt.datetime.now(dt.timezone.utc).isoformat(),
            int(response.status),
            response.headers,
            body,
        )


def acquire(
    arguments: argparse.Namespace,
    opener: Callable[..., object] = urllib.request.urlopen,
    sleeper: Callable[[float], None] = time.sleep,
    wall_clock: Callable[[], float] = time.time,
) -> dict[str, object]:
    origin = arguments.origin.rstrip("/") + "/"
    pooled_opener: PooledHTTPXOpener | None = None
    if getattr(arguments, "http_client", "urllib") == "httpx" and opener is urllib.request.urlopen:
        pooled_opener = PooledHTTPXOpener(int(getattr(arguments, "concurrency", 1)))
        opener = pooled_opener
    authorization = read_authorization(arguments.authorization)
    allowed_origins = [str(item).rstrip("/") + "/" for item in authorization.get("allowedOrigins", ["https://jpdb.io/"])]
    if origin not in allowed_origins:
        raise ValueError(f"origin is outside the authorization record: {origin}")
    repository = Path(__file__).resolve().parents[3]
    if arguments.snapshot.resolve().is_relative_to(repository):
        raise ValueError("acquisition snapshots must be stored outside the application repository")
    seeds, expected, discovery_mode = read_seeds(arguments.seeds, origin)
    store = SnapshotStore(arguments.snapshot)
    robot_parser = urllib.robotparser.RobotFileParser(urllib.parse.urljoin(origin, "/robots.txt"))
    if arguments.respect_robots:
        robot_parser.read()
    try:
        store.bind_context(
            {
                "origin": origin,
                "canonicalization_schema": CANONICALIZATION_SCHEMA,
                "discover_links": str(bool(getattr(arguments, "discover_links", True))).lower(),
                "authorization_sha256": hashlib.sha256(arguments.authorization.read_bytes()).hexdigest(),
                "seed_manifest_sha256": hashlib.sha256(arguments.seeds.read_bytes()).hexdigest(),
            }
        )
        store.enqueue_many(seeds)
        fetched = 0
        concurrency_ceiling = int(getattr(arguments, "concurrency", 1))
        throttle = AdaptiveThrottle(
            rate_ceiling=arguments.requests_per_second,
            concurrency_ceiling=concurrency_ceiling,
            enabled=bool(getattr(arguments, "adaptive_throttle", True)),
            start_rate=float(getattr(arguments, "adaptive_start_rps", 6.0)),
            start_concurrency=int(getattr(arguments, "adaptive_start_concurrency", 3)),
            minimum_rate=float(getattr(arguments, "adaptive_minimum_rps", 1.0)),
            backoff_factor=float(getattr(arguments, "adaptive_backoff_factor", 0.5)),
            recovery_successes=int(getattr(arguments, "adaptive_recovery_successes", 200)),
            rate_step=float(getattr(arguments, "adaptive_rate_step", 0.5)),
        )
        throttle.restore(store.throttle_state())
        breaker_enabled = bool(getattr(arguments, "circuit_breaker", True))
        breaker_cooldown = float(
            getattr(arguments, "circuit_breaker_cooldown_seconds", 1800.0)
        )
        breaker_threshold = int(getattr(arguments, "circuit_breaker_signal_threshold", 2))
        next_request_at = time.monotonic()
        cooldown_until = 0.0
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency_ceiling) as executor:
            while True:
                if bool(getattr(arguments, "report_only", False)):
                    break
                if arguments.max_requests and fetched >= arguments.max_requests:
                    break
                if breaker_enabled:
                    breaker_state = store.circuit_breaker_state(wall_clock())
                    remaining = float(breaker_state["cooldownUntilEpoch"]) - wall_clock()
                    if remaining > 0:
                        sleeper(remaining)
                    store.close_circuit_breaker(wall_clock())
                batch_size = throttle.concurrency
                if arguments.max_requests:
                    batch_size = min(batch_size, arguments.max_requests - fetched)
                urls = store.pending_urls(batch_size)
                if not urls:
                    break
                eligible: list[str] = []
                for url in urls:
                    if arguments.respect_robots and not robot_parser.can_fetch(USER_AGENT, url):
                        store.record_failure(url, "robots.txt disallows this URL", terminal=True)
                    else:
                        eligible.append(url)
                if not eligible:
                    continue

                scheduled: dict[
                    concurrent.futures.Future[tuple[str, str, int, object, bytes]], str
                ] = {}
                for url in eligible:
                    now = time.monotonic()
                    start_at = max(now, next_request_at, cooldown_until)
                    next_request_at = start_at + throttle.interval
                    future = executor.submit(
                        fetch_response,
                        url,
                        arguments,
                        origin,
                        opener,
                        start_at - now,
                        sleeper,
                    )
                    scheduled[future] = url

                for future in concurrent.futures.as_completed(scheduled):
                    url = scheduled[future]
                    try:
                        final_url, retrieved_at, status, headers, body = future.result()
                        if "html" not in str(headers.get("Content-Type", "")).lower():
                            raise ValueError("approved JPDB route returned non-HTML content")
                        extracted = jpdb_extract.extract_page(final_url, body)
                        store.record_response(
                            url, final_url, retrieved_at, status, headers, body, extracted
                        )
                        if breaker_enabled:
                            store.reset_connection_pressure()
                        fetched += 1
                        prior_rate = throttle.rate
                        prior_concurrency = throttle.concurrency
                        if throttle.record_success():
                            store.record_throttle_event(
                                "recovery",
                                f"{throttle.recovery_successes} consecutive successes",
                                prior_rate,
                                prior_concurrency,
                                throttle,
                            )
                        if bool(getattr(arguments, "discover_links", True)):
                            discovered_urls: list[str] = []
                            for href in extracted.get("discoveredURLs", []):
                                discovered = canonical_url(str(href), origin)
                                if discovered and allowed_url(discovered, origin):
                                    discovered_urls.append(discovered)
                            if (
                                discovery_mode == "public-frontend-closure-v1"
                                and extracted.get("routeType") == "vocabulary-detail"
                            ):
                                forms = (extracted.get("vocabulary") or {}).get("forms", [])
                                exposed_text = "".join(str(form.get("spelling", "")) for form in forms)
                                for character in sorted(set(exposed_text)):
                                    if is_kanji(character):
                                        discovered_urls.append(
                                            urllib.parse.urljoin(origin, f"/kanji/{urllib.parse.quote(character)}"),
                                        )
                            store.enqueue_many(discovered_urls, url)
                    except urllib.error.HTTPError as error:
                        if breaker_enabled:
                            store.reset_connection_pressure()
                        attempt = store.attempts(url) + 1
                        retryable = error.code == 429 or 500 <= error.code < 600
                        terminal = not retryable or attempt >= arguments.max_attempts
                        store.record_failure(url, f"HTTP {error.code}: {error.reason}", terminal)
                        if retryable:
                            prior_rate = throttle.rate
                            prior_concurrency = throttle.concurrency
                            changed = throttle.record_transient_failure()
                            store.record_throttle_event(
                                "backoff" if changed else "pressure-at-minimum",
                                f"HTTP {error.code}: {error.reason}",
                                prior_rate,
                                prior_concurrency,
                                throttle,
                            )
                            next_request_at = next_request_after_pressure(
                                next_request_at, time.monotonic(), throttle
                            )
                        if not terminal:
                            cooldown_until = max(
                                cooldown_until,
                                time.monotonic() + retry_delay(error, attempt),
                            )
                    except (OSError, urllib.error.URLError, http.client.HTTPException) as error:
                        attempt = store.attempts(url) + 1
                        terminal = attempt >= arguments.max_attempts
                        store.record_failure(url, str(error), terminal)
                        prior_rate = throttle.rate
                        prior_concurrency = throttle.concurrency
                        was_at_minimum = throttle.at_minimum
                        changed = throttle.record_transient_failure()
                        store.record_throttle_event(
                            "backoff" if changed else "pressure-at-minimum",
                            f"{type(error).__name__}: {error}",
                            prior_rate,
                            prior_concurrency,
                            throttle,
                        )
                        next_request_at = next_request_after_pressure(
                            next_request_at, time.monotonic(), throttle
                        )
                        if breaker_enabled:
                            store.record_connection_pressure(
                                wall_clock(),
                                f"{type(error).__name__}: {error}",
                                was_at_minimum,
                                breaker_threshold,
                                breaker_cooldown,
                            )
                        if not terminal:
                            cooldown_until = max(
                                cooldown_until,
                                time.monotonic() + min(300.0, float(2**attempt)),
                            )
                    except ValueError as error:
                        if breaker_enabled:
                            store.reset_connection_pressure()
                        attempt = store.attempts(url) + 1
                        terminal = attempt >= arguments.max_attempts
                        store.record_failure(url, str(error), terminal)
                        if not terminal:
                            cooldown_until = max(
                                cooldown_until,
                                time.monotonic() + min(300.0, float(2**attempt)),
                            )

        rows = store.snapshot_rows()
        counts = store.counts()
        closure = frontend_closure(rows, arguments.snapshot, origin) if discovery_mode == "public-frontend-closure-v1" else None
        response_paths = [urllib.parse.urlsplit(str(row["finalURL"])).path for row in rows]
        vocabulary_ids = {
            match.group(1) for path in response_paths
            if (match := re.match(r"^/vocabulary/(\d+)/", path))
        }
        kanji_ids = {
            urllib.parse.unquote(match.group(1)) for path in response_paths
            if (match := re.match(r"^/kanji/([^/]+)", path))
        }
        media_ids = {
            (match.group(1), match.group(2)) for path in response_paths
            if (match := re.match(r"^/(anime|novel|visual-novel|web-novel|live-action|video-game)/(\d+)/", path))
        }
        observed_categories = {
            "responses": len(rows),
            "vocabulary": len(vocabulary_ids),
            "kanji": len(kanji_ids),
            "media": len(media_ids),
        }
        expectations_met = (
            bool(closure and closure["closed"])
            if discovery_mode == "public-frontend-closure-v1"
            else all(observed_categories.get(key, 0) >= count for key, count in expected.items())
        )
        report: dict[str, object] = {
            "schema": SNAPSHOT_SCHEMA,
            "origin": origin,
            "authorization": authorization,
            "authorizationSHA256": hashlib.sha256(arguments.authorization.read_bytes()).hexdigest(),
            "seedManifestSHA256": hashlib.sha256(arguments.seeds.read_bytes()).hexdigest(),
            "expected": expected,
            "discoveryMode": discovery_mode,
            "frontendClosure": closure,
            "observed": {**observed_categories, **counts},
            "complete": counts.get("pending", 0) == 0 and counts.get("failed", 0) == 0 and expectations_met,
            "failures": store.failures(),
            "throttle": throttle.report(),
            "throttleEvents": store.throttle_events(),
            "circuitBreaker": {
                **store.circuit_breaker_state(wall_clock()),
                "enabled": breaker_enabled,
                "cooldownSeconds": breaker_cooldown,
                "signalThreshold": breaker_threshold,
                "events": store.circuit_breaker_events(),
            },
            "responses": rows,
        }
        manifest = arguments.snapshot / "snapshot.json"
        manifest.write_text(canonical_json(report) + "\n", encoding="utf-8")
        return report
    finally:
        if pooled_opener is not None:
            pooled_opener.close()
        store.close()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--authorization", type=Path, required=True)
    result.add_argument("--seeds", type=Path, required=True)
    result.add_argument("--snapshot", type=Path, required=True)
    result.add_argument("--origin", default="https://jpdb.io/")
    result.add_argument("--requests-per-second", type=float, default=0.2)
    result.add_argument("--concurrency", type=int, default=1)
    result.add_argument(
        "--adaptive-throttle", action=argparse.BooleanOptionalAction, default=True,
        help="Treat rate/concurrency as ceilings; reduce on transient errors and recover slowly",
    )
    result.add_argument("--adaptive-start-rps", type=float, default=6.0)
    result.add_argument("--adaptive-start-concurrency", type=int, default=3)
    result.add_argument("--adaptive-minimum-rps", type=float, default=1.0)
    result.add_argument("--adaptive-backoff-factor", type=float, default=0.5)
    result.add_argument("--adaptive-recovery-successes", type=int, default=200)
    result.add_argument("--adaptive-rate-step", type=float, default=0.5)
    result.add_argument(
        "--circuit-breaker", action=argparse.BooleanOptionalAction, default=True,
        help="Pause all requests after repeated connection pressure at minimum capacity",
    )
    result.add_argument("--circuit-breaker-cooldown-seconds", type=float, default=1800.0)
    result.add_argument("--circuit-breaker-signal-threshold", type=int, default=2)
    result.add_argument("--http-client", choices=("urllib", "httpx"), default="urllib")
    result.add_argument("--max-attempts", type=int, default=5)
    result.add_argument("--timeout", type=float, default=60.0)
    result.add_argument("--max-response-bytes", type=int, default=16 * 1024 * 1024)
    result.add_argument("--max-requests", type=int, default=0)
    result.add_argument("--discover-links", action=argparse.BooleanOptionalAction, default=True)
    result.add_argument("--report-only", action="store_true")
    result.add_argument("--respect-robots", action=argparse.BooleanOptionalAction, default=True)
    return result


if __name__ == "__main__":
    try:
        args = parser().parse_args()
        if (
            args.requests_per_second <= 0
            or args.max_attempts <= 0
            or args.concurrency <= 0
            or args.adaptive_start_rps <= 0
            or args.adaptive_start_concurrency <= 0
            or args.adaptive_minimum_rps <= 0
            or not 0 < args.adaptive_backoff_factor < 1
            or args.adaptive_recovery_successes <= 0
            or args.adaptive_rate_step <= 0
            or args.circuit_breaker_cooldown_seconds <= 0
            or args.circuit_breaker_signal_threshold <= 0
        ):
            raise ValueError("rate, concurrency, attempt, and adaptive limits are invalid")
        acquire(args)
    except (OSError, ValueError, KeyError, json.JSONDecodeError, sqlite3.Error) as error:
        print(f"JPDB acquisition failed: {error}", file=sys.stderr)
        raise SystemExit(1)
