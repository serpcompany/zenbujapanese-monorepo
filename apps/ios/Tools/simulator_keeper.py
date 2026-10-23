from __future__ import annotations

import argparse
import fcntl
import re
import subprocess
import sys
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

from simulator_devices import TOOL_CACHE, empty_dead_installs, is_booted, run, said_emptied

KEEPERS = TOOL_CACHE / "SimulatorKeepers"
IDLE_LIMIT_SECONDS = 600
KEEPER_PERIOD_SECONDS = 20
LEAST_FREE_MEMORY_PERCENT = 40
MEMORY_IDLE_SECONDS = 120
MOST_SWAP_MEGABYTES = 2000
HANDOVER_SECONDS = 300


def keeper_file(udid: str, keepers: Path = KEEPERS) -> Path:
    return keepers / f"{udid}.pid"


def boot_lease(udid: str, keepers: Path = KEEPERS) -> Path:
    return keepers / f"{udid}.boot"


@contextmanager
def booting(udid: str, keepers: Path = KEEPERS) -> Iterator[None]:
    lease = boot_lease(udid, keepers)
    lease.parent.mkdir(parents=True, exist_ok=True)
    with lease.open("a") as held:
        fcntl.flock(held, fcntl.LOCK_SH)
        yield


def is_booting(udid: str, keepers: Path = KEEPERS) -> bool:
    try:
        with boot_lease(udid, keepers).open() as lease:
            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    except OSError:
        return False
    return False


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
            [sys.executable, str(Path(__file__).resolve()), "--udid", udid],
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    file.write_text(str(keeper.pid))


def a_command_names(udid: str) -> bool:
    named = f"id={udid}|simctl.*{udid}"
    return subprocess.run(["pgrep", "-f", named], capture_output=True).returncode == 0


def is_in_use(udid: str, keepers: Path = KEEPERS) -> bool:
    return a_command_names(udid) or is_booting(udid, keepers)


def free_memory_percent() -> int:
    return int(re.search(r"free percentage: (\d+)%", run("memory_pressure", "-Q")).group(1))


def swap_megabytes() -> float:
    return float(re.search(r"used = ([\d.]+)M", run("sysctl", "-n", "vm.swapusage")).group(1))


def reason_to_shut_down(
    in_use: bool, idle_seconds: float, handed_over_seconds: float, free: int, swap: float
) -> str | None:
    if in_use or handed_over_seconds < HANDOVER_SECONDS:
        return None
    memory_short = free < LEAST_FREE_MEMORY_PERCENT or swap > MOST_SWAP_MEGABYTES
    if memory_short and idle_seconds >= MEMORY_IDLE_SECONDS:
        return f"memory was short ({free}% free, {swap:.0f} MB of swap) and nothing was using it"
    if idle_seconds >= IDLE_LIMIT_SECONDS:
        return f"nothing had used it for {IDLE_LIMIT_SECONDS // 60} minutes"
    return None


def stop(udid: str) -> None:
    subprocess.run(["xcrun", "simctl", "shutdown", udid], capture_output=True)


def keeper(
    udid: str,
    keepers: Path = KEEPERS,
    clock: Callable[[], float] = time.time,
    pause: Callable[[float], None] = time.sleep,
) -> None:
    file = keeper_file(udid, keepers)
    last_used = clock()
    while True:
        pause(KEEPER_PERIOD_SECONDS)
        try:
            if not is_booted(udid):
                break
            now = clock()
            handed_over = file.stat().st_mtime if file.exists() else 0.0
            in_use = is_in_use(udid, keepers)
            if in_use:
                last_used = now
            else:
                note_emptied(udid)
                last_used = max(last_used, handed_over)
            reason = reason_to_shut_down(
                in_use, now - last_used, now - handed_over, free_memory_percent(), swap_megabytes()
            )
        except (SystemExit, Exception) as failed:
            print(f"{time.strftime('%F %T')} could not look: {failed}", flush=True)
            continue
        if reason:
            stop(udid)
            print(f"{time.strftime('%F %T')} shut down: {reason}", flush=True)
            note_emptied(udid)
            break
    file.unlink(missing_ok=True)


def note_emptied(udid: str) -> None:
    emptied = said_emptied(*empty_dead_installs(udid))
    if emptied:
        print(f"{time.strftime('%F %T')} {emptied.removeprefix('; ')}", flush=True)


def main(arguments: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Watches a Simulator that simulator.py boot handed over, and shuts it down once "
            f"nothing has used it for {IDLE_LIMIT_SECONDS // 60} minutes, or sooner when memory "
            "runs short. A boot still bringing it up counts as use, and so do the "
            f"{HANDOVER_SECONDS // 60} minutes after a boot hands it over."
        )
    )
    parser.add_argument("--udid", required=True)
    keeper(parser.parse_args(arguments).udid)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
