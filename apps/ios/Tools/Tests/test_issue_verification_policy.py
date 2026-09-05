import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).parents[1] / "ios_verification.py"
SPEC = importlib.util.spec_from_file_location("ios_verification", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
ios_verification = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ios_verification)


class IssueVerificationPolicyTests(unittest.TestCase):
    def manifest(self):
        return {
            "version": 1,
            "issue_execution": {
                "maximum_prepared_seconds": 60,
                "allowed_tiers": ["contracts", "unit"],
                "default_deferred_owner_stage": "hosted-fast",
                "deferred_owner_by_tier": {
                    "ui": "hosted-fast",
                    "accessibility": "hosted-fast",
                    "integration": "merge-candidate",
                    "complete": "merge-candidate",
                },
            },
            "selectors": {
                "contracts.issue-policy": {
                    "plan": None,
                    "test": None,
                    "traits": ["deterministic", "static"],
                    "journeys": ["issue-policy"],
                    "issue_execution_seconds": 5,
                },
                "unit.focused": {
                    "plan": "ZenbuPR",
                    "test": "ZenbuJapaneseTests/SearchTests/testRanking",
                    "traits": ["deterministic"],
                    "journeys": ["search-ranking-logic"],
                    "issue_execution_seconds": 42,
                },
                "unit.complete": {
                    "plan": "ZenbuPR",
                    "test": "ZenbuJapaneseTests",
                    "traits": ["deterministic", "complete-target"],
                    "journeys": ["unit-contracts"],
                    "issue_execution_seconds": 8,
                },
                "ui.search": {
                    "plan": "ZenbuPR",
                    "test": "ZenbuJapaneseUITests/SearchTests/testSearch",
                    "traits": ["deterministic", "ui"],
                    "journeys": ["search-ranking-ui"],
                },
                "integration.provider": {
                    "plan": "ZenbuIntegration",
                    "test": None,
                    "traits": ["integration", "network", "large-resource"],
                    "journeys": ["provider-provenance"],
                },
            },
            "tiers": {
                "contracts": ["contracts.issue-policy"],
                "unit": ["unit.focused", "unit.complete"],
                "ui": ["ui.search"],
                "accessibility": [],
                "integration": ["integration.provider"],
                "complete": [],
            },
            "required_stage_selectors": {"issue-final": ["contracts.issue-policy"]},
            "capabilities": {
                "search": {
                    "paths": ["Search.swift"],
                    "issue-final": [
                        "unit.focused",
                        "unit.complete",
                        "ui.search",
                        "integration.provider",
                    ],
                }
            },
            "stages": {
                "issue-final": [
                    "contracts",
                    "unit",
                    "ui",
                    "accessibility",
                    "integration",
                ],
                "hosted-fast": ["contracts", "unit", "ui", "accessibility"],
                "merge-candidate": ["contracts", "complete", "integration"],
            },
        }

    def test_issue_final_runs_only_fast_policy_and_focused_unit_selectors(self):
        plan = ios_verification.resolve_plan(
            self.manifest(),
            changed_paths=["Search.swift"],
            stage="issue-final",
            event="local",
            draft=True,
            source_sha="candidate",
        )

        self.assertEqual(plan["selectors"], ["contracts.issue-policy", "unit.focused"])
        self.assertEqual(
            plan["deferred_selectors"],
            [
                {
                    "selector": "unit.complete",
                    "owner_stage": "hosted-fast",
                    "reason": "complete test targets are not issue-level checks",
                },
                {
                    "selector": "ui.search",
                    "owner_stage": "hosted-fast",
                    "reason": "ui tier is deferred from issue-level execution",
                },
                {
                    "selector": "integration.provider",
                    "owner_stage": "merge-candidate",
                    "reason": "integration tier is deferred from issue-level execution",
                },
            ],
        )

    def test_over_budget_unit_is_deferred_to_the_pr_checkpoint(self):
        manifest = self.manifest()
        manifest["selectors"]["unit.focused"]["issue_execution_seconds"] = 60.001

        plan = ios_verification.resolve_plan(
            manifest,
            changed_paths=["Search.swift"],
            stage="issue-final",
            event="local",
            draft=True,
            source_sha="candidate",
        )

        self.assertNotIn("unit.focused", plan["selectors"])
        self.assertEqual(
            plan["deferred_selectors"][0],
            {
                "selector": "unit.focused",
                "owner_stage": "hosted-fast",
                "reason": "predicted 60.001s exceeds the 60s issue budget",
            },
        )

    def test_xcuitest_cannot_be_disguised_as_a_fast_unit_selector(self):
        manifest = self.manifest()
        manifest["selectors"]["unit.focused"] = {
            "plan": "ZenbuPR",
            "test": "ZenbuJapaneseUITests/SearchTests/testSearch",
            "traits": ["deterministic"],
            "journeys": ["search-ranking-logic"],
            "issue_execution_seconds": 10,
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "unit.focused.*XCUITest.*issue-level",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_issue_unit_must_be_deterministic_and_name_one_exact_method(self):
        invalid_selectors = {
            "missing deterministic trait": {
                "test": "ZenbuJapaneseTests/SearchTests/testRanking",
                "traits": [],
                "message": "unit.focused.*deterministic",
            },
            "missing identity": {
                "test": None,
                "traits": ["deterministic"],
                "message": "unit.focused.*exact target/class/method",
            },
            "class-wide identity": {
                "test": "ZenbuJapaneseTests/SearchTests",
                "traits": ["deterministic"],
                "message": "unit.focused.*exact target/class/method",
            },
            "empty class identity": {
                "test": "ZenbuJapaneseTests//testRanking",
                "traits": ["deterministic"],
                "message": "unit.focused.*exact target/class/method",
            },
        }

        for name, invalid in invalid_selectors.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                manifest = self.manifest()
                selector = manifest["selectors"]["unit.focused"]
                selector["test"] = invalid["test"]
                selector["traits"] = invalid["traits"]
                path = Path(directory) / "manifest.json"
                path.write_text(json.dumps(manifest), encoding="utf-8")
                with self.assertRaisesRegex(
                    ios_verification.PolicyError, invalid["message"]
                ):
                    ios_verification.load_and_validate_manifest(path)

    def test_issue_contract_must_be_deterministic(self):
        manifest = self.manifest()
        manifest["selectors"]["contracts.issue-policy"]["traits"] = ["static"]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "contracts.issue-policy.*deterministic",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_deferred_coverage_keeps_an_explicit_pr_or_merge_owner(self):
        manifest = self.manifest()
        del manifest["issue_execution"]["deferred_owner_by_tier"]["ui"]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(
                ios_verification.PolicyError,
                "ui.*deferred owner",
            ):
                ios_verification.load_and_validate_manifest(path)

    def test_repository_policy_defers_workflow_breadth_but_preserves_ready_gate(self):
        repo_root = Path(__file__).parents[4]
        manifest = ios_verification.load_and_validate_manifest(
            repo_root / "apps/ios/VerificationPolicy.json"
        )

        issue = ios_verification.resolve_plan(
            manifest,
            changed_paths=[],
            stage="issue-final",
            event="local",
            draft=True,
            source_sha="candidate",
            requested_capabilities=["verification-workflow"],
        )
        ready = ios_verification.resolve_plan(
            manifest,
            changed_paths=[],
            stage="hosted-fast",
            event="ready_for_review",
            draft=False,
            source_sha="candidate",
            requested_capabilities=["verification-workflow"],
        )

        self.assertEqual(issue["selectors"], ["contracts.issue-policy"])
        self.assertEqual(
            issue["deferred_selectors"],
            [
                {
                    "selector": "contracts.repository",
                    "owner_stage": "hosted-fast",
                    "reason": "selector has no reviewed prepared-environment duration",
                }
            ],
        )
        self.assertEqual(ready["selectors"], ["contracts.repository"])

    def test_low_level_adapter_refuses_deferred_ui_at_issue_stage(self):
        repo_root = Path(__file__).parents[4]
        with self.assertRaisesRegex(
            ios_verification.PolicyError,
            "ui.search-ranking.*deferred.*hosted-fast",
        ):
            ios_verification.main(
                [
                    "tests",
                    "--selector",
                    "ui.search-ranking",
                    "--plan",
                    "ZenbuPR",
                    "--stage",
                    "issue-final",
                    "--repo-root",
                    str(repo_root),
                ]
            )

    def test_observed_issue_total_fails_when_it_exceeds_the_budget(self):
        ios_verification.require_issue_duration_within_budget(
            observed_seconds=59.999, maximum_seconds=60
        )
        with self.assertRaisesRegex(
            ios_verification.PolicyError,
            "60.001s.*60s.*defer.*PR owner",
        ):
            ios_verification.require_issue_duration_within_budget(
                observed_seconds=60.001, maximum_seconds=60
            )


if __name__ == "__main__":
    unittest.main()
