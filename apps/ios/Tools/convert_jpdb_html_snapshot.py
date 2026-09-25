#!/usr/bin/env python3
"""Convert a legacy JPDB HTML checkpoint into a structured-only checkpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

import acquire_jpdb
import jpdb_extract


def legacy_blob(root: Path, digest: str) -> Path:
    return root / "raw" / "sha256" / digest[:2] / digest[2:]


def convert(arguments: argparse.Namespace) -> dict[str, int]:
    if arguments.output.resolve().is_relative_to(Path(__file__).resolve().parents[3]):
        raise ValueError("structured snapshots must be stored outside the repository")
    legacy = sqlite3.connect(f"file:{arguments.input / 'checkpoint.sqlite'}?mode=ro", uri=True)
    target = acquire_jpdb.SnapshotStore(arguments.output)
    converted = 0
    source_bytes = 0
    structured_bytes = 0
    try:
        target.bind_context(
            {
                "origin": arguments.origin.rstrip("/") + "/",
                "canonicalization_schema": acquire_jpdb.CANONICALIZATION_SCHEMA,
                "discover_links": "true",
                "authorization_sha256": hashlib.sha256(arguments.authorization.read_bytes()).hexdigest(),
                "seed_manifest_sha256": hashlib.sha256(arguments.seeds.read_bytes()).hexdigest(),
            }
        )
        for url, state, discovered_from, attempts, last_error in legacy.execute(
            "SELECT url,state,discovered_from,attempts,last_error FROM queue ORDER BY url"
        ):
            target.enqueue(str(url), str(discovered_from) if discovered_from else None)
            if state == "failed":
                target.database.execute(
                    "UPDATE queue SET state='failed',attempts=?,last_error=? WHERE url=?",
                    (int(attempts), str(last_error or ""), str(url)),
                )
        target.database.commit()
        for row in legacy.execute(
            "SELECT url,final_url,retrieved_at,status,content_type,byte_count,sha256,etag,last_modified "
            "FROM responses ORDER BY url"
        ):
            url, final_url, retrieved_at, status, content_type, byte_count, digest, etag, modified = row
            path = legacy_blob(arguments.input, str(digest))
            body = path.read_bytes()
            if len(body) != int(byte_count) or acquire_jpdb.sha256_bytes(body) != str(digest):
                raise ValueError(f"legacy response mismatch: {url}")
            extracted = jpdb_extract.extract_page(str(final_url), body)
            target.record_response(
                str(url),
                str(final_url),
                str(retrieved_at),
                int(status),
                {"Content-Type": str(content_type), "ETag": etag, "Last-Modified": modified},
                body,
                extracted,
            )
            converted += 1
            source_bytes += len(body)
            structured_bytes += len((acquire_jpdb.canonical_json(extracted) + "\n").encode("utf-8"))
        return {
            "converted": converted,
            "sourceBytes": source_bytes,
            "structuredBytes": structured_bytes,
        }
    finally:
        target.close()
        legacy.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--authorization", type=Path, required=True)
    parser.add_argument("--seeds", type=Path, required=True)
    parser.add_argument("--origin", default="https://jpdb.io/")
    result = convert(parser.parse_args())
    result["structuredPercent"] = round(
        100.0 * result["structuredBytes"] / result["sourceBytes"], 2
    ) if result["sourceBytes"] else 0
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
