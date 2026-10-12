import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import simulator

DEVICE_TYPES = [
    {"name": "iPhone 16 Pro Max", "identifier": "type.iPhone-16-Pro-Max"},
    {"name": "iPhone 17 Pro Max", "identifier": "type.iPhone-17-Pro-Max"},
    {"name": "iPhone 17 Pro", "identifier": "type.iPhone-17-Pro"},
    {"name": "iPad Pro 13-inch (M4)", "identifier": "type.iPad-Pro-13-inch-M4"},
    {"name": "iPad Pro 13-inch (M5)", "identifier": "type.iPad-Pro-13-inch-M5"},
    {"name": "iPad Pro 13-inch (M5) (16GB)", "identifier": "type.iPad-Pro-13-inch-M5-16GB"},
    {"name": "iPad Pro 11-inch (M5)", "identifier": "type.iPad-Pro-11-inch-M5"},
]
RUNTIMES = [
    {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-18-6", "version": "18.6", "isAvailable": True},
    {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-2", "version": "26.2", "isAvailable": True},
    {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-27-0", "version": "27.0", "isAvailable": False},
    {"identifier": "com.apple.CoreSimulator.SimRuntime.watchOS-26-2", "version": "26.2", "isAvailable": True},
]


def device(name: str, udid: str, state: str = "Shutdown", is_available: bool = True) -> dict:
    return {"name": name, "udid": udid, "state": state, "isAvailable": is_available}


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

    def test_a_new_simulator_is_the_newest_large_iphone_or_ipad(self) -> None:
        self.assertEqual(simulator.newest_device_type("iphone", DEVICE_TYPES), "type.iPhone-17-Pro-Max")
        self.assertEqual(simulator.newest_device_type("ipad", DEVICE_TYPES), "type.iPad-Pro-13-inch-M5")
        with self.assertRaises(SystemExit):
            simulator.newest_device_type("iphone", [])

    def test_a_new_simulator_runs_the_newest_ios_the_selected_xcode_can(self) -> None:
        newer = [
            *RUNTIMES,
            {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-5", "version": "26.5", "isAvailable": True},
            {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-2-1", "version": "26.2.1", "isAvailable": True},
        ]
        self.assertEqual(
            simulator.newest_runtime(newer, "26.2"), "com.apple.CoreSimulator.SimRuntime.iOS-26-2-1"
        )
        self.assertEqual(
            simulator.newest_runtime(newer, "26.6"), "com.apple.CoreSimulator.SimRuntime.iOS-26-5"
        )
        self.assertEqual(
            simulator.newest_runtime(newer, "18.6"), "com.apple.CoreSimulator.SimRuntime.iOS-18-6"
        )
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
        with tempfile.TemporaryDirectory() as scratch:
            cache = Path(scratch)
            for name in ["zenbu-japanese", "zenbu-japanese--issue-9-gone", "zenbu-japanese--issue-12-sidebar"]:
                (cache / name / "Build").mkdir(parents=True)
            with mock.patch.object(simulator, "simctl") as simctl:
                removed = simulator.remove("issue-9-gone", DEVICES, cache)
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

    def test_a_running_simulator_is_shut_down_before_its_own_scope_deletes_it(self) -> None:
        with tempfile.TemporaryDirectory() as scratch, mock.patch.object(
            simulator, "simctl"
        ) as simctl:
            simulator.remove("issue-8-running", DEVICES, Path(scratch))
        self.assertEqual(
            [call.args for call in simctl.call_args_list],
            [("delete", "RUNNING"), ("shutdown", "RUNNING-IPAD"), ("delete", "RUNNING-IPAD")],
        )

    def test_delete_refuses_the_apps_own_simulators(self) -> None:
        with self.assertRaises(SystemExit) as refused:
            simulator.delete(None)
        self.assertIn("aren't deleted", str(refused.exception))


if __name__ == "__main__":
    unittest.main()
