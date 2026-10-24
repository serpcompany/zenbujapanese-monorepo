from __future__ import annotations

import gzip
import hashlib
import http.client
import json
import re
import shutil
import urllib.request
import zlib
from datetime import datetime
from pathlib import Path

from jmdict_examples import without_example_blocks

WITH_EXAMPLES = "JMdict_e_examp.gz"
WITHOUT_EXAMPLES = "JMdict_e.gz"
CANDIDATE = "export.json"
EXPORT_DATE = re.compile(rb"^<!-- JMdict created: (\d{4}-\d{2}-\d{2}) -->$", re.MULTILINE)
DTD_REVISION = re.compile(rb"^<!-- Rev (\d+\.\d+)$", re.MULTILINE)
DOWNLOAD_SECONDS = 600
REFRESH_GUIDE = "language-data/tools/README.md, Refresh a source snapshot"


def download(url: str, path: Path) -> dict[str, str | None]:
    partial = path.with_name(f"{path.name}.part")
    try:
        with urllib.request.urlopen(url, timeout=DOWNLOAD_SECONDS) as response, partial.open("wb") as output:
            shutil.copyfileobj(response, output)
            headers = {
                "http_last_modified": response.headers.get("Last-Modified"),
                "http_etag": response.headers.get("ETag"),
            }
    except (OSError, ValueError, http.client.HTTPException) as failure:
        partial.unlink(missing_ok=True)
        raise SystemExit(f"Couldn't download {url} from EDRDG: {failure}. Nothing was changed.") from failure
    partial.replace(path)
    return headers


def compressed_facts(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    return {"compressed_bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def xml_of(path: Path) -> bytes:
    try:
        return gzip.decompress(path.read_bytes())
    except (OSError, EOFError, zlib.error) as failure:
        raise SystemExit(f"EDRDG's {path.name} isn't a whole gzip file ({failure}). Nothing was changed.") from failure


def declared(pattern: re.Pattern[bytes], xml: bytes, what: str, name: str) -> str:
    found = pattern.search(xml)
    if found is None:
        raise SystemExit(f"EDRDG's {name} names no {what}, so it isn't a JMdict export. Nothing was changed.")
    return found.group(1).decode()


def same_day(with_examples: bytes, without_examples: bytes, pinned: dict) -> str:
    date = declared(EXPORT_DATE, with_examples, "export date", WITH_EXAMPLES)
    plain_date = declared(EXPORT_DATE, without_examples, "export date", WITHOUT_EXAMPLES)
    if date != plain_date:
        raise SystemExit(
            f"EDRDG's files are from different days: {WITH_EXAMPLES} is the {date} export and "
            f"{WITHOUT_EXAMPLES} the {plain_date} one. EDRDG writes both each day, so run this again "
            "once it has. Nothing was changed."
        )
    stripped = without_example_blocks(with_examples)
    if stripped != without_examples:
        raise SystemExit(
            f"EDRDG's {date} {WITH_EXAMPLES} without its example blocks isn't that day's {WITHOUT_EXAMPLES} "
            f"({len(stripped):,} bytes against {len(without_examples):,}), so its examples would change "
            f"entries. The importer refuses such a pair ({REFRESH_GUIDE}). Nothing was changed."
        )
    revision = declared(DTD_REVISION, with_examples, "DTD revision", WITH_EXAMPLES)
    if revision != pinned["dtd_revision"]:
        raise SystemExit(
            f"EDRDG's {date} export uses JMdict's DTD revision {revision}, not {pinned['dtd_revision']}: "
            "check the importer against EDRDG's changes before updating. Nothing was changed."
        )
    return date


def newer_than_the_pin(candidate: dict, pinned: dict) -> bool:
    if candidate["sha256"] == pinned["sha256"]:
        return False
    if candidate["export_date"] < pinned["export_date"]:
        raise SystemExit(
            f"EDRDG serves the {candidate['export_date']} export, older than the pinned "
            f"{pinned['export_date']} one. Nothing was changed."
        )
    if candidate["export_date"] == pinned["export_date"]:
        raise SystemExit(
            f"EDRDG's {candidate['export_date']} export isn't the file pinned under that date "
            f"(SHA-256 {candidate['sha256']}, not {pinned['sha256']}), and a snapshot is named by its "
            "date. Check EDRDG's file by hand. Nothing was changed."
        )
    return True


def fetch(record: Path, folder: Path, now: datetime) -> dict[str, object]:
    pinned = json.loads(record.read_text(encoding="utf-8"))
    folder.mkdir(parents=True, exist_ok=True)
    with_examples, without_examples = folder / WITH_EXAMPLES, folder / WITHOUT_EXAMPLES
    with_headers = download(pinned["download_url"], with_examples)
    without_headers = download(pinned["without_examples"]["download_url"], without_examples)
    with_xml, without_xml = xml_of(with_examples), xml_of(without_examples)
    date = same_day(with_xml, without_xml, pinned)
    fetched = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    candidate = {
        **pinned,
        "export_date": date,
        "fetched_at_utc": fetched,
        **with_headers,
        **compressed_facts(with_examples),
        "without_examples": {
            **pinned["without_examples"],
            "fetched_at_utc": fetched,
            **without_headers,
            **compressed_facts(without_examples),
            "xml_bytes": len(without_xml),
            "xml_sha256": hashlib.sha256(without_xml).hexdigest(),
        },
    }
    changed = newer_than_the_pin(candidate, pinned)
    (folder / CANDIDATE).write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"changed": changed, "export_date": date, "pinned_export_date": pinned["export_date"]}
