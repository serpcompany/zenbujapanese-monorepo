from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections.abc import Callable
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
KEEPERS = BUILD_CACHE.parent / "SimulatorKeepers"
SIMULATORS = Path.home() / "Library" / "Developer" / "CoreSimulator" / "Devices"
DEAD_INSTALLS = Path("data") / "Library" / "Caches" / "com.apple.containermanagerd" / "Dead"
CALM_IDLE_PERCENT = 50
CALM_SAMPLES = 2
CALM_SAMPLE_SECONDS = 2
CALM_LIMIT_SECONDS = 120
IDLE_LIMIT_SECONDS = 600
KEEPER_PERIOD_SECONDS = 20
LEAST_FREE_MEMORY_PERCENT = 40
MOST_SWAP_MEGABYTES = 2000


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


def is_booted(udid: str) -> bool:
    return any(
        device["udid"] == udid and device.get("state") == "Booted"
        for device in every(listed("devices")["devices"])
    )


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


def running(scope: str | None, devices: dict[str, list[dict]]) -> list[dict]:
    return [
        device
        for device in every(devices)
        if device["name"] in scope_names(scope) and device.get("state") != "Shutdown"
    ]


def dead_installs(udid: str, simulators: Path = SIMULATORS) -> Path:
    return simulators / udid / DEAD_INSTALLS


def size_of(path: Path) -> int:
    if path.is_symlink() or not path.is_dir():
        return path.lstat().st_size
    return sum(entry.lstat().st_size for entry in path.rglob("*") if not entry.is_dir())


def empty_dead_installs(udid: str, simulators: Path = SIMULATORS) -> tuple[int, int]:
    folder = dead_installs(udid, simulators)
    if folder.is_symlink() or not folder.is_dir():
        return 0, 0
    emptied = 0
    freed = 0
    for entry in folder.iterdir():
        try:
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


def boot(kind: str, scope: str | None) -> str:
    target = udid(kind, scope)
    emptied = said_emptied(*empty_dead_installs(target))
    up = running(scope, listed("devices")["devices"])
    idle_others = [
        device for device in up if device["udid"] != target and not is_in_use(device["udid"])
    ]
    for other in idle_others:
        simctl("shutdown", other["udid"])
    if any(device["udid"] == target and device.get("state") == "Booted" for device in up):
        said = "was already up"
    else:
        began = time.monotonic()
        simctl("boot", target)
        simctl("bootstatus", target, "-b")
        booted = time.monotonic() - began
        waited, calm = wait_until_calm()
        said = f"booted in {booted:.0f} s, and the Mac " + (
            f"was calm {waited:.0f} s later" if calm else f"was still busy {waited:.0f} s later"
        )
    keep(target)
    return (
        said
        + emptied
        + "".join(
            f"; {other['name']} was shut down, since nothing was using it" for other in idle_others
        )
    )


def keeper_file(udid: str, keepers: Path = KEEPERS) -> Path:
    return keepers / f"{udid}.pid"


def keeper_is_alive(file: Path, udid: str) -> bool:
    try:
        pid = int(file.read_text())
    except (OSError, ValueError):
        return False
    shown = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True)
    return "keeper" in shown.stdout and udid in shown.stdout


def keep(udid: str, keepers: Path = KEEPERS) -> None:
    file = keeper_file(udid, keepers)
    file.parent.mkdir(parents=True, exist_ok=True)
    if keeper_is_alive(file, udid):
        file.touch()
        return
    with (keepers / f"{udid}.log").open("a") as log:
        keeper = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "keeper", "--udid", udid],
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    file.write_text(str(keeper.pid))


def is_in_use(udid: str) -> bool:
    return subprocess.run(["pgrep", "-f", f"id={udid}"], capture_output=True).returncode == 0


def free_memory_percent() -> int:
    return int(re.search(r"free percentage: (\d+)%", run("memory_pressure", "-Q")).group(1))


def swap_megabytes() -> float:
    return float(re.search(r"used = ([\d.]+)M", run("sysctl", "-n", "vm.swapusage")).group(1))


def reason_to_shut_down(in_use: bool, idle_seconds: float, free: int, swap: float) -> str | None:
    if in_use:
        return None
    if free < LEAST_FREE_MEMORY_PERCENT or swap > MOST_SWAP_MEGABYTES:
        return f"memory was short ({free}% free, {swap:.0f} MB of swap) and nothing was using it"
    if idle_seconds >= IDLE_LIMIT_SECONDS:
        return f"nothing had used it for {IDLE_LIMIT_SECONDS // 60} minutes"
    return None


def keeper(udid: str, keepers: Path = KEEPERS) -> None:
    file = keeper_file(udid, keepers)
    last_used = time.time()
    while True:
        time.sleep(KEEPER_PERIOD_SECONDS)
        try:
            if not is_booted(udid):
                break
            in_use = is_in_use(udid)
            if in_use:
                last_used = time.time()
            else:
                note_emptied(udid)
                if file.exists():
                    last_used = max(last_used, file.stat().st_mtime)
            reason = reason_to_shut_down(
                in_use, time.time() - last_used, free_memory_percent(), swap_megabytes()
            )
        except SystemExit as failed:
            print(f"{time.strftime('%F %T')} could not look: {failed}", flush=True)
            continue
        if reason:
            subprocess.run(["xcrun", "simctl", "shutdown", udid], capture_output=True)
            print(f"{time.strftime('%F %T')} shut down: {reason}", flush=True)
            note_emptied(udid)
            break
    file.unlink(missing_ok=True)


def note_emptied(udid: str) -> None:
    emptied = said_emptied(*empty_dead_installs(udid))
    if emptied:
        print(f"{time.strftime('%F %T')} {emptied.removeprefix('; ')}", flush=True)


def shut_down(scope: str | None, devices: dict[str, list[dict]]) -> list[str]:
    said = []
    for device in running(scope, devices):
        simctl("shutdown", device["udid"])
        said.append(device["name"] + said_emptied(*empty_dead_installs(device["udid"])))
    return said


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
            "derived-data prints this checkout's own build folder. boot starts the Simulator "
            "when it isn't up, waits for the boot and for the Mac to be calm again, and has a "
            "keeper shut it down once nothing has used it for "
            f"{IDLE_LIMIT_SECONDS // 60} minutes, or sooner when memory runs short; shutdown "
            "stops this checkout's Simulators now. Both, and the keeper, delete the copies of "
            "the app that earlier installs replaced, which the Simulator keeps. delete removes this worktree's Simulators "
            "and build folder; prune removes those of worktrees that are gone."
        )
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="udid",
        choices=["udid", "derived-data", "boot", "shutdown", "delete", "prune", "keeper"],
    )
    parser.add_argument("--device", default="iphone", choices=sorted(KINDS))
    parser.add_argument("--udid", help=argparse.SUPPRESS)
    options = parser.parse_args(arguments)
    if options.command == "keeper":
        keeper(options.udid)
        return 0
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
