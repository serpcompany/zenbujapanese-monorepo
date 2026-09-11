#!/usr/bin/env python3

"""Report iOS ownership and whether changed paths require Xcode verification."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


IOS_PREFIXES = (
    "apps/ios/",
    "docs/releases/ios/",
    "docs/clone-discovery/nihongo/fixtures/image-text/",
)

IOS_EXACT_PATHS = {
    "docs/research/fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv",
    "docs/research/fixtures/example-sentence-retrieval-issue-147-retrieval-candidate-rows.tsv",
    "docs/research/tatoeba-nihongo-sample-2026-08-14.tsv",
}

IOS_NON_RUNTIME_EXACT_PATHS = {
    "apps/ios/CHANGELOG.md",
    "apps/ios/CI.md",
    "apps/ios/README.md",
    "apps/ios/ReleasePrivacyAudit.md",
}

IOS_NON_RUNTIME_PREFIXES = (
    "apps/ios/Verification/",
    "apps/ios/screenshots/app-store/",
    "docs/releases/ios/",
)


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


def is_ios_runtime_path(path: str) -> bool:
    normalized = path.removeprefix("./")
    if normalized in IOS_NON_RUNTIME_EXACT_PATHS or normalized.startswith(
        IOS_NON_RUNTIME_PREFIXES
    ):
        return False
    return is_ios_relevant_path(normalized)


def changed_paths(
    base_sha: str, head_sha: str, repo_root: Path | None = None
) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--no-renames", "--name-only", f"{base_sha}...{head_sha}"],
        cwd=repo_root,
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
    ios_runtime_changed = any(is_ios_runtime_path(path) for path in paths)
    outputs = (
        f"ios_runtime_changed={'true' if ios_runtime_changed else 'false'}",
        f"ios_changed={'true' if ios_changed else 'false'}",
    )
    for output in outputs:
        print(output)
    if github_output is not None:
        with github_output.open("a", encoding="utf-8") as output_file:
            for output in outputs:
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
