#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from committed_files import lfs_paths
from locations import REPO_ROOT
from refusal import Refusal
from release_build import build
from release_inputs import load_inputs, load_release
from release_manifest import validate

DESCRIPTION = "Package a language-data release from the committed files."


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument(
        "--repo", type=Path, default=REPO_ROOT, help="repository root (default: this checkout)"
    )
    parser.add_argument(
        "--inputs", type=Path, help="default: language-data/release-inputs.json in --repo"
    )
    parser.add_argument(
        "--release", type=Path, help="default: language-data/release.json in --repo"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    build_parser = commands.add_parser(
        "build", help="write OUT/manifest.json and OUT/files/<sha256>/<name>"
    )
    build_parser.add_argument(
        "--out", type=Path, required=True, help="an empty or missing directory"
    )
    commands.add_parser("lfs-paths", help="print the Git LFS paths build reads, comma-separated")
    validate_parser = commands.add_parser(
        "validate", help="check OUT/manifest.json against the schema, and the staged files"
    )
    validate_parser.add_argument("out", type=Path)
    args = parser.parse_args(argv)

    repo = args.repo.resolve()
    inputs_path = args.inputs or repo / "language-data" / "release-inputs.json"
    release_path = args.release or repo / "language-data" / "release.json"
    try:
        if args.command == "build":
            manifest = build(repo, load_inputs(inputs_path), load_release(release_path), args.out)
            print(
                f"Packaged release {manifest['release']}: {len(manifest['files'])} files, "
                f"{len(manifest['sources'])} sources, {manifest['ids']['ent_seq_count']} entries"
            )
        elif args.command == "lfs-paths":
            print(",".join(lfs_paths(repo, load_inputs(inputs_path))))
        else:
            manifest = validate(args.out)
            print(
                f"manifest.json for release {manifest['release']} is valid, with every staged file"
            )
    except Refusal as refusal:
        print(f"Refused: {refusal}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
