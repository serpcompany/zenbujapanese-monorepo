from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

APP = "zenbu-japanese"
KINDS = {
    "iphone": (APP, re.compile(r"^iPhone (\d+) Pro Max$")),
    "ipad": (f"{APP}-ipad", re.compile(r"^iPad Pro 13-inch \(M(\d+)\)$")),
}
SCOPE_VARIABLE = "ZENBU_SIMULATOR_SCOPE"
SEPARATOR = "--"
SCOPE = re.compile(r"[A-Za-z0-9._-]+")
BUILD_CACHE = Path.home() / "Library" / "Caches" / "com.zenbujapanese.build" / "DerivedData"


def simulator_name(kind: str, scope: str | None) -> str:
    base = KINDS[kind][0]
    return f"{base}{SEPARATOR}{scope}" if scope else base


def safe_scope(scope: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", scope).strip("-")
    if not safe:
        raise SystemExit(f"A Simulator can't be named for {scope!r}: it has no letters or digits.")
    return safe


def scope_in(name: str) -> str | None:
    for base, _ in KINDS.values():
        if name.startswith(base + SEPARATOR):
            scope = name[len(base) + len(SEPARATOR) :]
            return scope if SCOPE.fullmatch(scope) and scope.strip(".") else None
    return None


def scope_names(scope: str) -> set[str]:
    return {simulator_name(kind, scope) for kind in KINDS}


def newest_device_type(kind: str, runtime: dict) -> str:
    pattern = KINDS[kind][1]
    ranked = [
        (int(found.group(1)), device["identifier"])
        for device in runtime.get("supportedDeviceTypes", [])
        if (found := pattern.match(device["name"]))
    ]
    if not ranked:
        raise SystemExit(
            f"iOS {runtime['version']} runs no Simulator device that matches {pattern.pattern}."
        )
    return max(ranked)[1]


def version(text: str) -> list[int]:
    return [int(part) for part in text.split(".")]


def newest_runtime(runtimes: list[dict], sdk: str) -> dict:
    ranked = [
        (version(runtime["version"]), runtime["identifier"], runtime)
        for runtime in runtimes
        if runtime.get("isAvailable")
        and ".SimRuntime.iOS-" in runtime["identifier"]
        and version(runtime["version"])[:2] <= version(sdk)[:2]
    ]
    if not ranked:
        raise SystemExit(
            f"No installed iOS Simulator runtime is iOS {sdk} or older, which is the newest "
            "the selected Xcode runs. Install one in Xcode."
        )
    return max(ranked, key=lambda entry: entry[:2])[2]


def every(devices: dict[str, list[dict]]) -> list[dict]:
    return [device for group in devices.values() for device in group]


def find(devices: dict[str, list[dict]], name: str) -> str | None:
    for device in every(devices):
        if device["name"] == name and device.get("isAvailable"):
            return device["udid"]
    return None


def prunable_scopes(
    devices: dict[str, list[dict]], folders: list[str], scopes_in_use: set[str]
) -> list[str]:
    simulators = every(devices)
    owned = {scope_in(device["name"]) for device in simulators} | {
        scope_in(folder) for folder in folders
    }
    running = {
        scope_in(device["name"]) for device in simulators if device.get("state") != "Shutdown"
    }
    return sorted(
        scope for scope in owned if scope and scope not in scopes_in_use and scope not in running
    )


def derived_data(scope: str | None, cache: Path = BUILD_CACHE) -> Path:
    return cache / simulator_name("iphone", scope)


def run(*command: str) -> str:
    done = subprocess.run(command, capture_output=True, text=True)
    if done.returncode != 0:
        said = done.stderr.strip() or done.stdout.strip()
        raise SystemExit(f"{' '.join(command)} failed: {said}")
    return done.stdout


def git(*arguments: str) -> str:
    return run("git", *arguments).strip()


def xcrun(*arguments: str) -> str:
    return run("xcrun", *arguments)


def simctl(*arguments: str) -> str:
    return xcrun("simctl", *arguments)


def listed(what: str) -> dict:
    return json.loads(simctl("list", what, "--json"))


def checkout_scope(environment: dict[str, str]) -> str | None:
    chosen = environment.get(SCOPE_VARIABLE)
    if chosen:
        return safe_scope(chosen)
    if Path(git("rev-parse", "--git-dir")).resolve() == Path(
        git("rev-parse", "--git-common-dir")
    ).resolve():
        return None
    return safe_scope(Path(git("rev-parse", "--show-toplevel")).name)


def worktree_scopes() -> set[str]:
    return {
        safe_scope(Path(line.split(" ", 1)[1]).name)
        for line in git("worktree", "list", "--porcelain").splitlines()
        if line.startswith("worktree ")
    }


def udid(kind: str, scope: str | None) -> str:
    name = simulator_name(kind, scope)
    existing = find(listed("devices")["devices"], name)
    if existing:
        return existing
    sdk = xcrun("--sdk", "iphonesimulator", "--show-sdk-version").strip()
    runtime = newest_runtime(listed("runtimes")["runtimes"], sdk)
    return simctl("create", name, newest_device_type(kind, runtime), runtime["identifier"]).strip()


def remove(scope: str, devices: dict[str, list[dict]], cache: Path = BUILD_CACHE) -> list[str]:
    removed = []
    for device in every(devices):
        if device["name"] in scope_names(scope):
            if device.get("state") != "Shutdown":
                simctl("shutdown", device["udid"])
            simctl("delete", device["udid"])
            removed.append(device["name"])
    folder = derived_data(scope, cache)
    inside = folder.resolve().parent == cache.resolve()
    if inside and folder.is_dir() and not folder.is_symlink():
        shutil.rmtree(folder)
        removed.append(str(folder))
    return removed


def delete(scope: str | None) -> list[str]:
    if not scope:
        raise SystemExit(
            "This checkout uses the app's own Simulators, which hold setup done by hand, "
            f"so they aren't deleted. Work in a worktree, or set {SCOPE_VARIABLE}."
        )
    return remove(scope, listed("devices")["devices"])


def prune() -> list[str]:
    devices = listed("devices")["devices"]
    folders = (
        [entry.name for entry in BUILD_CACHE.iterdir() if entry.is_dir()]
        if BUILD_CACHE.is_dir()
        else []
    )
    removed = []
    for scope in prunable_scopes(devices, folders, worktree_scopes()):
        removed.extend(remove(scope, devices))
    return removed


def main(arguments: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Prints the UDID of this checkout's own Simulator for the app, creating it when it is "
            "missing. The main checkout gets the app's long-lived Simulator; a git worktree gets "
            f"its own, named for the worktree, or for {SCOPE_VARIABLE} when that is set. "
            "derived-data prints this checkout's own build folder; delete removes this "
            "worktree's Simulators and build folder; prune removes those of worktrees that are "
            "gone."
        )
    )
    parser.add_argument(
        "command", nargs="?", default="udid", choices=["udid", "derived-data", "delete", "prune"]
    )
    parser.add_argument("--device", default="iphone", choices=sorted(KINDS))
    options = parser.parse_args(arguments)
    scope = None if options.command == "prune" else checkout_scope(dict(os.environ))
    if options.command == "udid":
        print(udid(options.device, scope))
        return 0
    if options.command == "derived-data":
        print(derived_data(scope))
        return 0
    removed = prune() if options.command == "prune" else delete(scope)
    print("\n".join(removed) if removed else "Nothing to remove.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
