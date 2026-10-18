#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from committed_files import lfs_paths
from locations import REPO_ROOT
from pinned_files import check_committed_pins, check_pins_unchanged
from pinned_release import check_latest, check_pinned, load_pinned, write_pinned
from refusal import Refusal
from release_build import build
from release_inputs import load_inputs, load_release
from release_manifest import validate
from retirement import retire

DESCRIPTION = "Package a language-data release from the committed files."


def parse(argv: list[str] | None) -> argparse.Namespace:
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
    parser.add_argument(
        "--releases",
        type=Path,
        help="the pinned manifests; default: language-data/releases in --repo",
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
    pin_parser = commands.add_parser(
        "pin",
        help="pin the release OUT holds: write language-data/releases/<release>/manifest.json",
    )
    pin_parser.add_argument("out", type=Path, help="the directory `build` wrote")
    check_parser = commands.add_parser(
        "check-pin",
        help="check the committed files the app bundles and the images copy against the pinned "
        "manifest, without Git LFS",
    )
    check_parser.add_argument(
        "--built", type=Path, help="also check the manifest `build` wrote to this directory"
    )
    check_parser.add_argument(
        "--base", help="a commit, such as a pull request's base: no pin it holds may change"
    )
    retire_parser = commands.add_parser(
        "retire",
        help="write the release's entry changes since the release pinned before it, and the "
        "retired-entries file they make",
    )
    retire_parser.add_argument(
        "--previous-database",
        type=Path,
        help="that release's language-reference database; default: this checkout's Git LFS store",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse(argv)
    repo = args.repo.resolve()
    inputs_path = args.inputs or repo / "language-data" / "release-inputs.json"
    release_path = args.release or repo / "language-data" / "release.json"
    releases = args.releases or repo / "language-data" / "releases"
    try:
        if args.command == "build":
            manifest = build(
                repo,
                load_inputs(inputs_path),
                load_release(release_path),
                args.out,
                releases=releases,
            )
            print(
                f"Packaged release {manifest['release']}: {len(manifest['files'])} files, "
                f"{len(manifest['sources'])} sources, {manifest['ids']['ent_seq_count']} entries"
            )
        elif args.command == "lfs-paths":
            print(",".join(lfs_paths(repo, load_inputs(inputs_path))))
        elif args.command == "validate":
            manifest = validate(args.out)
            print(
                f"manifest.json for release {manifest['release']} is valid, with every staged file"
            )
        elif args.command == "retire":
            release = load_release(release_path)["release"]
            result = retire(
                repo, load_inputs(inputs_path), releases, release, args.previous_database
            )
            since = f"since {result['previous']}" if result["previous"] else "as the first release"
            print(
                f"Release {release} {since}: {result['dropped']} entries dropped "
                f"({result['replaced']} replaced), {result['added']} added; "
                f"{result['retired']} retired in all"
            )
        elif args.command == "pin":
            manifest = validate(args.out)
            release = load_release(release_path)["release"]
            if manifest["release"] != release:
                raise Refusal(f"{args.out} holds release {manifest['release']}, not {release}")
            check_latest(releases, release)
            print(f"Pinned release {release}: {write_pinned(releases, manifest)}")
        else:
            release = load_release(release_path)["release"]
            check_latest(releases, release)
            if args.base:
                check_pins_unchanged(repo, releases, args.base)
            pinned = load_pinned(releases, release)
            counts = check_committed_pins(repo, load_inputs(inputs_path), pinned)
            print(
                f"The committed files match release {release}'s pinned manifest: "
                f"{counts['files']} release files, {counts['bundled']} files the app bundles, "
                f"{counts['copied']} language-data files the images copy"
            )
            if args.built:
                built = json.loads((args.built / "manifest.json").read_text())
                check_pinned(built, pinned, f"the release built in {args.built}")
                print(f"The release built in {args.built} is the pinned one")
    except Refusal as refusal:
        print(f"Refused: {refusal}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
