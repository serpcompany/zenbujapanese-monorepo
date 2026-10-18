from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from committed_files import Committed, committed, git
from pinned_release import HOW_TO_PIN, PINNED_FILE
from refusal import Refusal
from release_inputs import Inputs

COPY = re.compile(r"^(COPY|ADD)\s+(.*)$", re.IGNORECASE)
WILDCARD = re.compile(r"[*?\[]")


def tracked(repo: Path, path: str) -> list[str]:
    listing = git(repo, "ls-tree", "-r", "-z", "--name-only", "--full-tree", "HEAD", "--", path)
    return [name for name in listing.decode().split("\0") if name]


def committed_digest(repo: Path, head: Committed) -> tuple[str, int]:
    if head.lfs_oid:
        return head.lfs_oid, head.lfs_size
    data = git(repo, "cat-file", "blob", head.blob_id)
    return hashlib.sha256(data).hexdigest(), len(data)


def instructions(dockerfile: str) -> list[str]:
    joined, current = [], ""
    for line in dockerfile.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if stripped.endswith("\\"):
            current += stripped[:-1] + " "
            continue
        joined.append((current + stripped).strip())
        current = ""
    if current.strip():
        joined.append(current.strip())
    return [line for line in joined if line]


def copied_sources(dockerfile: str, image: str) -> list[str]:
    sources = []
    for line in instructions(dockerfile):
        match = COPY.match(line)
        if not match:
            continue
        rest = match.group(2).strip()
        words = json.loads(rest) if rest.startswith("[") else rest.split()
        flags = [word for word in words if word.startswith("--")]
        if any(flag.startswith("--from") for flag in flags):
            continue
        for source in [word for word in words if not word.startswith("--")][:-1]:
            if WILDCARD.search(source):
                raise Refusal(f"{image} copies {source}: a wildcard can't be checked, name the files")
            sources.append(source.rstrip("/"))
    return sources


def covered(path: str, prefixes: list[str]) -> bool:
    return any(path == prefix or path.startswith(prefix + "/") for prefix in prefixes)


def check_pins_unchanged(repo: Path, releases: Path, base: str) -> None:
    folder = releases.resolve().relative_to(repo.resolve()).as_posix()
    held = git(repo, "ls-tree", "-r", "--name-only", "--full-tree", base, "--", folder)
    merged = {
        path.rsplit("/", 1)[0]
        for path in held.decode().splitlines()
        if path.endswith(f"/{PINNED_FILE}")
    }
    listing = git(repo, "diff", "--name-only", "--no-renames", base, "HEAD", "--", folder)
    changed = [
        path for path in listing.decode().splitlines() if path.rsplit("/", 1)[0] in merged
    ]
    if changed:
        raise Refusal(
            f"a pinned release never changes once it's merged, but these differ from {base}: "
            f"{', '.join(changed)}. Pin the new content as a new release. {HOW_TO_PIN}"
        )


def check_committed_pins(repo: Path, inputs: Inputs, pinned: dict) -> dict:
    problems = []
    records = {record["name"]: record for record in pinned["files"]}
    names = [entry["name"] for entry in inputs.files]
    unpinned = [name for name in names if name not in records]
    unlisted = [name for name in records if name not in names]
    if unpinned:
        problems.append(f"release-inputs.json names files the pinned manifest doesn't: {unpinned}")
    if unlisted:
        problems.append(f"the pinned manifest names files release-inputs.json doesn't: {unlisted}")

    heads = committed(repo, [entry["path"] for entry in inputs.files])
    for entry in inputs.files:
        record = records.get(entry["name"])
        if record is None:
            continue
        sha256, size = committed_digest(repo, heads[entry["path"]])
        if (sha256, size) != (record["sha256"], record["bytes"]):
            problems.append(
                f"{entry['name']}: {entry['path']} is {sha256} ({size} bytes) at HEAD, but the "
                f"pinned manifest has {record['sha256']} ({record['bytes']} bytes)"
            )

    suites = {suite["name"]: suite for suite in pinned.get("conformance", [])}
    suite_heads = committed(repo, inputs.conformance)
    for path in inputs.conformance:
        suite = suites.pop(Path(path).name, None)
        if suite is None:
            problems.append(f"the pinned manifest pins no conformance suite {Path(path).name}")
            continue
        sha256, size = committed_digest(repo, suite_heads[path])
        if (sha256, size) != (suite["sha256"], suite["bytes"]):
            problems.append(
                f"{suite['name']}: {path} is {sha256} ({size} bytes) at HEAD, but the "
                f"pinned manifest has {suite['sha256']} ({suite['bytes']} bytes)"
            )
    if suites:
        problems.append(
            f"the pinned manifest pins conformance suites release-inputs.json doesn't: {sorted(suites)}"
        )

    released = {entry["path"] for entry in inputs.files}
    accounted = sorted(released) + inputs.not_released
    for path in inputs.not_released:
        holds = sorted(file for file in released if covered(file, [path]))
        if holds:
            problems.append(f"not_released names {path}, which holds release files: {holds}")
        elif not tracked(repo, path):
            problems.append(f"not_released names {path}, which isn't committed at HEAD")

    bundled = 0
    for directory in inputs.app_bundles:
        for path in tracked(repo, directory):
            bundled += 1
            if not covered(path, accounted):
                problems.append(
                    f"the app bundles {path}, which is neither a release file nor in not_released"
                )

    roots = list(inputs.roots.values())
    copied = 0
    for image in inputs.images:
        dockerfile = git(repo, "show", f"HEAD:{image}").decode()
        for source in copied_sources(dockerfile, image):
            paths = tracked(repo, source)
            if not paths:
                problems.append(f"{image} copies {source}, which isn't committed at HEAD")
            for path in paths:
                if not covered(path, roots):
                    continue
                copied += 1
                if not covered(path, accounted):
                    problems.append(
                        f"{image} copies {path}, which is neither a release file nor in "
                        "not_released"
                    )

    if problems:
        raise Refusal(
            f"the committed files don't match release {pinned['release']}'s pinned manifest:\n"
            + "\n".join(f"  {problem}" for problem in problems)
            + f"\n{HOW_TO_PIN}"
        )
    return {"files": len(inputs.files), "bundled": bundled, "copied": copied}
