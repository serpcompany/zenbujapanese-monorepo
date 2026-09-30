from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from urllib.parse import quote

from refusal import Refusal

SQLITE_HEADER = b"SQLite format 3\x00"
FTS_SHADOW_SUFFIXES = ("content", "docsize", "segdir", "segments", "stat", "data", "idx", "config")


def open_sqlite(path: Path) -> closing[sqlite3.Connection]:
    return closing(sqlite3.connect(f"file:{quote(str(path))}?mode=ro&immutable=1", uri=True))


def is_sqlite(path: Path) -> bool:
    with path.open("rb") as file:
        return file.read(len(SQLITE_HEADER)) == SQLITE_HEADER


def quoted(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def count(connection: sqlite3.Connection, table: str) -> int:
    return connection.execute(f"SELECT count(*) FROM {quoted(table)}").fetchone()[0]


def sqlite_facts(path: Path) -> tuple[dict[str, int], dict[str, str]]:
    with open_sqlite(path) as connection:
        tables = {
            name: (sql or "")
            for name, sql in connection.execute(
                "SELECT name, sql FROM sqlite_master WHERE type = 'table'"
            )
            if not name.startswith("sqlite_")
        }
        virtual = sorted(
            name for name, sql in tables.items() if sql.upper().startswith("CREATE VIRTUAL TABLE")
        )
        shadows = {f"{name}_{suffix}" for name in virtual for suffix in FTS_SHADOW_SUFFIXES}
        counts = {}
        for name in sorted(tables):
            if name in virtual:
                source = next(
                    (f"{name}_{s}" for s in ("docsize", "content") if f"{name}_{s}" in tables),
                    name,
                )
                counts[name] = count(connection, source)
            elif name not in shadows:
                counts[name] = count(connection, name)
        metadata = {}
        if "metadata" in tables:
            metadata = {
                str(key): str(value)
                for key, value in connection.execute("SELECT key, value FROM metadata")
            }
    return counts, metadata


def json_value(metadata_value: str) -> object:
    try:
        return json.loads(metadata_value)
    except json.JSONDecodeError:
        return metadata_value


def ent_seq_ids(path: Path) -> tuple[int, str]:
    with open_sqlite(path) as connection:
        rows = connection.execute(
            "SELECT source_record_id FROM entries WHERE source_identity = 'edrdg.jmdict'"
        ).fetchall()
        total = count(connection, "entries")
    ids = sorted(row[0] for row in rows)
    if len(rows) != total:
        raise Refusal(f"{path.name}: {total - len(rows)} entries aren't JMdict entries")
    if any(not isinstance(value, int) or value < 0 for value in ids) or len(set(ids)) != len(ids):
        raise Refusal(f"{path.name}: ent_seq values aren't unique non-negative integers")
    digest = hashlib.sha256("".join(f"{value}\n" for value in ids).encode()).hexdigest()
    return len(ids), digest
