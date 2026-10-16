from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
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
    roots: dict[str, str] = field(default_factory=dict)
    app_bundles: list[str] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    not_released: list[str] = field(default_factory=list)
    retired_entries: str | None = None
    core: dict[str, str] | None = None


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
        roots={root: directory.rstrip("/") for root, directory in roots.items()},
        app_bundles=[bundled_root(roots, root) for root in config.get("app_bundles", [])],
        images=[check_relative(image, "image") for image in config.get("images", [])],
        not_released=[not_released(roots, entry) for entry in config.get("not_released", [])],
        retired_entries=retired_entries(roots, files, config.get("retired_entries")),
        core=core(roots, config.get("core")),
    )


def retired_entries(roots: dict[str, str], files: list[dict], path: str | None) -> str | None:
    if path is None:
        return None
    resolved = resolve(roots, path)
    if resolved not in [entry["path"] for entry in files]:
        raise Refusal(f"retired_entries names {path}, which isn't a file in the release")
    return resolved


def core(roots: dict[str, str], config: dict | None) -> dict[str, str] | None:
    if config is None:
        return None
    return {
        "source": check_relative(config.get("source"), "core source").rstrip("/"),
        "bundle": resolve(roots, config.get("bundle")),
    }


def bundled_root(roots: dict[str, str], root: object) -> str:
    if root not in roots:
        raise Refusal(f"app_bundles names {root!r}, which isn't one of the roots {sorted(roots)}")
    return roots[root].rstrip("/")


def not_released(roots: dict[str, str], entry: dict) -> str:
    why = entry.get("why")
    if not isinstance(why, str) or not why.strip():
        raise Refusal(f"not_released entry {entry.get('path')!r} needs a why")
    return resolve(roots, entry.get("path")).rstrip("/")


def load_release(path: Path) -> dict:
    release = json.loads(path.read_text())
    if not isinstance(release.get("release"), str) or not RELEASE.match(release["release"]):
        raise Refusal(f"release.json's release {release.get('release')!r} isn't YYYY.MM.N")
    return release
