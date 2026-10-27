from __future__ import annotations

import itertools
import subprocess
import sys
import tempfile
import unittest
from collections.abc import Callable, Iterable
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import simulator
import simulator_keeper

DEVICE_TYPES = [
    {"name": "iPhone 16 Pro Max", "identifier": "type.iPhone-16-Pro-Max"},
    {"name": "iPhone 17 Pro Max", "identifier": "type.iPhone-17-Pro-Max"},
    {"name": "iPhone 17 Pro", "identifier": "type.iPhone-17-Pro"},
    {"name": "iPad Pro 13-inch (M4)", "identifier": "type.iPad-Pro-13-inch-M4"},
    {"name": "iPad Pro 13-inch (M5)", "identifier": "type.iPad-Pro-13-inch-M5"},
    {"name": "iPad Pro 13-inch (M5) (16GB)", "identifier": "type.iPad-Pro-13-inch-M5-16GB"},
    {"name": "iPad Pro 11-inch (M5)", "identifier": "type.iPad-Pro-11-inch-M5"},
]
OLDER_DEVICE_TYPES = [DEVICE_TYPES[0], DEVICE_TYPES[3]]


def runtime(name: str, version: str, device_types: list, is_available: bool = True) -> dict:
    return {
        "identifier": f"com.apple.CoreSimulator.SimRuntime.{name}",
        "version": version,
        "isAvailable": is_available,
        "supportedDeviceTypes": device_types,
    }


RUNTIMES = [
    runtime("iOS-18-6", "18.6", OLDER_DEVICE_TYPES),
    runtime("iOS-26-2", "26.2", DEVICE_TYPES),
    runtime("iOS-27-0", "27.0", DEVICE_TYPES, is_available=False),
    runtime("watchOS-26-2", "26.2", []),
]


def device(name: str, udid: str, state: str = "Shutdown", is_available: bool = True) -> dict:
    return {"name": name, "udid": udid, "state": state, "isAvailable": is_available}


def launching(udid: str) -> list[tuple[str, ...]]:
    return [("launch", udid, simulator.SETTLED_APP), ("terminate", udid, simulator.SETTLED_APP)]


class PreferencesDaemon:
    def __init__(self, saves: Iterable[bool]) -> None:
        self.saves = iter(saves)
        self.saved: dict[tuple[str, ...], str] = {}

    def __call__(self, target: str, *command: str) -> subprocess.CompletedProcess[str]:
        _, verb, domain, key, *value = command
        if verb == "write":
            if next(self.saves, False):
                self.saved[(target, domain, key)] = value[0]
            return subprocess.CompletedProcess(command, 0, "", "")
        if (target, domain, key) in self.saved:
            return subprocess.CompletedProcess(command, 0, self.saved[(target, domain, key)] + "\n", "")
        return subprocess.CompletedProcess(command, 1, "", "The domain/default pair does not exist\n")


DEVICES = {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-2": [
        device("iPhone 17 Pro Max", "DEFAULT"),
        device("zenbu-japanese", "APP"),
        device("zenbu-japanese-ipad", "APP-IPAD"),
        device("zenbu-japanese--issue-12-sidebar", "LIVE"),
        device("zenbu-japanese-ipad--issue-12-sidebar", "LIVE-IPAD"),
        device("zenbu-japanese--issue-9-gone", "GONE"),
        device("zenbu-japanese-ipad--issue-9-gone", "GONE-IPAD"),
        device("zenbu-japanese--issue-8-running", "RUNNING"),
        device("zenbu-japanese-ipad--issue-8-running", "RUNNING-IPAD", state="Booted"),
        device("keybumps--issue-9-gone", "ANOTHER-PROJECT"),
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-18-6": [
        device("zenbu-japanese--issue-7-old", "UNAVAILABLE", is_available=False),
    ],
}


class SimulatorTests(unittest.TestCase):
    def test_the_main_checkout_gets_the_apps_own_simulator_and_a_worktree_its_own(self) -> None:
        self.assertEqual(simulator.simulator_name("iphone", None), "zenbu-japanese")
        self.assertEqual(simulator.simulator_name("ipad", None), "zenbu-japanese-ipad")
        self.assertEqual(
            simulator.simulator_name("iphone", "issue-12-sidebar"), "zenbu-japanese--issue-12-sidebar"
        )
        self.assertEqual(
            simulator.simulator_name("ipad", "issue-12-sidebar"),
            "zenbu-japanese-ipad--issue-12-sidebar",
        )

    def test_a_scope_keeps_only_what_a_simulator_name_can_hold(self) -> None:
        self.assertEqual(simulator.safe_scope("fix/701 english sort"), "fix-701-english-sort")
        self.assertEqual(simulator.safe_scope("mac-and-ipad"), "mac-and-ipad")
        with self.assertRaises(SystemExit):
            simulator.safe_scope("///")

    def test_a_name_gives_its_scope_back_only_for_this_app(self) -> None:
        self.assertEqual(simulator.scope_in("zenbu-japanese--issue-12-sidebar"), "issue-12-sidebar")
        self.assertEqual(simulator.scope_in("zenbu-japanese-ipad--issue-12-a--b"), "issue-12-a--b")
        self.assertIsNone(simulator.scope_in("zenbu-japanese"))
        self.assertIsNone(simulator.scope_in("keybumps--issue-9-gone"))
        self.assertIsNone(simulator.scope_in("iPhone 17 Pro Max"))

    def test_a_name_that_could_lead_out_of_the_build_cache_has_no_scope(self) -> None:
        for name in [
            "zenbu-japanese--x/../../../..",
            "zenbu-japanese--..",
            "zenbu-japanese--.",
            "zenbu-japanese--a b",
            "zenbu-japanese--x\n",
            "zenbu-japanese--",
        ]:
            self.assertIsNone(simulator.scope_in(name), name)
        hand_made = {"runtime": [device("zenbu-japanese--x/../../../..", "HAND-MADE")]}
        self.assertEqual(simulator.prunable_scopes(hand_made, ["zenbu-japanese--x"], set()), ["x"])

    def test_a_new_simulator_is_the_newest_large_iphone_or_ipad(self) -> None:
        newest, older = RUNTIMES[1], RUNTIMES[0]
        self.assertEqual(simulator.newest_device_type("iphone", newest), "type.iPhone-17-Pro-Max")
        self.assertEqual(simulator.newest_device_type("ipad", newest), "type.iPad-Pro-13-inch-M5")
        self.assertEqual(simulator.newest_device_type("iphone", older), "type.iPhone-16-Pro-Max")
        self.assertEqual(simulator.newest_device_type("ipad", older), "type.iPad-Pro-13-inch-M4")
        with self.assertRaises(SystemExit) as none:
            simulator.newest_device_type("iphone", RUNTIMES[3])
        self.assertIn("iOS 26.2 runs no Simulator device", str(none.exception))

    def test_a_new_simulator_runs_the_newest_ios_the_selected_xcode_can(self) -> None:
        newer = [
            *RUNTIMES,
            runtime("iOS-26-5", "26.5", DEVICE_TYPES),
            runtime("iOS-26-2-1", "26.2.1", DEVICE_TYPES),
        ]

        def chosen(sdk: str) -> str:
            return simulator.newest_runtime(newer, sdk)["identifier"]

        self.assertEqual(chosen("26.2"), "com.apple.CoreSimulator.SimRuntime.iOS-26-2-1")
        self.assertEqual(chosen("26.6"), "com.apple.CoreSimulator.SimRuntime.iOS-26-5")
        self.assertEqual(chosen("18.6"), "com.apple.CoreSimulator.SimRuntime.iOS-18-6")
        with self.assertRaises(SystemExit) as none:
            simulator.newest_runtime(newer, "18.0")
        self.assertIn("iOS 18.0 or older", str(none.exception))

    def test_it_finds_a_simulator_by_its_exact_name_and_never_borrows_another(self) -> None:
        self.assertEqual(simulator.find(DEVICES, "zenbu-japanese"), "APP")
        self.assertEqual(simulator.find(DEVICES, "zenbu-japanese--issue-12-sidebar"), "LIVE")
        self.assertIsNone(simulator.find(DEVICES, "zenbu-japanese--issue-3-new"))
        self.assertIsNone(simulator.find(DEVICES, "zenbu-japanese--issue-7-old"))

    def test_each_checkout_builds_in_its_own_folder(self) -> None:
        cache = Path("/cache")
        self.assertEqual(simulator.derived_data(None, cache), cache / "zenbu-japanese")
        self.assertEqual(
            simulator.derived_data("issue-12-sidebar", cache),
            cache / "zenbu-japanese--issue-12-sidebar",
        )

    def test_prune_takes_scopes_whose_worktree_is_gone_and_whose_simulators_are_all_shut_down(
        self,
    ) -> None:
        folders = [
            "zenbu-japanese",
            "zenbu-japanese--issue-12-sidebar",
            "zenbu-japanese--issue-5-build-only",
            "zenbu-japanese--issue-8-running",
            "another-app--issue-5-build-only",
        ]
        self.assertEqual(
            simulator.prunable_scopes(DEVICES, folders, {"issue-12-sidebar"}),
            ["issue-5-build-only", "issue-7-old", "issue-9-gone"],
        )

    def test_removing_a_scope_takes_its_simulators_and_its_build_folder_and_nothing_else(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as scratch, tempfile.TemporaryDirectory() as keepers:
            cache = Path(scratch)
            for name in ["zenbu-japanese", "zenbu-japanese--issue-9-gone", "zenbu-japanese--issue-12-sidebar"]:
                (cache / name / "Build").mkdir(parents=True)
            for udid in ["GONE", "GONE-IPAD", "LIVE"]:
                simulator_keeper.boot_lease(udid, Path(keepers)).touch()
            with mock.patch.object(simulator, "simctl") as simctl:
                removed = simulator.remove("issue-9-gone", DEVICES, cache, Path(keepers))
            self.assertEqual([lease.name for lease in Path(keepers).iterdir()], ["LIVE.boot"])
            self.assertEqual(
                [call.args for call in simctl.call_args_list],
                [("delete", "GONE"), ("delete", "GONE-IPAD")],
            )
            self.assertEqual(
                removed,
                [
                    "zenbu-japanese--issue-9-gone",
                    "zenbu-japanese-ipad--issue-9-gone",
                    str(cache / "zenbu-japanese--issue-9-gone"),
                ],
            )
            self.assertEqual(
                sorted(entry.name for entry in cache.iterdir()),
                ["zenbu-japanese", "zenbu-japanese--issue-12-sidebar"],
            )

    def test_removing_a_scope_never_reaches_outside_the_build_cache(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            cache = Path(scratch) / "cache"
            outside = Path(scratch) / "outside"
            (cache / "zenbu-japanese--x").mkdir(parents=True)
            (outside / "kept").mkdir(parents=True)
            (cache / "zenbu-japanese--linked").symlink_to(outside, target_is_directory=True)
            with mock.patch.object(simulator, "simctl"):
                self.assertEqual(simulator.remove("x/../..", {}, cache), [])
                self.assertEqual(simulator.remove("linked", {}, cache), [])
            self.assertTrue((outside / "kept").is_dir())
            self.assertTrue((cache / "zenbu-japanese--x").is_dir())

    def test_a_running_simulator_is_shut_down_before_its_own_scope_deletes_it(self) -> None:
        with tempfile.TemporaryDirectory() as scratch, mock.patch.object(
            simulator, "simctl"
        ) as simctl:
            simulator.remove("issue-8-running", DEVICES, Path(scratch))
        self.assertEqual(
            [call.args for call in simctl.call_args_list],
            [("delete", "RUNNING"), ("shutdown", "RUNNING-IPAD"), ("delete", "RUNNING-IPAD")],
        )

    def booting(
        self,
        kind: str,
        scope: str,
        in_use: bool = False,
        dead: tuple[int, int] = (0, 0),
        calm: Callable[[], tuple[float, bool]] = lambda: (41.0, True),
        still_up: bool = True,
        keepers: Path | None = None,
        saves: Iterable[bool] = itertools.repeat(True),
        commands: list[tuple[str, ...]] | None = None,
    ) -> tuple[str, list, list, list]:
        commands = [] if commands is None else commands
        with tempfile.TemporaryDirectory() as scratch, ExitStack() as stand_ins:

            def stand_in(name: str, **how: object) -> mock.Mock:
                return stand_ins.enter_context(mock.patch.object(simulator, name, **how))

            stand_in("listed", return_value={"devices": DEVICES})
            stand_in("is_in_use", return_value=in_use)
            stand_in("a_command_names", return_value=in_use)
            stand_in("spawned", side_effect=PreferencesDaemon(saves))
            stand_in("empty_dead_installs", return_value=dead)
            stand_in("is_booted", return_value=still_up)
            stand_in("simctl", side_effect=lambda *arguments: commands.append(arguments))
            wait = stand_in("wait_until_calm", side_effect=calm)
            keep = stand_in("keep")
            said = simulator.boot(kind, scope, keepers or Path(scratch))
        return said, commands, wait.call_args_list, [call.args[0] for call in keep.call_args_list]

    def test_a_simulator_that_is_up_is_not_booted_again_and_gets_no_wait(self) -> None:
        said, commands, waits, kept = self.booting("ipad", "issue-8-running")
        self.assertEqual(said, "was already up")
        self.assertEqual(commands, [])
        self.assertEqual(waits, [])
        self.assertEqual(kept, ["RUNNING-IPAD"])

    def test_a_boot_waits_for_the_boot_an_app_launch_and_the_mac_and_starts_a_keeper(self) -> None:
        said, commands, _, kept = self.booting("iphone", "issue-12-sidebar")
        self.assertEqual(commands, [("boot", "LIVE"), ("bootstatus", "LIVE", "-b"), *launching("LIVE")])
        self.assertRegex(
            said, r"^booted in \d+ s, launched an app \d+ s later, and the Mac was calm 41 s later$"
        )
        self.assertEqual(kept, ["LIVE", "LIVE"])

    def test_boot_counts_as_use_until_it_hands_the_simulator_over(self) -> None:
        with tempfile.TemporaryDirectory() as scratch, mock.patch.object(
            simulator_keeper, "a_command_names", return_value=False
        ):
            keepers = Path(scratch)
            looks = []

            def busy_mac() -> tuple[float, bool]:
                looks.append((simulator_keeper.is_in_use("LIVE", keepers), simulator.keep.call_count))
                return 120.0, False

            said, _, _, kept = self.booting(
                "iphone", "issue-12-sidebar", calm=busy_mac, keepers=keepers
            )
            self.assertFalse(simulator_keeper.is_in_use("LIVE", keepers))
        self.assertEqual(looks, [(True, 1)], "in use through the wait, handed over after it")
        self.assertEqual(kept, ["LIVE", "LIVE"])
        self.assertTrue(said.endswith("and the Mac was still busy 120 s later"))

    def test_a_simulator_shut_down_while_boot_waits_is_not_handed_over(self) -> None:
        with self.assertRaises(SystemExit) as refused:
            self.booting("iphone", "issue-12-sidebar", still_up=False)
        self.assertIn(
            "zenbu-japanese--issue-12-sidebar was shut down while boot waited for it",
            str(refused.exception),
        )

    def test_a_simulator_whose_preferences_daemon_refuses_writes_is_restarted_and_says_so(
        self,
    ) -> None:
        said, commands, _, kept = self.booting("ipad", "issue-8-running", saves=[False, True])
        self.assertEqual(
            commands,
            [
                ("shutdown", "RUNNING-IPAD"),
                ("boot", "RUNNING-IPAD"),
                ("bootstatus", "RUNNING-IPAD", "-b"),
                *launching("RUNNING-IPAD"),
            ],
        )
        self.assertRegex(
            said,
            r"^was up, but its preferences daemon \(cfprefsd\) refused writes, so it was restarted: "
            r"booted in \d+ s, launched an app \d+ s later, and the Mac was calm 41 s later$",
        )
        self.assertEqual(kept, ["RUNNING-IPAD", "RUNNING-IPAD"])

    def test_a_simulator_in_use_is_left_up_though_its_preferences_daemon_refuses_writes(
        self,
    ) -> None:
        commands = []
        with self.assertRaises(SystemExit) as refused:
            self.booting("ipad", "issue-8-running", in_use=True, saves=[False], commands=commands)
        self.assertIn("refuses every defaults write", str(refused.exception))
        self.assertIn("but something is using it", str(refused.exception))
        self.assertEqual(commands, [])

    def test_a_simulator_whose_preferences_still_refuse_after_a_restart_is_not_handed_over(
        self,
    ) -> None:
        commands = []
        with self.assertRaises(SystemExit) as refused:
            self.booting("ipad", "issue-8-running", saves=[False, False], commands=commands)
        self.assertIn("refuses every defaults write, even after a restart", str(refused.exception))
        self.assertEqual(commands[:2], [("shutdown", "RUNNING-IPAD"), ("boot", "RUNNING-IPAD")])

    def test_the_preferences_probe_passes_only_when_its_own_write_reads_back(self) -> None:
        with mock.patch.object(simulator, "spawned", side_effect=PreferencesDaemon([True, False])):
            self.assertTrue(simulator.preferences_are_saved("LIVE"))
            self.assertFalse(simulator.preferences_are_saved("LIVE"), "an earlier probe's value")
        with mock.patch.object(simulator, "spawned", side_effect=PreferencesDaemon([False])):
            self.assertFalse(simulator.preferences_are_saved("LIVE"))

    def test_a_checkout_keeps_one_simulator_up_unless_the_other_is_in_use(self) -> None:
        said, commands, _, _ = self.booting("iphone", "issue-8-running")
        self.assertEqual(
            commands,
            [
                ("shutdown", "RUNNING-IPAD"),
                ("boot", "RUNNING"),
                ("bootstatus", "RUNNING", "-b"),
                *launching("RUNNING"),
            ],
        )
        self.assertIn("zenbu-japanese-ipad--issue-8-running was shut down", said)
        said, commands, _, _ = self.booting("iphone", "issue-8-running", in_use=True)
        self.assertEqual(
            commands, [("boot", "RUNNING"), ("bootstatus", "RUNNING", "-b"), *launching("RUNNING")]
        )
        self.assertNotIn("shut down", said)

    def test_idleness_is_read_from_the_last_sample_not_the_average_since_startup(self) -> None:
        shown = (
            "      cpu    load average\n"
            " us sy id   1m   5m   15m\n"
            " 29  9 62  54.62 84.95 99.98\n"
            " 70 30  0  59.21 85.40 100.05\n"
        )
        self.assertEqual(simulator.idle_percent_in(shown), 0.0)

    def test_the_mac_is_calm_once_its_processors_are_idle_twice_running(self) -> None:
        samples = iter([3.0, 60.0, 20.0, 55.0, 71.0, 99.0])
        seconds = iter(range(0, 100, 2))
        waited, calm = simulator.wait_until_calm(lambda: next(samples), lambda: next(seconds))
        self.assertTrue(calm)
        self.assertEqual(next(samples), 99.0, "it stops at the second calm sample running")
        self.assertGreater(waited, 0)

    def test_a_mac_that_stays_busy_is_waited_for_only_to_the_limit(self) -> None:
        seconds = iter(range(0, 1000, 2))
        waited, calm = simulator.wait_until_calm(lambda: 5.0, lambda: next(seconds), limit=30)
        self.assertFalse(calm)
        self.assertGreaterEqual(waited, 30)
        self.assertLess(waited, 40)

    def test_shutdown_stops_this_checkouts_running_simulators_and_no_others(self) -> None:
        with mock.patch.object(simulator, "simctl") as simctl, mock.patch.object(
            simulator, "empty_dead_installs", return_value=(2, 1_600_000_000)
        ) as emptied, mock.patch.object(simulator, "is_in_use", return_value=False):
            stopped = simulator.shut_down("issue-8-running", DEVICES)
            self.assertEqual(simulator.shut_down("issue-12-sidebar", DEVICES), [])
        self.assertEqual(
            stopped,
            ["zenbu-japanese-ipad--issue-8-running; deleted 2 old installs of the app (1.6 GB) it had kept"],
        )
        self.assertEqual([call.args for call in simctl.call_args_list], [("shutdown", "RUNNING-IPAD")])
        self.assertEqual(emptied.call_args_list, [mock.call("RUNNING-IPAD")])

    def test_shutdown_leaves_a_simulator_something_is_using(self) -> None:
        now = [0.0]
        with mock.patch.object(simulator, "simctl") as simctl, mock.patch.object(
            simulator, "is_in_use", return_value=True
        ):
            said = simulator.shut_down(
                "issue-8-running", DEVICES, lambda: now[0], lambda seconds: now.__setitem__(0, now[0] + seconds)
            )
        self.assertEqual(said, ["zenbu-japanese-ipad--issue-8-running stays up, since something is using it"])
        self.assertEqual(now[0], simulator.RUN_ENDING_SECONDS)
        simctl.assert_not_called()

    def test_shutdown_waits_for_a_run_that_is_ending_to_let_its_simulator_go(self) -> None:
        looks = iter([True, True, False])
        pauses = []
        with mock.patch.object(simulator, "simctl") as simctl, mock.patch.object(
            simulator, "empty_dead_installs", return_value=(0, 0)
        ), mock.patch.object(simulator, "is_in_use", side_effect=lambda _: next(looks)):
            said = simulator.shut_down("issue-8-running", DEVICES, lambda: 0.0, pauses.append)
        self.assertEqual(said, ["zenbu-japanese-ipad--issue-8-running"])
        self.assertEqual(pauses, [simulator.RUN_ENDING_LOOK_SECONDS] * 2)
        self.assertEqual([call.args for call in simctl.call_args_list], [("shutdown", "RUNNING-IPAD")])

    def test_a_simulator_up_between_runs_has_its_old_installs_of_the_app_deleted(self) -> None:
        said, commands, _, _ = self.booting("ipad", "issue-8-running", dead=(46, 18_000_000_000))
        self.assertEqual(commands, [])
        self.assertEqual(
            said, "was already up; deleted 46 old installs of the app (18.0 GB) it had kept"
        )

    def test_delete_refuses_the_apps_own_simulators(self) -> None:
        with self.assertRaises(SystemExit) as refused:
            simulator.delete(None)
        self.assertIn("aren't deleted", str(refused.exception))


if __name__ == "__main__":
    unittest.main()
