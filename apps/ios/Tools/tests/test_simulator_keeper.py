from __future__ import annotations

import io
import os
import sys
import tempfile
import time
import unittest
from contextlib import ExitStack, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import simulator_keeper

REPORTED_FREE_PERCENT = 57
REPORTED_SWAP_MEGABYTES = 2028.0


class KeeperTests(unittest.TestCase):
    def watch(
        self, free: int, swap: float, boot_seconds: float | None = None
    ) -> tuple[float, list, str]:
        start = time.time()
        now = [start]
        with tempfile.TemporaryDirectory() as scratch, ExitStack() as stand_ins:
            keepers = Path(scratch)
            handed_over = simulator_keeper.keeper_file("LIVE", keepers)
            handed_over.write_text("4321")
            os.utime(handed_over, (start, start))
            lease = ExitStack()
            if boot_seconds is not None:
                lease.enter_context(simulator_keeper.booting("LIVE", keepers))
            booting = [boot_seconds is not None]

            def is_booted(_: str) -> bool:
                if booting[0] and now[0] - start >= boot_seconds:
                    os.utime(handed_over, (now[0], now[0]))
                    lease.close()
                    booting[0] = False
                return now[0] - start < 3600

            for name, stand_in in [
                ("is_booted", is_booted),
                ("a_command_names", lambda _: False),
                ("free_memory_percent", lambda: free),
                ("swap_megabytes", lambda: swap),
                ("note_emptied", lambda _: None),
            ]:
                stand_ins.enter_context(mock.patch.object(simulator_keeper, name, stand_in))
            stop = stand_ins.enter_context(mock.patch.object(simulator_keeper, "stop"))
            log = io.StringIO()
            with redirect_stdout(log):
                simulator_keeper.keeper(
                    "LIVE",
                    keepers,
                    lambda: now[0],
                    lambda seconds: now.__setitem__(0, now[0] + seconds),
                )
            lease.close()
        return now[0] - start, stop.call_args_list, log.getvalue()

    def test_the_keeper_leaves_a_simulator_up_while_boot_waits_for_a_calm_mac(self) -> None:
        seconds, stopped, log = self.watch(
            REPORTED_FREE_PERCENT, REPORTED_SWAP_MEGABYTES, boot_seconds=360
        )
        self.assertEqual(stopped, [mock.call("LIVE")])
        self.assertEqual(seconds, 360 + simulator_keeper.HANDOVER_SECONDS)
        self.assertIn("shut down: memory was short (57% free, 2028 MB of swap)", log)

    def test_the_keeper_still_stops_a_simulator_nothing_uses(self) -> None:
        seconds, stopped, log = self.watch(80, 0)
        self.assertEqual(stopped, [mock.call("LIVE")])
        self.assertEqual(seconds, simulator_keeper.IDLE_LIMIT_SECONDS)
        self.assertIn("shut down: nothing had used it for 10 minutes", log)
        seconds, _, log = self.watch(REPORTED_FREE_PERCENT, REPORTED_SWAP_MEGABYTES)
        self.assertEqual(seconds, simulator_keeper.HANDOVER_SECONDS)
        self.assertIn("shut down: memory was short", log)

    def test_a_simulator_counts_as_in_use_only_while_a_boot_holds_its_lease(self) -> None:
        with tempfile.TemporaryDirectory() as scratch, mock.patch.object(
            simulator_keeper, "a_command_names", return_value=False
        ):
            keepers = Path(scratch)
            self.assertFalse(simulator_keeper.is_in_use("LIVE", keepers))
            with simulator_keeper.booting("LIVE", keepers):
                self.assertTrue(simulator_keeper.is_in_use("LIVE", keepers))
                self.assertFalse(simulator_keeper.is_in_use("LIVE-IPAD", keepers))
            self.assertFalse(simulator_keeper.is_in_use("LIVE", keepers))

    def test_the_keeper_never_stops_a_simulator_in_use(self) -> None:
        self.assertIsNone(simulator_keeper.reason_to_shut_down(True, 3600, 3600, 5, 9000))

    def test_the_keeper_stops_an_idle_simulator_at_the_limit_or_when_memory_is_short(self) -> None:
        def reason(idle: float, free: int, swap: float) -> str | None:
            return simulator_keeper.reason_to_shut_down(False, idle, 3600, free, swap)

        limit = simulator_keeper.IDLE_LIMIT_SECONDS
        self.assertIsNone(reason(limit - 1, 80, 0))
        self.assertIn("10 minutes", reason(limit, 80, 0))
        idle = simulator_keeper.MEMORY_IDLE_SECONDS
        self.assertIn("memory was short", reason(idle, 39, 0))
        self.assertIn("memory was short", reason(idle, 80, 2001))
        self.assertIsNone(reason(idle, 40, 2000))
        self.assertIsNone(reason(idle - 1, 10, 9000))

    def test_the_keeper_leaves_a_simulator_up_for_a_while_after_boot_hands_it_over(self) -> None:
        def reason(idle: float, handed_over: float) -> str | None:
            return simulator_keeper.reason_to_shut_down(False, idle, handed_over, 10, 9000)

        handover = simulator_keeper.HANDOVER_SECONDS
        self.assertIsNone(reason(handover - 1, handover - 1))
        self.assertIn("memory was short", reason(simulator_keeper.MEMORY_IDLE_SECONDS, handover))

    def test_a_keeper_already_watching_is_told_the_simulator_was_used_not_started_again(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as scratch, mock.patch.object(
            simulator_keeper, "keeper_is_alive", return_value=True
        ), mock.patch.object(simulator_keeper.subprocess, "Popen") as started:
            keepers = Path(scratch)
            file = simulator_keeper.keeper_file("LIVE", keepers)
            file.write_text("123")
            os.utime(file, (1, 1))
            simulator_keeper.keep("LIVE", keepers)
            started.assert_not_called()
            self.assertGreater(file.stat().st_mtime, 1)

    def test_a_simulator_without_a_keeper_gets_one_that_outlives_the_command(self) -> None:
        with tempfile.TemporaryDirectory() as scratch, mock.patch.object(
            simulator_keeper.subprocess, "Popen"
        ) as started:
            started.return_value.pid = 4321
            keepers = Path(scratch) / "keepers"
            simulator_keeper.keep("LIVE", keepers)
            command = started.call_args.args[0]
            self.assertTrue(command[1].endswith("simulator_keeper.py"))
            self.assertEqual(command[-2:], ["--udid", "LIVE"])
            self.assertTrue(started.call_args.kwargs["start_new_session"])
            self.assertEqual(simulator_keeper.keeper_file("LIVE", keepers).read_text(), "4321")
            self.assertFalse(simulator_keeper.keeper_is_alive(keepers / "missing.pid", "LIVE"))


if __name__ == "__main__":
    unittest.main()
