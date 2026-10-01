#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from locations import LANGUAGE_DATA
from object_store import AwsCliStore, PreconditionFailed, Store, StoreError
from publish_release import publish
from refusal import Refusal
from release_inputs import load_release
from verify_release import verify

DESCRIPTION = "Publish a packaged language-data release to R2, and verify it."
CREDENTIALS = {
    "AWS_ACCESS_KEY_ID": "R2_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY": "R2_SECRET_ACCESS_KEY",
}


def missing_credentials(env=os.environ) -> list[str]:
    return [secret for variable, secret in CREDENTIALS.items() if not env.get(variable)]


def main(argv: list[str] | None = None, env=os.environ, store: Store | None = None) -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--bucket", default=env.get("R2_BUCKET"), help="default: $R2_BUCKET")
    parser.add_argument(
        "--endpoint", default=env.get("R2_ENDPOINT"), help="the S3 endpoint; default: $R2_ENDPOINT"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    publish_parser = commands.add_parser(
        "publish", help="upload a release package.py build staged, and list it in releases.json"
    )
    publish_parser.add_argument("staged", type=Path, help="the directory `package.py build` wrote")
    verify_parser = commands.add_parser(
        "verify", help="check a published release: its manifest and every file it lists"
    )
    verify_parser.add_argument(
        "--release", help="default: the release in language-data/release.json"
    )
    verify_parser.add_argument(
        "--hash", choices=["all", "none"], default="all", help="download and hash every file"
    )
    args = parser.parse_args(argv)

    try:
        if store is None:
            missing = missing_credentials(env)
            if missing:
                raise Refusal(
                    f"missing the {' and '.join(missing)} secret{'s' if len(missing) > 1 else ''} "
                    "of the language-data-release environment (an R2 token scoped to the bucket)"
                )
            if not args.bucket or not args.endpoint:
                raise Refusal("the bucket and its S3 endpoint are needed (R2_BUCKET, R2_ENDPOINT)")
            store = AwsCliStore(args.bucket, args.endpoint)
        if args.command == "publish":
            result = publish(store, args.staged)
            print(
                f"Published release {result['release']} (manifest sha256 "
                f"{result['manifest_sha256']}, after {result['previous_release'] or 'nothing'}): "
                f"{len(result['uploaded'])} objects uploaded"
                + ("" if result["listed"] else ", already listed in releases.json")
            )
        else:
            release = (
                args.release
                or load_release(LANGUAGE_DATA / "release.json")["release"]
            )
            with tempfile.TemporaryDirectory() as tmp:
                verify(store, release, hash_files=args.hash == "all", workdir=Path(tmp))
    except (Refusal, StoreError, PreconditionFailed, OSError, json.JSONDecodeError) as refusal:
        print(f"Refused: {refusal}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
