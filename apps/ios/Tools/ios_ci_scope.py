#!/usr/bin/env python3

"""Report whether changed repository paths can affect the iOS product or its CI."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


IOS_PREFIXES = (
    "apps/ios/",
    "docs/clone-discovery/nihongo/fixtures/image-text/",
)

IOS_EXACT_PATHS = {
    "docs/research/fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv",
    "docs/research/fixtures/example-sentence-retrieval-issue-147-retrieval-candidate-rows.tsv",
    "docs/research/tatoeba-nihongo-sample-2026-08-14.tsv",
}


def is_ios_relevant_path(path: str) -> bool:
    normalized = path.removeprefix("./")
    return (
        normalized.startswith(IOS_PREFIXES)
        or normalized in IOS_EXACT_PATHS
        or (
            normalized.startswith(".github/workflows/ios-")
            and normalized.endswith((".yml", ".yaml"))
        )
    )


def changed_paths(base_sha: str, head_sha: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base_sha}...{head_sha}"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.splitlines()


def report(paths: list[str], github_output: Path | None = None) -> bool:
    print("Changed paths:")
    for path in paths:
        print(f"  {path}")
    ios_changed = any(is_ios_relevant_path(path) for path in paths)
    output = f"ios_changed={'true' if ios_changed else 'false'}"
    print(output)
    if github_output is not None:
        with github_output.open("a", encoding="utf-8") as output_file:
            output_file.write(f"{output}\n")
    return ios_changed


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*")
    parser.add_argument("--base")
    parser.add_argument("--head")
    parser.add_argument("--force", choices=("true", "false"), default="false")
    parser.add_argument("--github-output", type=Path)
    return parser.parse_args(arguments)


def main(arguments: list[str]) -> int:
    options = parse_arguments(arguments)
    if options.force == "true":
        paths = ["apps/ios/.manual-validation"]
    elif options.base and options.head:
        paths = changed_paths(options.base, options.head)
    elif options.paths:
        paths = options.paths
    else:
        raise SystemExit("provide paths, --base/--head, or --force true")
    report(paths, options.github_output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
