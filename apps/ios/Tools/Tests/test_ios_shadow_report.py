import json
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).parents[1]
sys.path.insert(0, str(TOOLS))
import ios_shadow_report as report
import ios_verification as policy


class ShadowReportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.evidence = Path(self.directory.name)
        root = TOOLS.parents[2]
        self.manifest = policy.load_and_validate_manifest(
            root / "apps/ios/VerificationPolicy.json"
        )
        self.inventory = policy.repository_inventory(root)
        self.jobs = []
        partitions = policy.merge_candidate_partitions(self.inventory)
        full = policy.merge_candidate_matrix(
            self.manifest,
            self.manifest["capabilities"]["full-merge"]["merge-candidate"],
            self.inventory,
        )["include"]
        shadow = policy.lean_shadow_matrix(self.manifest, self.inventory)["include"]
        for lane in full + shadow:
            tests = set().union(
                *(
                    policy.selector_tests(
                        self.manifest["selectors"][key], self.inventory, partitions
                    )
                    for key in lane["selectors"]
                )
            )
            prefix = self.evidence / f'ZenbuPreMerge-{lane["lane"]}.xcresult'
            Path(str(prefix) + ".timing.json").write_text(
                json.dumps(
                    {
                        "source_sha": "candidate",
                        "attempt": 1,
                        "selectors": lane["selectors"],
                        "durations_seconds": {
                            "setup": 1,
                            "build": 1,
                            "test": 1,
                            "total": 3,
                        },
                        "failure": {"classification": "success"},
                    }
                )
            )
            Path(str(prefix) + ".results.json").write_text(
                json.dumps(
                    {
                        "result": "Passed",
                        "totalTestCount": len(tests),
                        "skippedTests": 0,
                        "testFailures": [],
                    }
                )
            )
            Path(str(prefix) + ".tests.json").write_text(
                json.dumps(
                    {
                        "testNodes": [
                            {
                                "nodeType": "Test Case",
                                "nodeIdentifierURL": "test://com.apple.xcode/ZenbuJapanese/"
                                + test,
                                "result": "Passed",
                                "durationInSeconds": 1,
                            }
                            for test in sorted(tests)
                        ]
                    }
                )
            )
            prefix = (
                "ios-shadow" if lane["lane"].startswith("shadow-") else "ios-premerge"
            )
            self.jobs.append(
                {
                    "name": f'{prefix} / {lane["lane"]}',
                    "conclusion": "success",
                    "completed_at": "2026-09-11T00:01:00Z",
                }
            )
        self.jobs.append(
            {
                "name": "ios-shadow / Contracts",
                "conclusion": "success",
                "completed_at": "2026-09-11T00:01:00Z",
            }
        )

    def compare(self):
        return report.compare(
            self.manifest,
            self.inventory,
            self.evidence,
            self.jobs,
            "candidate",
            "2026-09-11T00:00:00Z",
        )

    def mutate(self, lane, suffix, change):
        path = self.evidence / f"ZenbuPreMerge-{lane}.xcresult.{suffix}.json"
        document = json.loads(path.read_text())
        change(document)
        path.write_text(json.dumps(document))

    def test_complete_evidence_qualifies_but_never_authorizes_cutover(self):
        result = self.compare()
        self.assertEqual(result["problems"], [])
        self.assertTrue(result["candidate_qualifies"])
        self.assertFalse(result["cutover_authorized"])
        self.assertEqual(result["shadow_wall_seconds"], 60)

    def test_missing_or_old_candidate_receipt_cannot_qualify(self):
        self.mutate("shadow-unit", "timing", lambda x: x.update(source_sha="old"))
        result = self.compare()
        self.assertFalse(result["candidate_qualifies"])
        self.assertTrue(any("SHA" in p for p in result["problems"]))
        (self.evidence / "ZenbuPreMerge-shadow-unit.xcresult.timing.json").unlink()
        self.assertFalse(self.compare()["candidate_qualifies"])

    def test_dropped_test_is_not_disguised_by_a_successful_lane(self):
        self.mutate("shadow-unit", "tests", lambda x: x["testNodes"].pop())
        self.assertFalse(self.compare()["candidate_qualifies"])

    def test_full_only_failures_are_retained(self):
        self.mutate(
            "normal-ui-a", "tests", lambda x: x["testNodes"][0].update(result="Failed")
        )
        result = self.compare()
        self.assertEqual(len(result["full_only_failures"]), 1)
        self.assertFalse(result["candidate_qualifies"])

    def test_slow_method_and_failed_repetition_are_not_averaged_away(self):
        self.mutate(
            "shadow-ui-a",
            "tests",
            lambda x: x["testNodes"][0].update(
                children=[
                    {
                        "nodeType": "Repetition",
                        "result": "Failed",
                        "durationInSeconds": 121,
                    },
                    {
                        "nodeType": "Repetition",
                        "result": "Passed",
                        "durationInSeconds": 1,
                    },
                ]
            ),
        )
        result = self.compare()
        self.assertFalse(result["candidate_qualifies"])
        self.assertTrue(any("120 seconds" in p for p in result["problems"]))

    def test_workflow_rerun_cannot_hide_a_previous_failed_attempt(self):
        for path in self.evidence.glob("*.timing.json"):
            document = json.loads(path.read_text())
            document["attempt"] = 2
            path.write_text(json.dumps(document))
        result = report.compare(
            self.manifest,
            self.inventory,
            self.evidence,
            self.jobs,
            "candidate",
            "2026-09-11T00:00:00Z",
            run_attempt=2,
        )
        self.assertFalse(result["candidate_qualifies"])
        self.assertEqual(result["run_attempt"], 2)
        self.assertTrue(any("prior failures" in p for p in result["problems"]))

    def test_wall_time_includes_setup_and_scheduling(self):
        self.jobs[-1]["completed_at"] = "2026-09-11T00:15:01Z"
        result = self.compare()
        self.assertFalse(result["candidate_qualifies"])
        self.assertEqual(result["shadow_wall_seconds"], 901)


if __name__ == "__main__":
    unittest.main()
