#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from functools import partial
from typing import Callable

from public_address import PUBLIC_ADDRESS, DownloadError, PublicAddress
from refusal import Refusal
from release_download import check_download

DESCRIPTION = (
    "Download a published release's first set from the bucket's public address, from its gzipped "
    "parts and as published, and check each file's SHA-256 against the release's manifest."
)


def main(argv: list[str] | None = None, urlopen: Callable = urllib.request.urlopen) -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument(
        "--release", help="default: the newest in releases.json, the release the extension installs"
    )
    parser.add_argument("--address", default=PUBLIC_ADDRESS, help=f"default: {PUBLIC_ADDRESS}")
    args = parser.parse_args(argv)

    try:
        print(f"Checking a release's first set at {args.address}", flush=True)
        result = check_download(
            PublicAddress(args.address, urlopen), args.release, log=partial(print, flush=True)
        )
    except (Refusal, DownloadError, OSError, json.JSONDecodeError) as refusal:
        print(f"Refused: {refusal}", file=sys.stderr)
        return 1
    release, failures = result["release"], result["failures"]
    downloads = len(result["downloaded"]) * result["files"]
    if failures:
        print(
            f"Refused: {len(failures)} of {downloads} downloads of release {release}'s first set "
            "don't match its manifest:\n" + "\n".join(f"  {f}" for f in failures),
            file=sys.stderr,
        )
        return 1
    print(
        f"Release {release}'s first set, {result['files']} files, downloaded both ways: every "
        "SHA-256 matches the manifest."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
