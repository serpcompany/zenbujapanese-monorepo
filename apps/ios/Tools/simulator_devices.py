from __future__ import annotations

import json
import shutil
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

TOOL_CACHE = Path.home() / "Library" / "Caches" / "com.zenbujapanese.build"
SIMULATORS = Path.home() / "Library" / "Developer" / "CoreSimulator" / "Devices"
DEAD_INSTALLS = Path("data") / "Library" / "Caches" / "com.apple.containermanagerd" / "Dead"
DEAD_INSTALL_SETTLE_SECONDS = 60


def run(*command: str) -> str:
    done = subprocess.run(command, capture_output=True, text=True)
    if done.returncode != 0:
        said = done.stderr.strip() or done.stdout.strip()
        raise SystemExit(f"{' '.join(command)} failed: {said}")
    return done.stdout


def xcrun(*arguments: str) -> str:
    return run("xcrun", *arguments)


def simctl(*arguments: str) -> str:
    return xcrun("simctl", *arguments)


def listed(what: str) -> dict:
    return json.loads(simctl("list", what, "--json"))


def every(devices: dict[str, list[dict]]) -> list[dict]:
    return [device for group in devices.values() for device in group]


def is_booted(udid: str) -> bool:
    return any(
        device["udid"] == udid and device.get("state") == "Booted"
        for device in every(listed("devices")["devices"])
    )


def dead_installs(udid: str, simulators: Path = SIMULATORS) -> Path:
    return simulators / udid / DEAD_INSTALLS


def size_of(path: Path) -> int:
    if path.is_symlink() or not path.is_dir():
        return path.lstat().st_size
    return sum(entry.lstat().st_size for entry in path.rglob("*") if not entry.is_dir())


def empty_dead_installs(
    udid: str, simulators: Path = SIMULATORS, now: Callable[[], float] = time.time
) -> tuple[int, int]:
    folder = dead_installs(udid, simulators)
    if folder.is_symlink() or not folder.is_dir():
        return 0, 0
    emptied = 0
    freed = 0
    for entry in folder.iterdir():
        try:
            if entry.lstat().st_mtime > now() - DEAD_INSTALL_SETTLE_SECONDS:
                continue
            freed += size_of(entry)
        except OSError:
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry, ignore_errors=True)
        else:
            entry.unlink(missing_ok=True)
        emptied += 1
    return emptied, freed


def said_emptied(emptied: int, freed: int) -> str:
    if not emptied:
        return ""
    return f"; deleted {emptied} old installs of the app ({freed / 1e9:.1f} GB) it had kept"
