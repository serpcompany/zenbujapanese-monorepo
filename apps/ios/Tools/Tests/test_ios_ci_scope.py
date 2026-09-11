import importlib.util
import io
from pathlib import Path
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "ios_ci_scope.py"
SPEC = importlib.util.spec_from_file_location("ios_ci_scope", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
ios_ci_scope = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ios_ci_scope)


class IOSCIScopeTests(unittest.TestCase):
    def test_ios_source_is_relevant(self):
        self.assertTrue(
            ios_ci_scope.is_ios_relevant_path(
                "apps/ios/Modules/Sources/SearchExperience/SearchView.swift"
            )
        )

    def test_ios_workflow_is_relevant(self):
        self.assertTrue(
            ios_ci_scope.is_ios_relevant_path(".github/workflows/ios-premerge.yml")
        )

    def test_ios_owned_documents_and_evidence_do_not_require_xcode(self):
        paths = [
            "apps/ios/README.md",
            "apps/ios/CHANGELOG.md",
            "apps/ios/CI.md",
            "apps/ios/ReleasePrivacyAudit.md",
            "apps/ios/Verification/JOURNEY-SEARCH-TEXT-v3/README.md",
            "apps/ios/Verification/JOURNEY-SEARCH-TEXT-v3/evidence.png",
            "apps/ios/screenshots/app-store/en-US/iphone-67/01-search-results.png",
            "docs/releases/ios/1.0.0.md",
        ]
        for path in paths:
            with self.subTest(path=path):
                self.assertTrue(ios_ci_scope.is_ios_relevant_path(path))
                self.assertFalse(ios_ci_scope.is_ios_runtime_path(path))

    def test_product_family_documents_and_brand_sources_do_not_require_xcode(self):
        paths = [
            "README.md",
            "assets/brand/zenbu/zenbu-icon-pack-complete.zip",
            "docs/research/engineering/product-family-repository-topology-2026-09-11.md",
        ]
        for path in paths:
            with self.subTest(path=path):
                self.assertFalse(ios_ci_scope.is_ios_runtime_path(path))

    def test_runtime_paths_require_xcode(self):
        paths = [
            "apps/ios/App/ZenbuJapaneseApp.swift",
            "apps/ios/Modules/Sources/SearchExperience/SearchView.swift",
            "apps/ios/AppUITests/SearchExperienceJourneyUITests.swift",
            "apps/ios/TestPlans/ZenbuPR.xctestplan",
            "apps/ios/LanguageData/Generated/JMdict.sqlite3",
            "apps/ios/VerificationPolicy.json",
            "apps/ios/VerificationTimingProfile.json",
            "apps/ios/Tools/ios_ci_scope.py",
            ".github/workflows/ios-premerge.yml",
            "docs/clone-discovery/nihongo/fixtures/image-text/fixture-empty.png",
        ]
        for path in paths:
            with self.subTest(path=path):
                self.assertTrue(ios_ci_scope.is_ios_runtime_path(path))

    def test_external_build_inputs_are_relevant(self):
        self.assertTrue(
            ios_ci_scope.is_ios_relevant_path(
                "docs/clone-discovery/nihongo/fixtures/image-text/fixture-empty.png"
            )
        )
        self.assertTrue(
            ios_ci_scope.is_ios_relevant_path(
                "docs/research/tatoeba-nihongo-sample-2026-08-14.tsv"
            )
        )
        self.assertTrue(
            ios_ci_scope.is_ios_relevant_path(
                "docs/research/fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv"
            )
        )
        self.assertTrue(
            ios_ci_scope.is_ios_relevant_path(
                "docs/research/fixtures/example-sentence-retrieval-issue-147-retrieval-candidate-rows.tsv"
            )
        )

    def test_unrelated_paths_are_not_relevant(self):
        self.assertFalse(ios_ci_scope.is_ios_relevant_path("README.md"))
        self.assertFalse(ios_ci_scope.is_ios_relevant_path("apps/website/page.tsx"))
        self.assertFalse(
            ios_ci_scope.is_ios_relevant_path(".github/workflows/jmdict-upstream-check.yml")
        )

    def test_cli_reports_if_any_path_is_relevant(self):
        output = io.StringIO()
        with redirect_stdout(output):
            result = ios_ci_scope.main(
                ["README.md", "apps/ios/App/ZenbuJapaneseApp.swift"]
            )
        self.assertEqual(result, 0)
        self.assertTrue(output.getvalue().endswith("ios_changed=true\n"))
        self.assertIn("ios_runtime_changed=true\n", output.getvalue())

    def test_cli_reports_owned_non_runtime_changes_without_xcode_impact(self):
        output = io.StringIO()
        with redirect_stdout(output):
            result = ios_ci_scope.main(
                ["apps/ios/README.md", "docs/releases/ios/1.0.0.md"]
            )
        self.assertEqual(result, 0)
        self.assertIn("ios_runtime_changed=false\n", output.getvalue())
        self.assertTrue(output.getvalue().endswith("ios_changed=true\n"))

    def test_forced_manual_run_is_ios_relevant(self):
        output = io.StringIO()
        with redirect_stdout(output):
            result = ios_ci_scope.main(["--force", "true"])
        self.assertEqual(result, 0)
        self.assertTrue(output.getvalue().endswith("ios_changed=true\n"))

    @patch.object(ios_ci_scope.subprocess, "run")
    def test_changed_paths_use_merge_base_semantics(self, run):
        run.return_value.stdout = "apps/ios/App/ZenbuJapaneseApp.swift\n"
        self.assertEqual(
            ios_ci_scope.changed_paths("base-sha", "head-sha"),
            ["apps/ios/App/ZenbuJapaneseApp.swift"],
        )
        run.assert_called_once_with(
            ["git", "diff", "--name-only", "base-sha...head-sha"],
            check=True,
            capture_output=True,
            text=True,
        )


if __name__ == "__main__":
    unittest.main()
