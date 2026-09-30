from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from refusal import Refusal

NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)?$")
RELEASE = re.compile(r"^[0-9]{4}\.(0[1-9]|1[0-2])\.[1-9][0-9]*$")


@dataclass(frozen=True)
class Inputs:
    files: list[dict]
    catalog: str | None
    source_archives: dict[str, str]
    conformance: list[str]


def check_name(name: object, what: str) -> str:
    if (
        not isinstance(name, str)
        or not NAME.match(name)
        or any(segment in (".", "..") for segment in name.split("/"))
    ):
        raise Refusal(f"{what} {name!r} isn't a release name (one or two plain path segments)")
    return name


def check_relative(path: object, what: str) -> str:
    if (
        not isinstance(path, str)
        or not path
        or path.startswith("/")
        or "\\" in path
        or any(segment in ("", ".", "..") for segment in path.rstrip("/").split("/"))
    ):
        raise Refusal(f"{what} {path!r} must be a plain path relative to the repository root")
    return path


def resolve(roots: dict[str, str], path: str) -> str:
    check_relative(path, "release-inputs.json path")
    root, _, rest = path.partition("/")
    if root not in roots or not rest:
        raise Refusal(f"{path} doesn't start with one of the roots {sorted(roots)}")
    return f"{roots[root].rstrip('/')}/{rest}"


def load_inputs(path: Path) -> Inputs:
    config = json.loads(path.read_text())
    roots = config["roots"]
    for root, directory in roots.items():
        check_relative(directory, f"root {root}")
    files = []
    for entry in config["files"]:
        check_name(entry.get("name"), "file name")
        files.append(dict(entry, path=resolve(roots, entry["path"])))
    names = [entry["name"] for entry in files]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise Refusal(f"release-inputs.json names these files more than once: {duplicates}")
    catalog = config.get("frequency_pack_catalog")
    return Inputs(
        files=files,
        catalog=resolve(roots, catalog) if catalog else None,
        source_archives={
            check_name(pack, "source"): resolve(roots, archive)
            for pack, archive in config.get("source_archives", {}).items()
        },
        conformance=[resolve(roots, suite) for suite in config["conformance"]],
    )


def load_release(path: Path) -> dict:
    release = json.loads(path.read_text())
    if not isinstance(release.get("release"), str) or not RELEASE.match(release["release"]):
        raise Refusal(f"release.json's release {release.get('release')!r} isn't YYYY.MM.N")
    return release
