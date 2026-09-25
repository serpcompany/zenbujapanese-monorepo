from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import acquire_jpdb  # noqa: E402
import import_jpdb  # noqa: E402


VOCABULARY_HTML = b"""<!doctype html><html><body>
<div class="result vocabulary">
  <div class="primary-spelling"><div class="spelling"><ruby>\xe5\x88\xa5<rt>\xe3\x81\xb9\xe3\x81\xa4</rt></ruby></div></div>
  <div class="subsection-meanings"><div class="subsection">
    <div class="part-of-speech"><div>Noun</div></div><div class="description">1. difference</div>
    <div class="part-of-speech"><div>Adjective</div></div><div class="description">2. separate</div>
  </div></div>
  <div class="alt-spelling"><a href="/vocabulary/1509430/%E3%81%B9%E3%81%A4"><ruby>\xe3\x81\xb9\xe3\x81\xa4</ruby><div>1%</div></a></div>
  <div class="subsection-pitch-accent"><div style="background-image:var(--pitch-low-s)"><div>\xe3\x81\xb9</div></div><div style="background-image:var(--pitch-high-s)"><div>\xe3\x81\xa4</div></div></div>
  <div class="tag" data-tooltip="Aozora:&nbsp;10400">Top 48600</div>
  <div class="subsection-examples"><div><a data-audio="m1/example"></a><div class="used-in"><div class="jp">\xe5\x88\xa5\xe3\x81\xae\xe4\xbb\x95\xe4\xba\x8b</div><div class="en">another job</div></div></div></div>
  <a href="/vocabulary/1509480/%E3%81%B9%E3%81%A4%E3%81%AB">related</a>
</div></body></html>"""

SECOND_HTML = b"""<!doctype html><html><body><div class="primary-spelling"><ruby>\xe3\x81\xb9\xe3\x81\xa4\xe3\x81\xab<rt></rt></ruby></div><div class="subsection-meanings"><div class="description">1. particularly</div></div></body></html>"""
DISCOVERY_FAMILIES = ("anime", "novel", "visual-novel", "web-novel", "live-action")


class FixtureHandler(BaseHTTPRequestHandler):
    counts: dict[str, int] = {}

    def do_GET(self) -> None:  # noqa: N802
        self.counts[self.path] = self.counts.get(self.path, 0) + 1
        if self.path == "/vocabulary/9/retry" and self.counts[self.path] == 1:
            self.send_response(429)
            self.send_header("Retry-After", "0")
            self.end_headers()
            return
        if self.path == "/vocabulary/10/server-error" and self.counts[self.path] == 1:
            self.send_response(503)
            self.end_headers()
            return
        if self.path == "/":
            body = (
                "<html><body>"
                + "".join(f'<a href="/{family}-difficulty-list">{family}</a>' for family in DISCOVERY_FAMILIES)
                + "</body></html>"
            ).encode()
        elif self.path.removeprefix("/") in {f"{family}-difficulty-list" for family in DISCOVERY_FAMILIES}:
            family = self.path.removeprefix("/").removesuffix("-difficulty-list")
            body = f'<html><body>Showing 1..1 from 1 entries<a href="/{family}/1/example">Example</a></body></html>'.encode()
        elif any(self.path == f"/{family}/1/example" for family in DISCOVERY_FAMILIES):
            body = f'<html><body><a href="{self.path}/vocabulary-list">Vocabulary list</a></body></html>'.encode()
        elif any(
            self.path in (
                f"/{family}/1/example/vocabulary-list",
                f"/{family}/1/example/vocabulary-list?page_size=100",
            )
            for family in DISCOVERY_FAMILIES
        ):
            body = b'<html><body>Showing 1..1 from 1 entries<div class="result vocabulary"><a href="/vocabulary/1509430/%E5%88%A5">word</a></div></body></html>'
        elif self.path == "/kanji/%E5%88%A5":
            body = b'<html><head><link rel="canonical" href="/kanji/%E5%88%A5"></head><body><div class="description">distinction</div></body></html>'
        elif self.path in (
            "/vocabulary/1509430/%E5%88%A5",
            "/vocabulary/1509430/%E3%81%B9%E3%81%A4",
        ):
            body = VOCABULARY_HTML
        elif self.path == "/vocabulary/1509480/%E3%81%B9%E3%81%A4%E3%81%AB":
            body = SECOND_HTML
        elif self.path == "/vocabulary/9/retry":
            body = SECOND_HTML
        elif self.path == "/vocabulary/10/server-error":
            body = SECOND_HTML
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("ETag", hashlib.sha256(body).hexdigest())
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


class JPDBPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        FixtureHandler.counts = {}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.origin = f"http://127.0.0.1:{self.server.server_port}/"
        self.authorization = self.root / "authorization.json"
        self.authorization.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-authorization.v1",
                    "authorizedBy": "JPDB owner",
                    "authorizedAt": "2026-09-25T00:00:00Z",
                    "scope": "Public vocabulary pages for pipeline testing",
                    "allowedOrigins": [self.origin],
                    "redistributionAllowed": False,
                }
            ),
            encoding="utf-8",
        )
        self.seeds = self.root / "seeds.json"
        self.seeds.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-seeds.v1",
                    "urls": [self.origin + "vocabulary/1509430/%E5%88%A5"],
                    "expected": {"responses": 3, "vocabulary": 2, "kanji": 0, "media": 0},
                }
            ),
            encoding="utf-8",
        )
        self.snapshot = self.root / "snapshot"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temporary.cleanup()

    def acquisition_arguments(self, max_requests: int = 0) -> argparse.Namespace:
        return argparse.Namespace(
            authorization=self.authorization,
            seeds=self.seeds,
            snapshot=self.snapshot,
            origin=self.origin,
            requests_per_second=1000.0,
            adaptive_throttle=False,
            max_attempts=2,
            timeout=2.0,
            max_response_bytes=1024 * 1024,
            max_requests=max_requests,
            respect_robots=False,
        )

    def test_route_aware_url_canonicalization_drops_presentation_variants(self) -> None:
        origin = self.origin
        self.assertEqual(
            origin + "anime-difficulty-list?offset=50",
            acquire_jpdb.canonical_url(
                origin + "anime-difficulty-list?sort_by=name&offset=050&order=reverse#a", origin
            ),
        )
        self.assertEqual(
            origin + "anime/1/example/vocabulary-list?offset=100&page_size=100",
            acquire_jpdb.canonical_url(
                origin + "anime/1/example/vocabulary-list?sort_by=by-frequency-global&offset=100",
                origin,
            ),
        )
        self.assertEqual(
            origin + "vocabulary/1509430/%E5%88%A5",
            acquire_jpdb.canonical_url(
                origin + "vocabulary/1509430/\u5225?lang=english&utm_source=test#a", origin
            ),
        )
        self.assertEqual(
            origin + "kanji/%E5%88%A5?expand=k&expand=v",
            acquire_jpdb.canonical_url(
                origin + "kanji/\u5225?expand=v&lang=english&expand=k", origin
            ),
        )
        self.assertIsNone(
            acquire_jpdb.canonical_url(origin + "anime-difficulty-list?offset=-1", origin)
        )
        self.assertIsNone(acquire_jpdb.canonical_url("https://example.com/vocabulary/1/x", origin))

    def test_public_route_allowlist_excludes_account_surfaces(self) -> None:
        origin = self.origin
        for path in ("deck", "review", "settings", "user/example", "login"):
            self.assertFalse(
                acquire_jpdb.allowed_url(origin + path, origin),
                msg=f"account/private route unexpectedly allowed: /{path}",
            )
        self.assertFalse(acquire_jpdb.allowed_url("https://example.com/vocabulary/1/x", origin))
        self.assertTrue(acquire_jpdb.allowed_url(origin + "vocabulary/1/example", origin))
        self.assertTrue(acquire_jpdb.allowed_url(origin + "anime/1/example/vocabulary-list", origin))

    def test_acquisition_resumes_without_duplicate_requests(self) -> None:
        partial = acquire_jpdb.acquire(self.acquisition_arguments(max_requests=1))
        self.assertFalse(partial["complete"])
        report_arguments = self.acquisition_arguments()
        report_arguments.report_only = True
        report = acquire_jpdb.acquire(report_arguments)
        self.assertFalse(report["complete"])
        self.assertEqual(1, len(report["responses"]))
        self.assertEqual(1, FixtureHandler.counts["/vocabulary/1509430/%E5%88%A5"])
        complete = acquire_jpdb.acquire(self.acquisition_arguments())
        self.assertTrue(complete["complete"])
        self.assertEqual(3, len(complete["responses"]))
        self.assertEqual(1, FixtureHandler.counts["/vocabulary/1509430/%E5%88%A5"])
        self.assertEqual(1, FixtureHandler.counts["/vocabulary/1509430/%E3%81%B9%E3%81%A4"])
        self.assertEqual(1, FixtureHandler.counts["/vocabulary/1509480/%E3%81%B9%E3%81%A4%E3%81%AB"])
        for response in complete["responses"]:
            self.assertTrue(
                (
                    self.snapshot
                    / "structured"
                    / "sha256"
                    / response["extractedSHA256"][:2]
                    / response["extractedSHA256"][2:]
                ).is_file()
            )

    def test_acquisition_supports_bounded_concurrency(self) -> None:
        arguments = self.acquisition_arguments()
        arguments.snapshot = self.root / "concurrent-snapshot"
        arguments.concurrency = 3
        result = acquire_jpdb.acquire(arguments, sleeper=lambda _: None)
        self.assertTrue(result["complete"])
        self.assertEqual(3, len(result["responses"]))
        self.assertEqual(1, FixtureHandler.counts["/vocabulary/1509430/%E5%88%A5"])
        self.assertEqual(1, FixtureHandler.counts["/vocabulary/1509430/%E3%81%B9%E3%81%A4"])
        self.assertEqual(1, FixtureHandler.counts["/vocabulary/1509480/%E3%81%B9%E3%81%A4%E3%81%AB"])

    def test_adaptive_throttle_starts_safe_backs_off_and_recovers_slowly(self) -> None:
        throttle = acquire_jpdb.AdaptiveThrottle(
            rate_ceiling=12,
            concurrency_ceiling=8,
            enabled=True,
            start_rate=6,
            start_concurrency=3,
            minimum_rate=1,
            backoff_factor=0.5,
            recovery_successes=2,
            rate_step=0.5,
        )
        self.assertEqual((6, 3), (throttle.rate, throttle.concurrency))
        throttle.record_transient_failure()
        self.assertEqual((3, 2), (throttle.rate, throttle.concurrency))
        throttle.record_success()
        self.assertEqual((3, 2), (throttle.rate, throttle.concurrency))
        throttle.record_success()
        self.assertEqual((3.5, 2), (throttle.rate, throttle.concurrency))
        self.assertEqual({"reductions": 1, "recoveries": 1}, {
            "reductions": throttle.report()["reductions"],
            "recoveries": throttle.report()["recoveries"],
        })
        minimum = acquire_jpdb.AdaptiveThrottle(0.2, 1, True)
        self.assertFalse(minimum.record_transient_failure())
        self.assertEqual(0, minimum.report()["reductions"])
        self.assertEqual(1, minimum.report()["transientSignals"])

    def test_existing_checkpoint_adds_circuit_breaker_schema_safely(self) -> None:
        snapshot = self.root / "checkpoint-migration"
        store = acquire_jpdb.SnapshotStore(snapshot)
        store.database.execute("DROP TABLE circuit_breaker_events")
        store.database.execute("DROP TABLE circuit_breaker_state")
        store.database.commit()
        store.close()

        migrated = acquire_jpdb.SnapshotStore(snapshot)
        try:
            self.assertEqual(
                (0.0, "", 0, 0),
                migrated.database.execute(
                    "SELECT cooldown_until,reason,consecutive_minimum_signals,trips "
                    "FROM circuit_breaker_state WHERE singleton=1"
                ).fetchone(),
            )
            self.assertEqual([], migrated.circuit_breaker_events())
        finally:
            migrated.close()

    def test_malformed_retry_after_falls_back_to_exponential_delay(self) -> None:
        error = urllib.error.HTTPError(
            self.origin, 429, "rate limited", {"Retry-After": "not-a-date"}, None
        )
        self.assertEqual(4.0, acquire_jpdb.retry_delay(error, attempt=2))

    def test_pressure_reschedules_next_request_at_reduced_rate(self) -> None:
        throttle = acquire_jpdb.AdaptiveThrottle(10, 4, True, 10, 4)
        throttle.record_transient_failure()
        self.assertEqual(
            0.4,
            acquire_jpdb.next_request_after_pressure(
                next_request_at=0.3, now=0.2, throttle=throttle
            ),
        )

    def test_acquisition_supports_pooled_http_client(self) -> None:
        arguments = self.acquisition_arguments()
        arguments.snapshot = self.root / "pooled-snapshot"
        arguments.http_client = "httpx"
        result = acquire_jpdb.acquire(arguments, sleeper=lambda _: None)
        self.assertTrue(result["complete"])
        self.assertEqual(3, len(result["responses"]))

    def test_incomplete_read_is_checkpointed_retried_and_throttled(self) -> None:
        seed_only = self.root / "reset-seed.json"
        seed_only.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-seeds.v1",
                    "urls": [self.origin + "vocabulary/1509480/%E3%81%B9%E3%81%A4%E3%81%AB"],
                    "expected": {"responses": 1, "vocabulary": 1, "kanji": 0, "media": 0},
                }
            ),
            encoding="utf-8",
        )
        calls = 0

        def incomplete_once(request: urllib.request.Request, timeout: float) -> object:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise http.client.IncompleteRead(b"", 1)
            return urllib.request.urlopen(request, timeout=timeout)

        arguments = self.acquisition_arguments()
        arguments.seeds = seed_only
        arguments.snapshot = self.root / "reset-snapshot"
        arguments.discover_links = False
        arguments.adaptive_throttle = True
        result = acquire_jpdb.acquire(
            arguments, opener=incomplete_once, sleeper=lambda _: None
        )
        self.assertTrue(result["complete"])
        self.assertEqual(2, calls)
        self.assertEqual(1, result["throttle"]["reductions"])
        self.assertEqual("backoff", result["throttleEvents"][0]["event"])
        self.assertIn("IncompleteRead", result["throttleEvents"][0]["reason"])

    def test_connection_pressure_opens_persistent_circuit_and_restart_honors_it(self) -> None:
        seed_only = self.root / "breaker-seed.json"
        seed_only.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-seeds.v1",
                    "urls": [self.origin + "vocabulary/1509480/%E3%81%B9%E3%81%A4%E3%81%AB"],
                    "expected": {"responses": 1, "vocabulary": 1, "kanji": 0, "media": 0},
                }
            ),
            encoding="utf-8",
        )
        calls = 0
        fake_now = [1_000.0]

        def reset_twice(request: urllib.request.Request, timeout: float) -> object:
            nonlocal calls
            calls += 1
            if calls <= 2:
                raise urllib.error.URLError("connection reset by peer")
            return urllib.request.urlopen(request, timeout=timeout)

        class CooldownInterrupt(RuntimeError):
            pass

        first_sleeps: list[float] = []

        def interrupt_on_breaker(seconds: float) -> None:
            first_sleeps.append(seconds)
            if seconds >= 1_799:
                raise CooldownInterrupt("simulated process stop during persisted cooldown")
            fake_now[0] += seconds

        arguments = self.acquisition_arguments()
        arguments.seeds = seed_only
        arguments.snapshot = self.root / "breaker-snapshot"
        arguments.discover_links = False
        arguments.adaptive_throttle = True
        arguments.requests_per_second = 1.0
        arguments.concurrency = 1
        arguments.adaptive_start_rps = 1.0
        arguments.adaptive_start_concurrency = 1
        arguments.adaptive_minimum_rps = 1.0
        arguments.circuit_breaker = True
        arguments.circuit_breaker_cooldown_seconds = 1800.0
        arguments.circuit_breaker_signal_threshold = 2
        arguments.max_attempts = 4
        with self.assertRaises(CooldownInterrupt):
            acquire_jpdb.acquire(
                arguments,
                opener=reset_twice,
                sleeper=interrupt_on_breaker,
                wall_clock=lambda: fake_now[0],
            )

        checkpoint = sqlite3.connect(arguments.snapshot / "checkpoint.sqlite")
        try:
            deadline, signals, trips = checkpoint.execute(
                "SELECT cooldown_until,consecutive_minimum_signals,trips "
                "FROM circuit_breaker_state WHERE singleton=1"
            ).fetchone()
            self.assertGreater(deadline, fake_now[0])
            self.assertEqual((0, 1), (signals, trips))
            self.assertEqual((2, "pending"), checkpoint.execute(
                "SELECT attempts,state FROM queue"
            ).fetchone())
        finally:
            checkpoint.close()

        restart_sleeps: list[float] = []

        def advance_time(seconds: float) -> None:
            restart_sleeps.append(seconds)
            fake_now[0] += seconds

        result = acquire_jpdb.acquire(
            arguments,
            opener=reset_twice,
            sleeper=advance_time,
            wall_clock=lambda: fake_now[0],
        )
        self.assertTrue(result["complete"])
        self.assertEqual(3, calls)
        self.assertEqual([], result["failures"])
        self.assertGreaterEqual(max(restart_sleeps), 1_799)
        self.assertFalse(result["circuitBreaker"]["active"])
        self.assertEqual(1, result["circuitBreaker"]["trips"])
        self.assertEqual(
            ["opened", "closed"],
            [event["event"] for event in result["circuitBreaker"]["events"]],
        )

    def test_http_5xx_does_not_open_connection_circuit(self) -> None:
        seed_only = self.root / "server-error-seed.json"
        seed_only.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-seeds.v1",
                    "urls": [self.origin + "vocabulary/10/server-error"],
                    "expected": {"responses": 1, "vocabulary": 1, "kanji": 0, "media": 0},
                }
            ),
            encoding="utf-8",
        )
        arguments = self.acquisition_arguments()
        arguments.seeds = seed_only
        arguments.snapshot = self.root / "server-error-snapshot"
        arguments.discover_links = False
        arguments.adaptive_throttle = True
        arguments.requests_per_second = 1.0
        arguments.concurrency = 1
        arguments.adaptive_start_rps = 1.0
        arguments.adaptive_start_concurrency = 1
        arguments.adaptive_minimum_rps = 1.0
        arguments.circuit_breaker = True
        arguments.circuit_breaker_cooldown_seconds = 1800.0
        arguments.circuit_breaker_signal_threshold = 1
        sleeps: list[float] = []
        result = acquire_jpdb.acquire(arguments, sleeper=sleeps.append)
        self.assertTrue(result["complete"])
        self.assertEqual(0, result["circuitBreaker"]["trips"])
        self.assertEqual([], result["circuitBreaker"]["events"])
        self.assertTrue(all(delay < 1800 for delay in sleeps))

    def test_seed_only_acquisition_does_not_expand_links(self) -> None:
        seed_only = self.root / "seed-only.json"
        seed_only.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-seeds.v1",
                    "urls": [self.origin + "vocabulary/1509430/%E5%88%A5"],
                    "expected": {"responses": 1, "vocabulary": 1, "kanji": 0, "media": 0},
                }
            ),
            encoding="utf-8",
        )
        arguments = self.acquisition_arguments()
        arguments.seeds = seed_only
        arguments.snapshot = self.root / "seed-only-snapshot"
        arguments.discover_links = False
        result = acquire_jpdb.acquire(arguments, sleeper=lambda _: None)
        self.assertTrue(result["complete"])
        self.assertEqual(1, len(result["responses"]))
        self.assertEqual({"/vocabulary/1509430/%E5%88%A5": 1}, FixtureHandler.counts)

    def test_import_is_normalized_valid_and_deterministic(self) -> None:
        acquire_jpdb.acquire(self.acquisition_arguments())
        outputs = []
        for suffix in ("a", "b"):
            output = self.root / f"jpdb-{suffix}.sqlite"
            manifest = self.root / f"jpdb-{suffix}.import.json"
            import_jpdb.import_snapshot(
                argparse.Namespace(
                    snapshot=self.snapshot,
                    authorization=self.authorization,
                    output=output,
                    output_manifest=manifest,
                    zenbu_language_data=None,
                    allow_incomplete=False,
                    allow_redistribution=False,
                )
            )
            outputs.append(output)
            report = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual("ok", report["integrityCheck"])
            self.assertEqual([], report["foreignKeyViolations"])
            self.assertFalse(report["distributionEnabled"])
            self.assertEqual(
                report["tableCounts"]["source_resources"],
                report["provenance"]["documentLocatorRows"],
            )
            self.assertLess(report["provenance"]["rowsPerStoredRow"], 1)
            self.assertGreaterEqual(report["validationCounts"]["duplicateObservations"], 1)
            self.assertTrue(all(check["passed"] for check in report["representativeChecks"]))
            self.assertGreater(report["storage"]["sourceHTTPBytes"], 0)
            self.assertGreater(report["storage"]["structuredStoredBytes"], 0)
            self.assertGreater(report["performance"]["normalizedRowsPerSecond"], 0)
            self.assertEqual({"mapped", "ambiguous", "unmapped"}, set(report["mappingReports"]))
            for mapping_report in report["mappingReports"].values():
                mapping_path = Path(mapping_report["path"])
                self.assertTrue(mapping_path.is_file())
                self.assertEqual(mapping_report["sha256"], import_jpdb.file_sha256(mapping_path))
        self.assertEqual(import_jpdb.file_sha256(outputs[0]), import_jpdb.file_sha256(outputs[1]))

        database = sqlite3.connect(outputs[0])
        try:
            self.assertEqual((2,), database.execute("SELECT count(*) FROM vocabulary").fetchone())
            self.assertEqual(("別", "べつ"), database.execute(
                "SELECT headword,primary_reading FROM vocabulary WHERE upstream_vid=1509430"
            ).fetchone())
            self.assertEqual((48600,), database.execute(
                "SELECT rank FROM frequencies JOIN vocabulary ON vocabulary.id=frequencies.vocabulary_id "
                "WHERE upstream_vid=1509430 AND corpus='global'"
            ).fetchone())
            self.assertEqual((2,), database.execute(
                "SELECT count(*) FROM meanings JOIN vocabulary ON vocabulary.id=meanings.vocabulary_id "
                "WHERE upstream_vid=1509430"
            ).fetchone())
            self.assertGreater(database.execute("SELECT count(*) FROM field_provenance").fetchone()[0], 0)
            self.assertGreater(database.execute(
                "SELECT count(*) FROM field_provenance "
                "WHERE entity_type='extracted_document' AND field_name='canonical-document' "
                "AND source_locator='$'"
            ).fetchone()[0], 0)
            self.assertGreater(database.execute(
                "SELECT count(*) FROM field_provenance "
                "WHERE entity_type='vocabulary' AND field_name='forms' "
                "AND source_locator='$.vocabulary.forms'"
            ).fetchone()[0], 0)
            self.assertEqual([], list(database.execute("PRAGMA foreign_key_check")))
        finally:
            database.close()

    def test_import_rejects_tampered_raw_blob(self) -> None:
        result = acquire_jpdb.acquire(self.acquisition_arguments())
        response = result["responses"][0]
        blob = (
            self.snapshot
            / "structured"
            / "sha256"
            / response["extractedSHA256"][:2]
            / response["extractedSHA256"][2:]
        )
        blob.write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            import_jpdb.import_snapshot(
                argparse.Namespace(
                    snapshot=self.snapshot,
                    authorization=self.authorization,
                    output=self.root / "bad.sqlite",
                    output_manifest=self.root / "bad.json",
                    zenbu_language_data=None,
                    allow_incomplete=False,
                    allow_redistribution=False,
                )
            )

    def test_acquisition_retries_rate_limit_with_checkpointed_attempts(self) -> None:
        retry_seeds = self.root / "retry-seeds.json"
        retry_seeds.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-seeds.v1",
                    "urls": [self.origin + "vocabulary/9/retry"],
                    "expected": {"responses": 1, "vocabulary": 1, "kanji": 0, "media": 0},
                }
            ),
            encoding="utf-8",
        )
        arguments = self.acquisition_arguments()
        arguments.seeds = retry_seeds
        arguments.snapshot = self.root / "retry-snapshot"
        arguments.adaptive_throttle = True
        result = acquire_jpdb.acquire(arguments, sleeper=lambda _: None)
        self.assertTrue(result["complete"])
        self.assertEqual(2, FixtureHandler.counts["/vocabulary/9/retry"])
        self.assertEqual(1, result["throttle"]["reductions"])
        self.assertLess(result["throttle"]["finalRate"], result["throttle"]["rateCeiling"])
        checkpoint = sqlite3.connect(arguments.snapshot / "checkpoint.sqlite")
        try:
            self.assertEqual((2, "done"), checkpoint.execute(
                "SELECT attempts,state FROM queue WHERE url=?",
                (self.origin + "vocabulary/9/retry",),
            ).fetchone())
        finally:
            checkpoint.close()

    def test_redistribution_requires_authorization_record(self) -> None:
        acquire_jpdb.acquire(self.acquisition_arguments())
        with self.assertRaisesRegex(ValueError, "does not permit redistribution"):
            import_jpdb.import_snapshot(
                argparse.Namespace(
                    snapshot=self.snapshot,
                    authorization=self.authorization,
                    output=self.root / "forbidden.sqlite",
                    output_manifest=self.root / "forbidden.json",
                    zenbu_language_data=None,
                    allow_incomplete=False,
                    allow_redistribution=True,
                )
            )

    def test_import_reports_mapped_and_unmapped_zenbu_entries(self) -> None:
        acquire_jpdb.acquire(self.acquisition_arguments())
        language_data = self.root / "LanguageReference.sqlite"
        database = sqlite3.connect(language_data)
        try:
            database.execute("CREATE TABLE entries(id BLOB PRIMARY KEY, source_record_id INTEGER NOT NULL)")
            database.execute("INSERT INTO entries VALUES (?,?)", (b"zenbu-id", 1509430))
            database.commit()
        finally:
            database.close()
        report = import_jpdb.import_snapshot(
            argparse.Namespace(
                snapshot=self.snapshot,
                authorization=self.authorization,
                output=self.root / "mapped.sqlite",
                output_manifest=self.root / "mapped.json",
                zenbu_language_data=language_data,
                allow_incomplete=False,
                allow_redistribution=False,
            )
        )
        self.assertEqual({"mapped": 1, "unmapped": 1}, report["mappingCounts"])

    def test_document_provenance_is_constant_for_large_listing(self) -> None:
        database = sqlite3.connect(":memory:")
        try:
            import_jpdb.create_schema(database)
            database.execute(
                "INSERT INTO source_resources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    1, "https://jpdb.io/deck", "https://jpdb.io/deck", "2026-09-25T00:00:00Z",
                    200, "text/html", 1, "00" * 32, 1, "11" * 32, "zlib",
                    "zenbu.jpdb-frontend-extract.v1",
                ),
            )
            document = {
                "contentSHA256": "22" * 32,
                "routeType": "vocabulary-list",
                "vocabulary": [
                    {"vid": index, "meanings": [f"meaning-{index}-{part}" for part in range(20)]}
                    for index in range(500)
                ],
            }
            import_jpdb.preserve_field_provenance(database, 1, document)
            self.assertEqual((1,), database.execute(
                "SELECT count(*) FROM field_provenance"
            ).fetchone())
        finally:
            database.close()

    def test_structured_identity_and_frequency_conflicts_are_recorded(self) -> None:
        database = sqlite3.connect(":memory:")
        try:
            import_jpdb.create_schema(database)
            for resource_id in (1, 2):
                database.execute(
                    "INSERT INTO source_resources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        resource_id,
                        f"https://jpdb.io/vocabulary/1/form-{resource_id}",
                        f"https://jpdb.io/vocabulary/1/form-{resource_id}",
                        "2026-09-25T00:00:00Z",
                        200,
                        "text/html",
                        1,
                        "00" * 32,
                        1,
                        "11" * 32,
                        "zlib",
                        "zenbu.jpdb-frontend-extract.v1",
                    ),
                )
            first = {
                "vocabulary": {
                    "vid": 1,
                    "forms": [{"spelling": "一", "reading": "いち", "primary": True}],
                    "meanings": [],
                    "frequencies": [{"corpus": "global", "rank": 100}],
                }
            }
            second = {
                "vocabulary": {
                    "vid": 1,
                    "forms": [{"spelling": "壱", "reading": "いち", "primary": True}],
                    "meanings": [],
                    "frequencies": [{"corpus": "global", "rank": 200}],
                }
            }
            import_jpdb.insert_structured_vocabulary(database, 1, first)
            import_jpdb.insert_structured_vocabulary(database, 2, second)
            conflicts = set(database.execute("SELECT entity_type,field_name FROM conflicts"))
            self.assertEqual({("vocabulary", "identity"), ("frequency", "rank")}, conflicts)
        finally:
            database.close()

    def test_public_frontend_discovery_proves_representative_route_closure(self) -> None:
        frontend_seeds = self.root / "frontend-seeds.json"
        frontend_seeds.write_text(
            json.dumps(
                {
                    "schema": "zenbu.jpdb-seeds.v1",
                    "discoveryMode": "public-frontend-closure-v1",
                    "urls": [self.origin],
                }
            ),
            encoding="utf-8",
        )
        arguments = self.acquisition_arguments()
        arguments.seeds = frontend_seeds
        arguments.snapshot = self.root / "frontend-snapshot"
        result = acquire_jpdb.acquire(arguments, sleeper=lambda _: None)
        self.assertTrue(result["complete"])
        closure = result["frontendClosure"]
        self.assertTrue(closure["closed"])
        self.assertEqual([], closure["missingDifficultyFamilies"])
        self.assertEqual(5, closure["mediaPages"])
        self.assertEqual([], closure["missingMediaPages"])
        self.assertEqual([], closure["mediaWithoutVocabularyLists"])
        self.assertEqual(10, len(closure["listings"]))
        self.assertEqual(1, result["observed"]["kanji"])


if __name__ == "__main__":
    unittest.main()
