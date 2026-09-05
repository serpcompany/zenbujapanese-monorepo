from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).parents[4]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
TOOLS = REPO_ROOT / "apps" / "ios" / "Tools"


def workflow_text(name: str) -> str:
    return (WORKFLOWS / name).read_text(encoding="utf-8")


def trigger_section(workflow: str) -> str:
    return workflow.split("on:\n", 1)[1].split("\npermissions:", 1)[0]


class IOSWorkflowPolicyTests(unittest.TestCase):
    def test_manual_premerge_can_select_only_the_registered_reviewer_gate(self):
        workflow = workflow_text("ios-premerge.yml")
        triggers = trigger_section(workflow)
        self.assertIn("default: full-merge", triggers)
        self.assertIn("options: [full-merge, reviewer-contrast]", triggers)
        self.assertIn("MANUAL_CAPABILITY: ${{ inputs.capability || 'full-merge' }}", workflow)
        self.assertIn('args+=(--capability "$MANUAL_CAPABILITY")', workflow)

    def test_photo_fixture_is_loaded_only_into_the_new_disposable_simulator(self):
        runner = (TOOLS / "run_ci_test_plan.sh").read_text(encoding="utf-8")
        seed = 'xcrun simctl addmedia "$simulator_id" "$repo_root/docs/clone-discovery/nihongo/fixtures/image-text/fixture-clear-horizontal.png"'
        self.assertIn(seed, runner)
        self.assertLess(runner.index("xcrun simctl create"), runner.index(seed))
        self.assertLess(runner.index("xcrun simctl bootstatus"), runner.index(seed))
        self.assertNotIn("simctl addmedia booted", runner)

    def test_fast_workflow_reports_required_status_on_pull_requests_and_merge_groups(
        self,
    ):
        workflow = workflow_text("ios-quality.yml")
        triggers = trigger_section(workflow)
        self.assertIn("  pull_request:\n", triggers)
        self.assertIn(
            "types: [opened, reopened, synchronize, ready_for_review, converted_to_draft]",
            triggers,
        )
        self.assertIn("  merge_group:\n", triggers)
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertIn("    name: ios-fast / Required\n", workflow)
        self.assertIn("deferred-merge-group", workflow)
        self.assertIn(
            "cancel-in-progress: ${{ github.event_name != 'merge_group' }}", workflow
        )

    def test_premerge_workflow_reports_the_same_gate_on_pr_and_merge_group(self):
        workflow = workflow_text("ios-premerge.yml")
        triggers = trigger_section(workflow)
        self.assertIn("  pull_request:\n", triggers)
        self.assertIn("  merge_group:\n", triggers)
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertIn("'ios-premerge / Reviewer contrast' || 'ios-premerge / Required'", workflow)

    def test_complete_suite_uses_the_measured_exact_candidate_matrix(self):
        workflow = workflow_text("ios-premerge.yml")
        complete_job = workflow.split("  complete-suite:\n", 1)[1].split(
            "\n  required:\n", 1
        )[0]
        self.assertIn("github.event_name == 'merge_group'", complete_job)
        self.assertNotIn("github.event_name == 'pull_request'", complete_job)
        self.assertIn("fail-fast: false", complete_job)
        self.assertIn(
            "matrix: ${{ fromJson(needs.scope.outputs.merge_candidate_matrix) }}",
            complete_job,
        )
        self.assertIn("name: ios-premerge / ${{ matrix.lane }}", complete_job)
        self.assertIn("${{ matrix.plan }}", complete_job)
        self.assertIn("${{ toJson(matrix.selectors) }}", complete_job)
        self.assertIn("${{ matrix.test_count }}", complete_job)
        self.assertIn("${{ matrix.measured_test_seconds }}", complete_job)
        self.assertIn("${{ matrix.timing_profile_run_id }}", complete_job)
        self.assertIn(
            "ref: ${{ github.event.merge_group.head_sha || github.sha }}",
            complete_job,
        )
        self.assertNotIn("-only-testing", complete_job)
        self.assertEqual(complete_job.count("run_selected_test_plan.sh"), 1)

        scope = workflow.split("  scope:\n", 1)[1].split("\n  complete-suite:\n", 1)[0]
        self.assertIn("merge_candidate_matrix:", scope)
        self.assertIn("ios_verification.py validate", scope)
        self.assertNotIn("complete_selectors:", scope)
        self.assertNotIn("integration_selectors:", scope)

        required = workflow.split("  required:\n", 1)[1]
        self.assertIn("needs: [scope, complete-suite]", required)
        self.assertIn("COMPLETE_RESULT: ${{ needs.complete-suite.result }}", required)

    def test_fast_partitions_are_manifest_selected_without_workflow_selectors(self):
        workflow = workflow_text("ios-quality.yml")
        self.assertIn("apps/ios/Tools/ios_verification.py plan", workflow)
        self.assertIn("needs.scope.outputs.run_expensive == 'true'", workflow)
        self.assertNotIn("-only-testing:", workflow)

    def test_critical_ui_budget_covers_the_measured_ready_checkpoint(self):
        workflow = workflow_text("ios-quality.yml")
        critical_ui = workflow.split("  ios-ui:\n", 1)[1].split(
            "\n  ios-accessibility:\n", 1
        )[0]
        self.assertIn("    timeout-minutes: 45\n", critical_ui)

    def test_draft_pushes_are_cheap_and_ready_heads_are_sha_bound(self):
        workflow = workflow_text("ios-quality.yml")
        self.assertIn("github.event.pull_request.draft", workflow)
        self.assertIn("ready_for_review", workflow)
        self.assertIn("converted_to_draft", workflow)
        self.assertIn(
            "cancel-in-progress: ${{ github.event_name != 'merge_group' }}", workflow
        )
        self.assertIn("verify-sha", workflow)
        self.assertIn("github.event.pull_request.head.sha", workflow)
        self.assertIn(
            "ref: ${{ github.event.pull_request.head.sha || github.sha }}", workflow
        )
        self.assertNotIn("ref: ${{ needs.scope.outputs.source_sha }}", workflow)
        self.assertIn("tested_sha=$(git rev-parse HEAD)", workflow)
        self.assertIn("SCOPE_RESULT: ${{ needs.scope.result }}", workflow)
        self.assertIn('[[ "$SCOPE_RESULT" == success ]]', workflow)
        self.assertIn("cadence", workflow)
        self.assertEqual(workflow.count("GITHUB_STEP_SUMMARY"), 3)
        self.assertIn("ZenbuFast-UI-Summary-", workflow)
        self.assertIn("ZenbuFast-Unit-Summary-", workflow)
        self.assertIn("ZenbuFast-Accessibility-Summary-", workflow)

        premerge = workflow_text("ios-premerge.yml")
        self.assertIn("SCOPE_RESULT: ${{ needs.scope.result }}", premerge)
        self.assertIn('[[ "$SCOPE_RESULT" == success ]]', premerge)

    def test_manual_breadth_workflow_has_no_schedule(self):
        triggers = trigger_section(workflow_text("ios-nightly.yml"))
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertNotIn("  schedule:\n", triggers)

    def test_release_validation_is_manual_complete_and_release_configured(self):
        workflow = workflow_text("ios-release-validation.yml")
        self.assertIn("ZenbuIncreasedContrast", workflow)
        self.assertIn('["complete.increased-contrast"]', workflow)
        self.assertIn("ZenbuPreReleaseContrast.xcresult.zip", workflow)
        triggers = trigger_section(workflow)
        self.assertIn("  workflow_dispatch:\n", triggers)
        self.assertNotIn("  pull_request:\n", triggers)
        self.assertNotIn("  schedule:\n", triggers)
        self.assertIn("Run the complete candidate suite", workflow)
        self.assertIn("ZenbuPR", workflow)
        self.assertIn("-configuration Release", workflow)

    def test_performance_workflow_uses_the_canonical_manifest(self):
        workflow = workflow_text("ios-performance.yml")
        self.assertIn("ios_verification.py plan", workflow)
        self.assertIn("--capability full-performance", workflow)
        self.assertIn("run_selected_test_plan.sh", workflow)
        self.assertNotIn("run_ci_test_plan.sh", workflow)

    def test_local_issue_gate_is_offline_budgeted_and_reuses_prepared_products(self):
        issue_runner = (TOOLS / "run_issue_verification.sh").read_text(encoding="utf-8")
        selected_runner = (TOOLS / "run_selected_test_plan.sh").read_text(
            encoding="utf-8"
        )
        xcode_runner = (TOOLS / "run_ci_test_plan.sh").read_text(encoding="utf-8")
        self.assertIn('ios_verification.py" plan', issue_runner)
        self.assertIn("contracts.issue-policy", issue_runner)
        self.assertIn(
            "for prohibited_tier in ui diagnostics accessibility integration complete performance",
            issue_runner,
        )
        self.assertNotIn("run_partition ui ", issue_runner)
        self.assertNotIn("run_partition accessibility ", issue_runner)
        self.assertNotIn("run_partition integration ", issue_runner)
        self.assertIn("--offline", issue_runner)
        self.assertIn("source-fingerprint", issue_runner)
        self.assertIn("ZENBU_ISSUE_DERIVED_DATA_ROOT", issue_runner)
        self.assertIn("maximum_prepared_seconds", issue_runner)
        self.assertIn("verify-issue-duration", issue_runner)
        self.assertIn("partition_status=$?", issue_runner)
        self.assertIn("duration_status=$?", issue_runner)
        self.assertIn('return "$partition_status"', issue_runner)
        self.assertNotIn("mktemp -d", issue_runner)
        self.assertNotIn("cleanup_reuse_root", issue_runner)
        self.assertIn('ZENBU_DERIVED_DATA="$reuse_root/$plan"', issue_runner)
        self.assertIn("resolved no selectors", selected_runner)
        self.assertIn("ZENBU_POLICY_AUTHORIZED", selected_runner)
        self.assertIn("full_plan_selector_count", selected_runner)
        self.assertNotIn("__ZENBU_FULL_PLAN__", selected_runner)
        self.assertIn("ZENBU_POLICY_AUTHORIZED", xcode_runner)


if __name__ == "__main__":
    unittest.main()
