from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).parents[4]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"


def workflow_text(name: str) -> str:
    return (WORKFLOWS / name).read_text(encoding="utf-8")


def trigger_section(workflow: str) -> str:
    return workflow.split("on:\n", 1)[1].split("\npermissions:", 1)[0]


class IOSWorkflowPolicyTests(unittest.TestCase):
    def test_fast_workflow_runs_on_pull_requests_but_not_merge_groups(self):
        workflow = workflow_text("ios-quality.yml")
        triggers = trigger_section(workflow)
        self.assertIn("  pull_request:\n", triggers)
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertNotIn("  merge_group:\n", triggers)
        self.assertIn("    name: ios-fast / Required\n", workflow)

    def test_premerge_workflow_reports_the_same_gate_on_pr_and_merge_group(self):
        workflow = workflow_text("ios-premerge.yml")
        triggers = trigger_section(workflow)
        self.assertIn("  pull_request:\n", triggers)
        self.assertIn("  merge_group:\n", triggers)
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertIn("    name: ios-premerge / Required\n", workflow)

    def test_complete_suite_is_deferred_to_merge_group(self):
        workflow = workflow_text("ios-premerge.yml")
        complete_job = workflow.split("  complete-suite:\n", 1)[1].split(
            "\n  required:\n", 1
        )[0]
        self.assertIn("github.event_name == 'merge_group'", complete_job)
        self.assertNotIn("github.event_name == 'pull_request'", complete_job)
        self.assertIn("ZenbuPR", complete_job)
        self.assertNotIn("-only-testing", complete_job)

    def test_fast_ui_partition_is_bounded_and_excludes_inherited_failures(self):
        workflow = workflow_text("ios-quality.yml")
        ui_job = workflow.split("  ios-ui:\n", 1)[1].split(
            "\n  ios-accessibility:\n", 1
        )[0]
        selected_journeys = [
            line
            for line in ui_job.splitlines()
            if "SearchExperienceJourneyUITests/" in line
        ]
        self.assertLessEqual(len(selected_journeys), 12)
        for failing_test in (
            "testHandwritingCandidatesComposeCommonKanjiAndEnterHistory",
            "testHandwritingSearchIncludesPendingRecognizedStroke",
            "testRadicalCandidateSubmitsKanjiResultAndEntersHistory",
            "testRealRadicalCandidateWithoutAnyDictionaryMatchStillOpensKanjiResult",
            "testLookupFailureIsNotPresentedAsNoMatchAndRetryRecovers",
        ):
            self.assertNotIn(failing_test, ui_job)

    def test_manual_breadth_workflow_has_no_schedule(self):
        triggers = trigger_section(workflow_text("ios-nightly.yml"))
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertNotIn("  schedule:\n", triggers)

    def test_release_validation_is_manual_complete_and_release_configured(self):
        workflow = workflow_text("ios-release-validation.yml")
        triggers = trigger_section(workflow)
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertNotIn("  pull_request:\n", triggers)
        self.assertNotIn("  schedule:\n", triggers)
        self.assertIn("Run the complete candidate suite", workflow)
        self.assertIn("ZenbuPR", workflow)
        self.assertIn("-configuration Release", workflow)


if __name__ == "__main__":
    unittest.main()
