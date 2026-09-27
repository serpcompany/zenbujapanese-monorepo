#!/usr/bin/env python3
"""Upload downloadable frequency-pack source files to Zenbu's CDN bucket.

Each given file is matched to catalog manifests by byte count and SHA-256, never by name, and
uploaded to the object key named by the manifest's `downloadURL`. Keys contain the source
SHA-256, so objects are immutable and every trusted historical manifest stays downloadable.
After uploading, each public URL is fetched and verified against the manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[3]
CATALOG = (
    REPOSITORY
    / "apps/ios/Modules/Sources/SearchExperience/Resources/FrequencyPackCatalog.json"
)
CDN_ORIGIN = "https://cdn.zenbujapanese.com/"
BUCKET = "zenbujapanese-cdn"
CONTENT_TYPES = {".zip": "application/zip", ".xz": "application/x-xz"}


def downloadable_manifests() -> list[dict[str, object]]:
    catalog = json.loads(CATALOG.read_text())
    manifests = catalog["packs"] + catalog["trustedHistoricalManifests"]
    return [
        manifest
        for manifest in manifests
        if manifest.get("bundledResource") is None
        and str(manifest["downloadURL"]).startswith(CDN_ORIGIN)
    ]


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "zenbu-publish-tool"})
    with urllib.request.urlopen(request) as response:
        return response.read()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    arguments = parser.parse_args()

    by_digest: dict[tuple[int, str], set[str]] = {}
    for manifest in downloadable_manifests():
        key = str(manifest["downloadURL"]).removeprefix(CDN_ORIGIN)
        by_digest.setdefault(
            (int(manifest["sourceBytes"]), str(manifest["sourceSHA256"])), set()
        ).add(key)

    uploads: list[tuple[Path, str, str]] = []
    for path in arguments.files:
        data = path.read_bytes()
        keys = by_digest.get((len(data), hashlib.sha256(data).hexdigest()))
        if not keys:
            print(f"{path}: matches no CDN-hosted catalog manifest", file=sys.stderr)
            return 1
        for key in sorted(keys):
            uploads.append((path, key, hashlib.sha256(data).hexdigest()))

    for path, key, digest in uploads:
        print(f"{path} -> {CDN_ORIGIN}{key}")
        if arguments.dry_run:
            continue
        subprocess.run(
            [
                "wrangler", "r2", "object", "put", f"{BUCKET}/{key}",
                "--remote",
                "--file", str(path),
                "--content-type", CONTENT_TYPES.get(Path(key).suffix, "application/octet-stream"),
                "--cache-control", "public, max-age=31536000, immutable",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        if hashlib.sha256(fetch(CDN_ORIGIN + key)).hexdigest() != digest:
            print(f"{CDN_ORIGIN}{key}: published bytes do not match", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
