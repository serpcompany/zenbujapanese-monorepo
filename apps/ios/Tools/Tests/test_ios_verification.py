import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout


MODULE_PATH = Path(__file__).parents[1] / "ios_verification.py"
SPEC = importlib.util.spec_from_file_location("ios_verification", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
ios_verification = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ios_verification)


class IOSVerificationPolicyTests(unittest.TestCase):
    def test_network_selector_in_ordinary_unit_tier_is_rejected(self):
        manifest = {
            "version": 1,
            "selectors": {
                "network.sudachi": {
                    "plan": "ZenbuSudachiIntegration",
                    "test": "ZenbuJapaneseTests/JapaneseTextAnalysisTests/testNetwork",
                    "traits": ["network", "large-resource"],
                    "journeys": ["japanese-text-analysis-provider"],
                }
            },
            "tiers": {"unit": ["network.sudachi"], "integration": []},
            "capabilities": {},
            "stages": {"issue-final": ["unit"]},
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "network.sudachi.*network.*unit",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_duplicate_maximum_size_journey_is_rejected_but_one_smoke_passes(self):
        selector = {
            "plan": "ZenbuAccessibility",
            "traits": ["accessibility-maximum"],
            "journeys": ["search-adaptive-layout"],
        }
        manifest = {
            "version": 1,
            "selectors": {
                "accessibility.search.dark": {**selector, "test": "dark"},
                "accessibility.search.light": {**selector, "test": "light"},
            },
            "tiers": {
                "accessibility": [
                    "accessibility.search.dark",
                    "accessibility.search.light",
                ]
            },
            "capabilities": {},
            "stages": {"issue-final": ["accessibility"]},
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "search-adaptive-layout.*maximum-size.*duplicate",
            ):
                ios_verification.load_and_validate_manifest(path)
            manifest["tiers"]["accessibility"].pop()
            path.write_text(json.dumps(manifest), encoding="utf-8")
            ios_verification.load_and_validate_manifest(path)

    def test_non_layout_capability_cannot_select_maximum_size_coverage(self):
        manifest = {
            "version": 1,
            "selectors": {
                "accessibility.search": {
                    "plan": "ZenbuAccessibility",
                    "test": "search",
                    "traits": ["accessibility-maximum"],
                    "journeys": ["search-layout"],
                }
            },
            "tiers": {"accessibility": ["accessibility.search"]},
            "capabilities": {
                "lookup-runtime": {
                    "paths": ["Lookup.swift"],
                    "issue-final": ["accessibility.search"],
                }
            },
            "stages": {"issue-final": ["accessibility"]},
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "lookup-runtime.*maximum-size.*adaptive layout",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_equivalent_normal_selectors_require_documented_independent_evidence(self):
        manifest = {
            "version": 1,
            "selectors": {
                "ui.one": {
                    "plan": "ZenbuPR",
                    "test": "UITests/testOne",
                    "traits": ["ui"],
                    "journeys": ["search"],
                },
                "ui.two": {
                    "plan": "ZenbuPR",
                    "test": "UITests/testTwo",
                    "traits": ["ui"],
                    "journeys": ["search"],
                },
            },
            "tiers": {"ui": ["ui.one", "ui.two"]},
            "capabilities": {
                "search": {
                    "paths": ["Search.swift"],
                    "issue-final": ["ui.one", "ui.two"],
                }
            },
            "stages": {"issue-final": ["ui"]},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "ui.one.*ui.two.*duplicate journey search",
            ):
                ios_verification.load_and_validate_manifest(path)

            manifest["intentional_same_stage_evidence"] = {
                "ui.one|ui.two": "Independent light and dark appearance evidence."
            }
            path.write_text(json.dumps(manifest), encoding="utf-8")
            ios_verification.load_and_validate_manifest(path)

    def test_resolved_cross_capability_duplicates_require_nonempty_evidence(self):
        manifest = {
            "version": 1,
            "selectors": {
                "ui.one": {
                    "plan": "ZenbuPR",
                    "test": "UITests/testOne",
                    "traits": ["ui"],
                    "journeys": ["search"],
                },
                "ui.two": {
                    "plan": "ZenbuPR",
                    "test": "UITests/testTwo",
                    "traits": ["ui"],
                    "journeys": ["search"],
                },
            },
            "tiers": {"ui": ["ui.one", "ui.two"]},
            "capabilities": {
                "one": {"paths": ["One.swift"], "issue-final": ["ui.one"]},
                "two": {"paths": ["Two.swift"], "issue-final": ["ui.two"]},
            },
            "stages": {"issue-final": ["ui"]},
        }
        arguments = {
            "changed_paths": ["One.swift", "Two.swift"],
            "stage": "issue-final",
            "event": "local",
            "draft": True,
            "source_sha": "candidate",
        }
        with self.assertRaisesRegex(
            ios_verification.PolicyError,
            "ui.one.*ui.two.*duplicate journey search.*resolved-candidate",
        ):
            ios_verification.resolve_plan(manifest, **arguments)

        manifest["intentional_same_stage_evidence"] = {"ui.one|ui.two": ""}
        with self.assertRaises(ios_verification.PolicyError):
            ios_verification.resolve_plan(manifest, **arguments)

        manifest["intentional_same_stage_evidence"][
            "ui.one|ui.two"
        ] = "Independent visual and semantic evidence."
        plan = ios_verification.resolve_plan(manifest, **arguments)
        self.assertEqual(plan["selectors"], ["ui.one", "ui.two"])

    def test_complete_suite_outside_merge_manual_or_release_is_rejected(self):
        manifest = {
            "version": 1,
            "selectors": {
                "complete": {
                    "plan": "ZenbuPR",
                    "test": None,
                    "traits": ["complete-suite"],
                    "journeys": ["all-public-journeys"],
                }
            },
            "tiers": {"complete": ["complete"]},
            "capabilities": {},
            "stages": {"issue-final": ["complete"]},
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "complete-suite.*issue-final",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_unknown_stage_tier_is_rejected_instead_of_dropping_a_partition(self):
        manifest = {
            "version": 1,
            "selectors": {},
            "tiers": {"unit": []},
            "capabilities": {},
            "stages": {"hosted-fast": ["unit", "uis"]},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "hosted-fast.*unknown tier uis",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_pull_request_lifecycle_defers_draft_and_runs_ready_exact_head(self):
        manifest = {
            "version": 1,
            "selectors": {
                "unit.all": {
                    "plan": "ZenbuPR",
                    "test": "ZenbuJapaneseTests",
                    "traits": [],
                    "journeys": ["unit-contracts"],
                }
            },
            "tiers": {"unit": ["unit.all"]},
            "capabilities": {
                "ios": {
                    "paths": ["apps/ios/**"],
                    "hosted-fast": ["unit.all"],
                }
            },
            "stages": {"hosted-fast": ["unit"]},
        }

        draft = ios_verification.resolve_plan(
            manifest,
            changed_paths=["apps/ios/App/App.swift"],
            stage="hosted-fast",
            event="synchronize",
            draft=True,
            source_sha="abc123",
        )
        ready = ios_verification.resolve_plan(
            manifest,
            changed_paths=["apps/ios/App/App.swift"],
            stage="hosted-fast",
            event="ready_for_review",
            draft=False,
            source_sha="abc123",
        )
        merge_group = ios_verification.resolve_plan(
            manifest,
            changed_paths=["apps/ios/App/App.swift"],
            stage="hosted-fast",
            event="merge_group",
            draft=False,
            source_sha="merge123",
        )

        self.assertEqual(draft["cadence"], "deferred-draft")
        self.assertEqual(draft["selectors"], [])
        self.assertEqual(draft["source_sha"], "abc123")
        self.assertEqual(ready["cadence"], "verify-current-head")
        self.assertEqual(ready["selectors"], ["unit.all"])
        self.assertEqual(ready["source_sha"], "abc123")
        self.assertEqual(merge_group["cadence"], "deferred-merge-group")
        self.assertEqual(merge_group["selectors"], [])
        self.assertEqual(merge_group["source_sha"], "merge123")

    def test_every_pr_and_merge_queue_transition_has_one_deterministic_cadence(self):
        cases = [
            ("hosted-fast", "opened", True, "deferred-draft"),
            ("hosted-fast", "synchronize", True, "deferred-draft"),
            ("hosted-fast", "ready_for_review", False, "verify-current-head"),
            ("hosted-fast", "synchronize", False, "verify-current-head"),
            ("hosted-fast", "converted_to_draft", True, "deferred-draft"),
            ("hosted-fast", "merge_group", False, "deferred-merge-group"),
            ("merge-candidate", "pull_request", False, "deferred-until-merge"),
            ("merge-candidate", "merge_group", False, "verify-merge-candidate"),
            ("performance", "schedule", False, "run-performance"),
        ]
        for stage, event, draft, expected in cases:
            with self.subTest(stage=stage, event=event, draft=draft):
                self.assertEqual(
                    ios_verification.lifecycle_cadence(
                        stage=stage, event=event, draft=draft
                    ),
                    expected,
                )

    def test_test_only_repair_stays_focused_while_shared_runtime_expands(self):
        manifest = {
            "version": 1,
            "selectors": {
                selector: {
                    "plan": "ZenbuPR",
                    "test": selector,
                    "traits": [],
                    "journeys": [selector],
                }
                for selector in ("ui.search", "unit.all", "ui.examples")
            },
            "tiers": {
                "unit": ["unit.all"],
                "ui": ["ui.search", "ui.examples"],
            },
            "capabilities": {
                "search-test-repair": {
                    "paths": ["apps/ios/AppUITests/SearchReadiness.swift"],
                    "issue-final": ["ui.search"],
                },
                "shared-example-runtime": {
                    "paths": ["apps/ios/Modules/Sources/SharedExamples/**"],
                    "issue-final": ["unit.all", "ui.search", "ui.examples"],
                },
            },
            "stages": {"issue-final": ["unit", "ui"]},
        }

        test_only = ios_verification.resolve_plan(
            manifest,
            changed_paths=["apps/ios/AppUITests/SearchReadiness.swift"],
            stage="issue-final",
            event="local",
            draft=True,
            source_sha="test-sha",
        )
        runtime = ios_verification.resolve_plan(
            manifest,
            changed_paths=["apps/ios/Modules/Sources/SharedExamples/Layout.swift"],
            stage="issue-final",
            event="local",
            draft=True,
            source_sha="runtime-sha",
        )

        self.assertEqual(test_only["selectors"], ["ui.search"])
        self.assertEqual(runtime["selectors"], ["unit.all", "ui.search", "ui.examples"])

    def test_requested_tdd_capability_owns_the_inner_loop_while_issue_final_expands(
        self,
    ):
        manifest = {
            "version": 1,
            "selectors": {
                selector: {
                    "plan": "ZenbuPR",
                    "test": selector,
                    "traits": [],
                    "journeys": [selector],
                }
                for selector in ("ui.reading-aid", "ui.word", "ui.examples")
            },
            "tiers": {"ui": ["ui.reading-aid", "ui.word", "ui.examples"]},
            "capabilities": {
                "reading-aids": {
                    "paths": ["apps/ios/ReadingAid*.swift"],
                    "reviewed_override_paths": [
                        "apps/ios/WordDetail.swift",
                        "apps/ios/Examples.swift",
                    ],
                    "tdd": ["ui.reading-aid"],
                    "issue-final": ["ui.reading-aid"],
                },
                "word": {
                    "paths": ["apps/ios/WordDetail.swift"],
                    "tdd": ["ui.word"],
                    "issue-final": ["ui.word"],
                },
                "examples": {
                    "paths": ["apps/ios/Examples.swift"],
                    "tdd": ["ui.examples"],
                    "issue-final": ["ui.examples"],
                },
            },
            "stages": {"tdd": ["ui"], "issue-final": ["ui"]},
        }
        changed = ["apps/ios/WordDetail.swift", "apps/ios/Examples.swift"]

        tdd = ios_verification.resolve_plan(
            manifest,
            changed_paths=changed,
            stage="tdd",
            event="local",
            draft=True,
            source_sha="candidate",
            requested_capabilities=["reading-aids"],
        )
        issue_final = ios_verification.resolve_plan(
            manifest,
            changed_paths=changed,
            stage="issue-final",
            event="local",
            draft=True,
            source_sha="candidate",
            requested_capabilities=["reading-aids"],
        )

        self.assertEqual(tdd["selectors"], ["ui.reading-aid"])
        self.assertEqual(
            issue_final["selectors"],
            ["ui.reading-aid", "ui.word", "ui.examples"],
        )

    def test_reused_products_with_wrong_source_fingerprint_fail_closed(self):
        marker = {
            "source_fingerprint": "old-source",
            "build_fingerprint": "old-build",
        }
        expected = {
            "source_fingerprint": "current-source",
            "build_fingerprint": "current-build",
        }

        with self.assertRaisesRegex(
            ios_verification.ProductFingerprintError,
            "source_fingerprint.*old-source.*current-source",
        ):
            ios_verification.require_matching_build_products(marker, expected)
        ios_verification.require_matching_build_products(expected, expected)

    def test_build_fingerprint_includes_configuration_and_sanitizer_arguments(self):
        debug = ios_verification.build_fingerprint(
            source="source",
            plan="ZenbuPR",
            device_type="phone",
            xcode_version="Xcode 26",
            build_arguments=["-configuration", "Debug"],
        )
        release = ios_verification.build_fingerprint(
            source="source",
            plan="ZenbuPR",
            device_type="phone",
            xcode_version="Xcode 26",
            build_arguments=["-configuration", "Release"],
        )
        sanitized = ios_verification.build_fingerprint(
            source="source",
            plan="ZenbuPR",
            device_type="phone",
            xcode_version="Xcode 26",
            build_arguments=[
                "-configuration",
                "Debug",
                "-enableAddressSanitizer",
                "YES",
            ],
        )

        self.assertEqual(len({debug, release, sanitized}), 3)

        first_selector = ios_verification.build_fingerprint(
            source="source",
            plan="ZenbuPR",
            device_type="phone",
            xcode_version="Xcode 26",
            build_arguments=["-only-testing:UITests/testOne"],
        )
        second_selector = ios_verification.build_fingerprint(
            source="source",
            plan="ZenbuPR",
            device_type="phone",
            xcode_version="Xcode 26",
            build_arguments=["-only-testing:UITests/testTwo"],
        )
        self.assertEqual(first_selector, second_selector)

    def test_simulator_lease_excludes_concurrency_and_recovers_dead_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / "simulator.lease"
            first = ios_verification.SimulatorLease.acquire(lock, owner="agent-one")
            with self.assertRaisesRegex(
                ios_verification.SimulatorLeaseUnavailable,
                "agent-one",
            ):
                ios_verification.SimulatorLease.acquire(lock, owner="agent-two")
            first.release()

            lock.write_text(
                json.dumps({"owner": "dead-agent", "pid": 999_999_999}),
                encoding="utf-8",
            )
            recovered = ios_verification.SimulatorLease.acquire(lock, owner="agent-two")
            self.assertEqual(recovered.owner, "agent-two")
            recovered.release()
            self.assertFalse(lock.exists())

            lock.write_text('{"owner":"missing pid"}', encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.SimulatorLeaseUnavailable,
                "unreadable owner",
            ):
                ios_verification.SimulatorLease.acquire(lock, owner="agent-three")

    def test_only_zero_test_infrastructure_failure_is_rerun_eligible(self):
        infrastructure = ios_verification.classify_failure(
            tests_started=0,
            failure_category="simulator-unavailable",
        )
        assertion = ios_verification.classify_failure(
            tests_started=9,
            failure_category="product-assertion",
        )
        pretest_assertion = ios_verification.classify_failure(
            tests_started=0,
            failure_category="product-assertion",
        )

        self.assertEqual(
            infrastructure,
            {"classification": "infrastructure-zero-test", "rerun_eligible": True},
        )
        self.assertFalse(assertion["rerun_eligible"])
        self.assertFalse(pretest_assertion["rerun_eligible"])

    def test_runner_classifies_only_proven_zero_test_infrastructure_as_rerunnable(self):
        infrastructure = ios_verification.classify_test_evidence(
            tests_started=0,
            test_status=70,
            log_text="Unable to find a destination matching the provided specifier",
        )
        unknown = ios_verification.classify_test_evidence(
            tests_started=0,
            test_status=1,
            log_text="unexpected runner output",
        )
        assertion = ios_verification.classify_test_evidence(
            tests_started=1,
            test_status=1,
            log_text="Unable to find a destination matching after assertion",
        )
        self.assertTrue(infrastructure["rerun_eligible"])
        self.assertEqual(unknown["classification"], "unclassified-zero-test")
        self.assertFalse(unknown["rerun_eligible"])
        self.assertFalse(assertion["rerun_eligible"])
        empty_success = ios_verification.classify_test_evidence(
            tests_started=0,
            test_status=0,
            log_text="Testing started",
        )
        self.assertEqual(empty_success["classification"], "zero-test-success")
        self.assertFalse(empty_success["rerun_eligible"])

    def test_execution_summary_binds_timing_and_result_identity(self):
        summary = ios_verification.execution_summary(
            source_sha="abcdef123456",
            source_fingerprint="source-fp",
            build_fingerprint="build-fp",
            plan="ZenbuPR",
            selectors=["ui.search"],
            os_version="iOS 26.5",
            xcode_version="Xcode 26.5",
            attempt=2,
            setup_seconds=4.0,
            build_seconds=10.0,
            test_seconds=3.5,
        )

        self.assertEqual(summary["durations_seconds"]["total"], 17.5)
        self.assertEqual(summary["source_sha"], "abcdef123456")
        self.assertEqual(summary["selectors"], ["ui.search"])
        self.assertEqual(
            summary["result_identity"],
            "ZenbuPR-abcdef123456-ui.search-iOS_26.5-Xcode_26.5-attempt-2",
        )

    def test_required_journey_disappearing_from_every_tier_is_rejected(self):
        manifest = {
            "version": 1,
            "required_journeys": ["search", "handwriting"],
            "selectors": {
                "ui.search": {
                    "plan": "ZenbuPR",
                    "test": "search",
                    "traits": [],
                    "journeys": ["search"],
                }
            },
            "tiers": {"ui": ["ui.search"]},
            "capabilities": {},
            "stages": {"hosted-fast": ["ui"]},
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "handwriting.*no verification tier",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_required_gate_rejects_results_from_an_older_sha(self):
        with self.assertRaisesRegex(
            ios_verification.VerifiedSHAError,
            "older-sha.*current-sha",
        ):
            ios_verification.require_verified_sha(
                current_sha="current-sha",
                partition_shas=["current-sha", "older-sha"],
            )
        ios_verification.require_verified_sha(
            current_sha="current-sha",
            partition_shas=["current-sha", "current-sha"],
        )

    def test_unclassified_ios_path_expands_instead_of_silently_skipping(self):
        manifest = {
            "version": 1,
            "selectors": {
                "unit.all": {
                    "plan": "ZenbuPR",
                    "test": "ZenbuJapaneseTests",
                    "traits": [],
                    "journeys": ["unit-contracts"],
                }
            },
            "tiers": {"unit": ["unit.all"]},
            "capabilities": {},
            "stages": {"hosted-fast": ["unit"]},
            "relevant_paths": ["apps/ios/**"],
            "unclassified_fallback": {"hosted-fast": ["unit.all"]},
        }

        plan = ios_verification.resolve_plan(
            manifest,
            changed_paths=["apps/ios/NewArea/Unknown.swift"],
            stage="hosted-fast",
            event="synchronize",
            draft=False,
            source_sha="current",
        )

        self.assertEqual(plan["selectors"], ["unit.all"])
        self.assertEqual(
            plan["selection_reasons"][0]["capability"],
            "unclassified-ios-fallback",
        )

    def test_merge_candidate_planner_outputs_the_measured_balanced_lanes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "github-output"
            manifest = Path(__file__).parents[2] / "VerificationPolicy.json"
            with redirect_stdout(io.StringIO()):
                self.assertEqual(
                    ios_verification.main(
                        [
                            "--manifest",
                            str(manifest),
                            "plan",
                            "--stage",
                            "merge-candidate",
                            "--event",
                            "merge_group",
                            "--draft",
                            "false",
                            "--source-sha",
                            "merge-sha",
                            "--capability",
                            "full-merge",
                            "--github-output",
                            str(output),
                        ]
                    ),
                    0,
                )
            values = dict(
                line.split("=", 1)
                for line in output.read_text(encoding="utf-8").splitlines()
            )
            matrix = json.loads(values["merge_candidate_matrix"])["include"]
            self.assertEqual(
                [lane["lane"] for lane in matrix],
                [
                    "unit",
                    "accessibility-ui-a",
                    "accessibility-ui-b",
                    "accessibility-ui-c",
                    "normal-ui-a",
                    "normal-ui-b",
                    "normal-ui-c",
                    "normal-ui-d",
                    "normal-ui-e",
                    "sudachi-integration",
                ],
            )
            self.assertEqual(
                [lane["plan"] for lane in matrix],
                [
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuPR",
                    "ZenbuSudachiIntegration",
                ],
            )
            self.assertEqual(
                [lane["test_count"] for lane in matrix],
                [112, 24, 23, 23, 26, 26, 26, 27, 26, 3],
            )
            self.assertEqual(
                [lane["measured_test_seconds"] for lane in matrix],
                [
                    33.951,
                    1289.502,
                    1288.224,
                    1287.983,
                    1295.008,
                    1292.152,
                    1285.508,
                    1285.392,
                    1285.777,
                    4.116,
                ],
            )
            self.assertEqual(
                {lane["timing_profile_run_id"] for lane in matrix},
                {33888752432},
            )
            self.assertEqual(
                [lane["selectors"] for lane in matrix],
                [
                    ["complete.merge-unit"],
                    ["complete.merge-accessibility-a"],
                    ["complete.merge-accessibility-b"],
                    ["complete.merge-accessibility-c"],
                    ["complete.merge-ui-a"],
                    ["complete.merge-ui-b"],
                    ["complete.merge-ui-c"],
                    ["complete.merge-ui-d"],
                    ["complete.merge-ui-e"],
                    ["integration.sudachi"],
                ],
            )
            self.assertNotIn("complete_selectors", values)
            self.assertNotIn("integration_selectors", values)

    def test_merge_candidate_inventory_uses_measured_balanced_exact_partitions(self):
        repo_root = Path(__file__).parents[4]
        inventory = ios_verification.repository_inventory(repo_root)
        partitions = ios_verification.merge_candidate_partitions(inventory)

        ios_verification.require_exact_merge_candidate_partitions(inventory, partitions)
        self.assertEqual(
            {lane: len(partition["tests"]) for lane, partition in partitions.items()},
            {
                "unit": 112,
                "accessibility-ui-a": 24,
                "accessibility-ui-b": 23,
                "accessibility-ui-c": 23,
                "normal-ui-a": 26,
                "normal-ui-b": 26,
                "normal-ui-c": 26,
                "normal-ui-d": 27,
                "normal-ui-e": 26,
                "sudachi-integration": 3,
            },
        )
        accessibility_lanes = [
            f"accessibility-ui-{suffix}" for suffix in ("a", "b", "c")
        ]
        normal_lanes = [f"normal-ui-{suffix}" for suffix in ("a", "b", "c", "d", "e")]
        self.assertTrue(
            all(
                "/AccessibilityAuditUITests/" in test
                for lane in accessibility_lanes
                for test in partitions[lane]["tests"]
            )
        )
        accessibility_tests = {
            test for lane in accessibility_lanes for test in partitions[lane]["tests"]
        }
        self.assertTrue(
            all(
                test.startswith("ZenbuJapaneseUITests/")
                and test not in accessibility_tests
                for lane in normal_lanes
                for test in partitions[lane]["tests"]
            )
        )
        accessibility_loads = [
            partitions[lane]["measured_test_seconds"] for lane in accessibility_lanes
        ]
        normal_loads = [
            partitions[lane]["measured_test_seconds"] for lane in normal_lanes
        ]
        self.assertLess(max(accessibility_loads) - min(accessibility_loads), 2)
        self.assertLess(max(normal_loads) - min(normal_loads), 10)

        unmeasured = json.loads(json.dumps(inventory))
        missing_timing = next(
            iter(unmeasured["merge_candidate_timing_profile"]["test_durations_seconds"])
        )
        del unmeasured["merge_candidate_timing_profile"]["test_durations_seconds"][
            missing_timing
        ]
        with self.assertRaisesRegex(
            ios_verification.PolicyError, f"timing profile omits.*{missing_timing}"
        ):
            ios_verification.merge_candidate_partitions(unmeasured)

        omitted = json.loads(json.dumps(partitions))
        removed = omitted["normal-ui-a"]["tests"].pop()
        with self.assertRaisesRegex(ios_verification.PolicyError, f"omits.*{removed}"):
            ios_verification.require_exact_merge_candidate_partitions(
                inventory, omitted
            )

        duplicated = json.loads(json.dumps(partitions))
        repeated = duplicated["normal-ui-a"]["tests"][0]
        duplicated["normal-ui-b"]["tests"].append(repeated)
        with self.assertRaisesRegex(
            ios_verification.PolicyError, f"duplicates.*{repeated}"
        ):
            ios_verification.require_exact_merge_candidate_partitions(
                inventory, duplicated
            )

        nondeterministic = json.loads(json.dumps(partitions))
        (
            nondeterministic["normal-ui-a"]["tests"][0],
            nondeterministic["normal-ui-b"]["tests"][0],
        ) = (
            nondeterministic["normal-ui-b"]["tests"][0],
            nondeterministic["normal-ui-a"]["tests"][0],
        )
        with self.assertRaisesRegex(
            ios_verification.PolicyError, "normal-ui-a.*deterministic"
        ):
            ios_verification.require_exact_merge_candidate_partitions(
                inventory, nondeterministic
            )

        inaccessible = json.loads(json.dumps(inventory))
        inaccessible["plans"]["ZenbuAccessibility"]["included_tests"].append(
            "ZenbuJapaneseUITests/AccessibilityAuditUITests/testUnpartitioned"
        )
        with self.assertRaisesRegex(
            ios_verification.PolicyError,
            "ZenbuAccessibility.*not required by ZenbuPR.*testUnpartitioned",
        ):
            ios_verification.require_exact_merge_candidate_partitions(
                inaccessible,
                ios_verification.merge_candidate_partitions(inaccessible),
            )

    def test_manual_premerge_planner_preserves_the_same_measured_matrix(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "github-output"
            manifest = Path(__file__).parents[2] / "VerificationPolicy.json"
            with redirect_stdout(io.StringIO()):
                ios_verification.main(
                    [
                        "--manifest",
                        str(manifest),
                        "plan",
                        "--stage",
                        "manual",
                        "--event",
                        "workflow_dispatch",
                        "--draft",
                        "false",
                        "--source-sha",
                        "manual-sha",
                        "--capability",
                        "full-merge",
                        "--github-output",
                        str(output),
                    ]
                )
            values = dict(
                line.split("=", 1)
                for line in output.read_text(encoding="utf-8").splitlines()
            )
            self.assertEqual(
                len(json.loads(values["merge_candidate_matrix"])["include"]), 10
            )

    def test_repository_contract_requires_one_selector_for_every_generated_lane(self):
        repo_root = Path(__file__).parents[4]
        manifest = ios_verification.load_and_validate_manifest(
            repo_root / "apps/ios/VerificationPolicy.json"
        )
        manifest["capabilities"]["full-merge"]["merge-candidate"].remove(
            "complete.merge-ui-b"
        )
        manifest["tiers"]["complete"].remove("complete.merge-ui-b")
        del manifest["selectors"]["complete.merge-ui-b"]

        with self.assertRaisesRegex(
            ios_verification.PolicyError,
            "generated merge-candidate selectors.*normal-ui-b",
        ):
            ios_verification.validate_repository_contracts(manifest, repo_root)

    def test_inventory_cli_publishes_the_exact_generated_partition_membership(self):
        repo_root = Path(__file__).parents[4]
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(
                ios_verification.main(["inventory", "--repo-root", str(repo_root)]),
                0,
            )
        inventory = json.loads(output.getvalue())
        partitions = inventory["merge_candidate_partitions"]
        self.assertEqual(
            inventory["merge_candidate_timing_profile"]["source"]["workflow_run_id"],
            33888752432,
        )
        self.assertEqual(
            inventory["merge_candidate_timing_profile"]["source"]["source_sha"],
            "84bece9fc47e5aa0bd7420befc600a915464f5d3",
        )
        self.assertEqual(
            {lane: len(partition["tests"]) for lane, partition in partitions.items()},
            {
                "unit": 112,
                "accessibility-ui-a": 24,
                "accessibility-ui-b": 23,
                "accessibility-ui-c": 23,
                "normal-ui-a": 26,
                "normal-ui-b": 26,
                "normal-ui-c": 26,
                "normal-ui-d": 27,
                "normal-ui-e": 26,
                "sudachi-integration": 3,
            },
        )

    def test_generated_partition_selectors_expand_to_the_inventory_tests(self):
        repo_root = Path(__file__).parents[4]
        expected = {
            "complete.merge-unit": ("ZenbuPR", 112),
            "complete.merge-accessibility-a": ("ZenbuPR", 24),
            "complete.merge-accessibility-b": ("ZenbuPR", 23),
            "complete.merge-accessibility-c": ("ZenbuPR", 23),
            "complete.merge-ui-a": ("ZenbuPR", 26),
            "complete.merge-ui-b": ("ZenbuPR", 26),
            "complete.merge-ui-c": ("ZenbuPR", 26),
            "complete.merge-ui-d": ("ZenbuPR", 27),
            "complete.merge-ui-e": ("ZenbuPR", 26),
            "integration.sudachi": ("ZenbuSudachiIntegration", 3),
        }
        for selector, (plan, count) in expected.items():
            with self.subTest(selector=selector), redirect_stdout(
                output := io.StringIO()
            ):
                self.assertEqual(
                    ios_verification.main(
                        [
                            "tests",
                            "--plan",
                            plan,
                            "--stage",
                            "merge-candidate",
                            "--repo-root",
                            str(repo_root),
                            "--selector",
                            selector,
                        ]
                    ),
                    0,
                )
            selection = json.loads(output.getvalue())
            self.assertEqual(selection["mode"], "selected-tests")
            self.assertEqual(len(selection["tests"]), count)

    def test_full_plan_selector_uses_an_explicit_tagged_cli_protocol(self):
        repo_root = Path(__file__).parents[4]
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(
                ios_verification.main(
                    [
                        "tests",
                        "--plan",
                        "ZenbuPR",
                        "--stage",
                        "release",
                        "--repo-root",
                        str(repo_root),
                        "--selector",
                        "complete.public",
                    ]
                ),
                0,
            )
        self.assertEqual(
            json.loads(output.getvalue()),
            {"mode": "full-plan", "tests": []},
        )

    def test_target_selector_must_be_nonempty_in_its_declared_plan(self):
        repo_root = Path(__file__).parents[4]
        manifest = ios_verification.load_and_validate_manifest(
            repo_root / "apps/ios/VerificationPolicy.json"
        )
        manifest["selectors"]["unit.complete"]["plan"] = "ZenbuAccessibility"

        with self.assertRaisesRegex(
            ios_verification.PolicyError,
            "unit.complete.*ZenbuJapaneseTests.*ZenbuAccessibility.*does not include",
        ):
            ios_verification.validate_repository_contracts(manifest, repo_root)

    def test_manual_or_performance_membership_cannot_replace_correctness_coverage(self):
        inventory = {
            "tests": ["UITests/JourneyTests/testSearch"],
            "plans": {
                "ZenbuPR": {"included_tests": []},
                "ZenbuNightly": {"included_tests": ["UITests/JourneyTests/testSearch"]},
            },
        }
        with self.assertRaisesRegex(
            ios_verification.PolicyError,
            "correctness plan.*testSearch",
        ):
            ios_verification.require_correctness_coverage(
                inventory,
                correctness_plans=["ZenbuPR"],
                exact_exclusions=set(),
            )


if __name__ == "__main__":
    unittest.main()
