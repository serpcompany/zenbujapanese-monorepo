#!/usr/bin/env python3

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Optional


class PreparationError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _matches(path: Path, expected_bytes: int, expected_sha256: str) -> bool:
    return (
        path.is_file()
        and path.stat().st_size == expected_bytes
        and _sha256(path) == expected_sha256
    )


def _bundled_pack(manifest_path: Path) -> dict:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        packs = [
            pack
            for pack in manifest["packs"]
            if pack["distribution"] == "bundledDefault"
        ]
        if manifest["schemaVersion"] != 1 or len(packs) != 1:
            raise KeyError
        pack = packs[0]
        required = (
            "downloadURL",
            "downloadBytes",
            "downloadSHA256",
            "archiveEntry",
            "installedBytes",
            "installedSHA256",
        )
        if any(key not in pack for key in required):
            raise KeyError
        if (
            pack.get("bundledResource") != "system_core"
            or pack.get("bundledResourceExtension") != "dic"
        ):
            raise KeyError
        return pack
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise PreparationError("invalid bundled Sudachi manifest") from error


@contextmanager
def _exclusive_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        yield


def _download(url: str, destination: Path) -> None:
    request = urllib.request.Request(
        url, headers={"User-Agent": "ZenbuJapaneseBuild/1"}
    )
    with urllib.request.urlopen(request, timeout=120) as response, destination.open(
        "wb"
    ) as output:
        status = getattr(response, "status", None)
        if status is not None and status != 200:
            raise PreparationError(f"upstream Sudachi download returned HTTP {status}")
        shutil.copyfileobj(response, output, length=4 * 1024 * 1024)


def prepare(
    manifest_path: Path,
    cache_root: Path,
    output_path: Optional[Path],
    *,
    allow_network: bool = True,
) -> dict:
    pack = _bundled_pack(manifest_path)
    wheel_sha = pack["downloadSHA256"]
    dictionary_sha = pack["installedSHA256"]
    preparation_tool_sha = _sha256(Path(__file__).resolve())
    contract_fields = {
        "manifestSchemaVersion": 1,
        "pack": pack,
        "preparationToolSHA256": preparation_tool_sha,
    }
    contract_key = hashlib.sha256(
        json.dumps(contract_fields, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    wheel = cache_root / "wheels" / f"{wheel_sha}.whl"
    dictionary = cache_root / "contracts" / contract_key / "system_core.dic"
    measured_peak_payload_bytes = 0

    def observe_payload(*paths: Path) -> None:
        nonlocal measured_peak_payload_bytes
        measured_peak_payload_bytes = max(
            measured_peak_payload_bytes,
            sum(item.stat().st_size for item in paths if item.is_file()),
        )

    with _exclusive_lock(cache_root / ".prepare.lock"):
        wheel.parent.mkdir(parents=True, exist_ok=True)
        dictionary.parent.mkdir(parents=True, exist_ok=True)
        if not _matches(wheel, pack["downloadBytes"], wheel_sha):
            wheel.unlink(missing_ok=True)
            if not allow_network:
                raise PreparationError(
                    "verified Sudachi build cache is missing; run the repository bootstrap"
                )
            temporary_wheel = wheel.parent / f".source-{os.getpid()}.tmp"
            temporary_wheel.unlink(missing_ok=True)
            try:
                _download(pack["downloadURL"], temporary_wheel)
                observe_payload(temporary_wheel)
                if not _matches(temporary_wheel, pack["downloadBytes"], wheel_sha):
                    raise PreparationError(
                        "Sudachi wheel checksum or byte count mismatch"
                    )
                os.replace(temporary_wheel, wheel)
            except Exception:
                temporary_wheel.unlink(missing_ok=True)
                raise

        if not _matches(dictionary, pack["installedBytes"], dictionary_sha):
            dictionary.unlink(missing_ok=True)
            temporary_dictionary = dictionary.parent / f".dictionary-{os.getpid()}.tmp"
            temporary_dictionary.unlink(missing_ok=True)
            try:
                with zipfile.ZipFile(wheel) as archive:
                    try:
                        entry = archive.getinfo(pack["archiveEntry"])
                    except KeyError as error:
                        raise PreparationError(
                            "Sudachi wheel is missing the pinned dictionary entry"
                        ) from error
                    if entry.is_dir() or entry.file_size != pack["installedBytes"]:
                        raise PreparationError("Sudachi dictionary byte count mismatch")
                    with archive.open(entry) as source, temporary_dictionary.open(
                        "wb"
                    ) as output:
                        shutil.copyfileobj(source, output, length=4 * 1024 * 1024)
                observe_payload(wheel, temporary_dictionary)
                if not _matches(
                    temporary_dictionary, pack["installedBytes"], dictionary_sha
                ):
                    raise PreparationError(
                        "Sudachi dictionary checksum or byte count mismatch"
                    )
                os.replace(temporary_dictionary, dictionary)
            except Exception:
                temporary_dictionary.unlink(missing_ok=True)
                raise

        if output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_path is not None and not _matches(
            output_path, pack["installedBytes"], dictionary_sha
        ):
            temporary_output = output_path.with_name(
                f".{output_path.name}-{os.getpid()}.tmp"
            )
            temporary_output.unlink(missing_ok=True)
            try:
                shutil.copyfile(dictionary, temporary_output)
                observe_payload(wheel, dictionary, temporary_output)
                if not _matches(
                    temporary_output, pack["installedBytes"], dictionary_sha
                ):
                    raise PreparationError(
                        "staged Sudachi dictionary validation failed"
                    )
                os.replace(temporary_output, output_path)
            except Exception:
                temporary_output.unlink(missing_ok=True)
                raise
        observe_payload(
            wheel, dictionary, *(item for item in [output_path] if item is not None)
        )

    return {
        "source": wheel_sha,
        "dictionary": dictionary_sha,
        "dictionary_bytes": pack["installedBytes"],
        "contract": contract_key,
        "preparation_tool": preparation_tool_sha,
        "measured_peak_payload_bytes": measured_peak_payload_bytes,
        "output": str(output_path) if output_path is not None else None,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Prepare the pinned Sudachi Core app resource in a checksum-keyed cache."
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--cache-only",
        action="store_true",
        help="Prepare the external verified cache without staging an app resource.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Fail rather than fetching when the verified source artifact is absent.",
    )
    options = parser.parse_args(argv)
    if options.cache_only == (options.output is not None):
        parser.error("choose exactly one of --cache-only or --output")
    try:
        print(
            json.dumps(
                prepare(
                    options.manifest,
                    options.cache,
                    options.output,
                    allow_network=not options.offline,
                ),
                sort_keys=True,
            )
        )
    except (
        OSError,
        urllib.error.URLError,
        zipfile.BadZipFile,
        PreparationError,
    ) as error:
        print(
            "error: unable to prepare the required offline Japanese analysis resource: "
            f"{error}. Connect to the internet and build again; verified cache entries are reused.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
