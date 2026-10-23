from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import time
from collections.abc import Callable
from pathlib import Path

from simulator_devices import (
    TOOL_CACHE,
    empty_dead_installs,
    every,
    is_booted,
    listed,
    run,
    said_emptied,
    simctl,
    xcrun,
)
from simulator_keeper import (
    HANDOVER_SECONDS,
    IDLE_LIMIT_SECONDS,
    KEEPERS,
    boot_lease,
    booting,
    is_in_use,
    keep,
)

APP = "zenbu-japanese"
KINDS = {
    "iphone": (APP, re.compile(r"^iPhone (\d+) Pro Max$")),
    "ipad": (f"{APP}-ipad", re.compile(r"^iPad Pro 13-inch \(M(\d+)\)$")),
}
SCOPE_VARIABLE = "ZENBU_SIMULATOR_SCOPE"
SEPARATOR = "--"
SCOPE = re.compile(r"[A-Za-z0-9._-]+")
BUILD_CACHE = TOOL_CACHE / "DerivedData"
CALM_IDLE_PERCENT = 50
CALM_SAMPLES = 2
CALM_SAMPLE_SECONDS = 2
CALM_LIMIT_SECONDS = 120
SETTLED_APP = "com.apple.Preferences"
RUN_ENDING_SECONDS = 30
RUN_ENDING_LOOK_SECONDS = 1


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


def scope_names(scope: str | None) -> set[str]:
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


def git(*arguments: str) -> str:
    return run("git", *arguments).strip()


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


def cpu_idle_percent() -> float:
    shown = run("iostat", "-n", "0", "-c", "2", "-w", str(CALM_SAMPLE_SECONDS))
    return idle_percent_in(shown)


def idle_percent_in(iostat: str) -> float:
    return float(iostat.splitlines()[-1].split()[2])


def wait_until_calm(
    idle_percent: Callable[[], float] = cpu_idle_percent,
    clock: Callable[[], float] = time.monotonic,
    limit: float = CALM_LIMIT_SECONDS,
) -> tuple[float, bool]:
    began = clock()
    calm = 0
    while calm < CALM_SAMPLES and clock() - began < limit:
        calm = calm + 1 if idle_percent() >= CALM_IDLE_PERCENT else 0
    return clock() - began, calm >= CALM_SAMPLES


def wait_until_it_launches(target: str, clock: Callable[[], float] = time.monotonic) -> float:
    began = clock()
    simctl("launch", target, SETTLED_APP)
    simctl("terminate", target, SETTLED_APP)
    return clock() - began


def running(scope: str | None, devices: dict[str, list[dict]]) -> list[dict]:
    return [
        device
        for device in every(devices)
        if device["name"] in scope_names(scope) and device.get("state") != "Shutdown"
    ]


def bring_up(name: str, target: str, keepers: Path) -> str:
    began = time.monotonic()
    simctl("boot", target)
    keep(target, keepers)
    simctl("bootstatus", target, "-b")
    booted = time.monotonic() - began
    launched = wait_until_it_launches(target)
    waited, calm = wait_until_calm()
    if not is_booted(target):
        raise SystemExit(
            f"{name} was shut down while boot waited for it, so it isn't handed over. Find what "
            "shut it down (a simctl shutdown, or a watchdog short of memory), then run boot "
            "again; don't let xcodebuild boot it."
        )
    return f"booted in {booted:.0f} s, launched an app {launched:.0f} s later, and the Mac " + (
        f"was calm {waited:.0f} s later" if calm else f"was still busy {waited:.0f} s later"
    )


def boot(kind: str, scope: str | None, keepers: Path = KEEPERS) -> str:
    name = simulator_name(kind, scope)
    target = udid(kind, scope)
    emptied = said_emptied(*empty_dead_installs(target))
    up = running(scope, listed("devices")["devices"])
    idle_others = [
        device
        for device in up
        if device["udid"] != target and not is_in_use(device["udid"], keepers)
    ]
    for other in idle_others:
        simctl("shutdown", other["udid"])
    with booting(target, keepers):
        if any(device["udid"] == target and device.get("state") == "Booted" for device in up):
            said = "was already up"
        else:
            said = bring_up(name, target, keepers)
        keep(target, keepers)
    return (
        said
        + emptied
        + "".join(
            f"; {other['name']} was shut down, since nothing was using it" for other in idle_others
        )
    )


def free_once_runs_end(
    udid: str,
    clock: Callable[[], float] = time.monotonic,
    pause: Callable[[float], None] = time.sleep,
    limit: float = RUN_ENDING_SECONDS,
) -> bool:
    began = clock()
    while is_in_use(udid):
        if clock() - began >= limit:
            return False
        pause(RUN_ENDING_LOOK_SECONDS)
    return True


def shut_down(
    scope: str | None,
    devices: dict[str, list[dict]],
    clock: Callable[[], float] = time.monotonic,
    pause: Callable[[float], None] = time.sleep,
) -> list[str]:
    said = []
    for device in running(scope, devices):
        if not free_once_runs_end(device["udid"], clock, pause):
            said.append(f"{device['name']} stays up, since something is using it")
            continue
        simctl("shutdown", device["udid"])
        said.append(device["name"] + said_emptied(*empty_dead_installs(device["udid"])))
    return said


def remove(
    scope: str,
    devices: dict[str, list[dict]],
    cache: Path = BUILD_CACHE,
    keepers: Path = KEEPERS,
) -> list[str]:
    removed = []
    for device in every(devices):
        if device["name"] in scope_names(scope):
            if device.get("state") != "Shutdown":
                simctl("shutdown", device["udid"])
            simctl("delete", device["udid"])
            boot_lease(device["udid"], keepers).unlink(missing_ok=True)
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
            "derived-data prints this checkout's own build folder. boot starts the Simulator "
            "when it isn't up, waits for the boot, an app's launch, and a calm Mac, and has a "
            "keeper shut it down once nothing has used it for "
            f"{IDLE_LIMIT_SECONDS // 60} minutes, or sooner when memory runs short, but never "
            f"while boot is bringing it up or in the {HANDOVER_SECONDS // 60} minutes after "
            "boot hands it over; shutdown stops this checkout's Simulators now. Both, and the "
            "keeper, delete the copies of the app that earlier installs replaced, which the "
            "Simulator keeps. delete removes this worktree's Simulators and build folder; prune "
            "removes those of worktrees that are gone."
        )
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="udid",
        choices=["udid", "derived-data", "boot", "shutdown", "delete", "prune"],
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
    if options.command == "boot":
        print(f"{simulator_name(options.device, scope)} {boot(options.device, scope)}")
        return 0
    if options.command == "shutdown":
        stopped = shut_down(scope, listed("devices")["devices"])
        print("\n".join(stopped) if stopped else "Nothing was running.")
        return 0
    removed = prune() if options.command == "prune" else delete(scope)
    print("\n".join(removed) if removed else "Nothing to remove.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
