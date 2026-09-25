from __future__ import annotations

import argparse
import sys
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import finalize_jpdb_pipeline  # noqa: E402


class FinalizeJPDBPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.arguments = argparse.Namespace(
            mysql_binary="mysql",
            mysql_arg=["--login-path=fixture"],
            mysql_database="zenbu_jpdb",
        )
        self.manifest = {
            "snapshotSHA256": "aa" * 32,
            "artifactManifestSHA256": "bb" * 32,
            "artifactSHA256": "cc" * 32,
            "authorizationSHA256": "dd" * 32,
            "tables": {
                "extracted_documents": {
                    "rows": 1,
                    "sha256": "11" * 32,
                    "target": "jpdb_extracted_documents",
                },
                "vocabulary": {
                    "rows": 2,
                    "sha256": "22" * 32,
                    "target": "jpdb_vocabulary",
                },
            },
        }

    def query(self, _: argparse.Namespace, sql: str) -> str:
        if "FROM jpdb_current_snapshot" in sql:
            return (
                f"7\t{'aa' * 32}\t{'bb' * 32}\t{'cc' * 32}\t{'dd' * 32}"
                "\tpublished\t2026-09-25T00:00:00.000000Z\t2026-09-25T00:00:01.000000Z"
            )
        if "FROM jpdb_snapshot_table_manifests" in sql:
            return f"extracted_documents\t1\t{'11' * 32}\nvocabulary\t2\t{'22' * 32}"
        if "COUNT(DISTINCT extracted_document_sha)" in sql:
            return "extracted_documents\t1\nvocabulary\t2"
        raise AssertionError(sql)

    def test_publication_state_verifies_pointer_manifests_and_actual_counts(self) -> None:
        state = finalize_jpdb_pipeline.mysql_publication_state(
            self.arguments, self.manifest, query=self.query
        )
        self.assertEqual(7, state["snapshotID"])
        self.assertEqual("published", state["state"])
        self.assertEqual({"extracted_documents": 1, "vocabulary": 2}, state["tableCounts"])

    def test_second_identical_load_must_leave_state_unchanged(self) -> None:
        commands: list[list[str]] = []
        state = {"snapshotID": 7, "tableCounts": {"vocabulary": 2}}
        result = finalize_jpdb_pipeline.load_mysql_twice_and_verify(
            ["load"],
            self.arguments,
            self.manifest,
            runner=commands.append,
            state_reader=lambda _arguments, _manifest: dict(state),
        )
        self.assertEqual([["load"], ["load"]], commands)
        self.assertTrue(result["unchangedAfterSecondLoad"])
        self.assertEqual(2, result["loadAttempts"])

    def test_second_load_change_fails_finalization(self) -> None:
        states = iter(
            [
                {"snapshotID": 7, "tableCounts": {"vocabulary": 2}},
                {"snapshotID": 7, "tableCounts": {"vocabulary": 3}},
            ]
        )
        with self.assertRaisesRegex(ValueError, "second identical"):
            finalize_jpdb_pipeline.load_mysql_twice_and_verify(
                ["load"],
                self.arguments,
                self.manifest,
                runner=lambda _: None,
                state_reader=lambda _arguments, _manifest: next(states),
            )

    def test_manifest_or_actual_count_mismatch_fails(self) -> None:
        def mismatched_query(arguments: argparse.Namespace, sql: str) -> str:
            output = self.query(arguments, sql)
            return output.replace("vocabulary\t2", "vocabulary\t3")

        with self.assertRaisesRegex(ValueError, "manifests do not match|row counts"):
            finalize_jpdb_pipeline.mysql_publication_state(
                self.arguments, self.manifest, query=mismatched_query
            )


if __name__ == "__main__":
    unittest.main()
