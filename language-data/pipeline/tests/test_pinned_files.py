from __future__ import annotations

import io
import json
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import package
import pinned_files
from pinned_release import check_latest, check_pinned, load_pinned, pinned_path, write_pinned
from refusal import Refusal
from scratch_release import ScratchBuildTestCase


class PinnedTestCase(ScratchBuildTestCase):
    def setUp(self):
        super().setUp()
        self.manifest = self.scratch.build(self.out)
        write_pinned(self.scratch.releases, self.manifest)
        self.scratch.commit()

    def pinned(self) -> dict:
        return load_pinned(self.scratch.releases, "2026.10.1")

    def check(self) -> dict:
        return pinned_files.check_committed_pins(
            self.scratch.root, self.scratch.loaded_inputs(), self.pinned()
        )

    def refused(self, pattern: str) -> None:
        with self.assertRaisesRegex(Refusal, pattern):
            self.check()


class CommittedFilesTests(PinnedTestCase):
    def test_the_committed_files_match_the_release_they_were_pinned_from(self):
        self.assertEqual(self.check(), {"files": 9, "bundled": 10, "copied": 4})

    def test_a_changed_lfs_file_needs_a_new_pin(self):
        self.scratch.lfs["data/res/Pack.sqlite3"] += b"\0"
        self.scratch.commit()
        self.refused(r"Pack\.sqlite3: data/res/Pack\.sqlite3 is [0-9a-f]{64} \(\d+ bytes\) at HEAD")

    def test_a_changed_file_outside_git_lfs_needs_a_new_pin(self):
        self.scratch.plain["data/res/NOTICE.txt"] = b"another notice\n"
        self.scratch.commit()
        self.refused(r"Notices/NOTICE\.txt: data/res/NOTICE\.txt is .* at HEAD, but the pinned")

    def test_an_uncommitted_change_is_left_to_the_build(self):
        self.scratch.write("data/res/NOTICE.txt", b"edited\n")
        self.check()

    def test_a_file_the_app_bundles_is_a_release_file_or_named_as_not_released(self):
        self.scratch.plain["data/res/Extra.json"] = b"{}\n"
        self.scratch.commit()
        self.refused(r"the app bundles data/res/Extra\.json, which is neither a release file")

    def test_a_file_an_image_copies_from_a_root_is_a_release_file_or_named(self):
        self.scratch.plain["service/Dockerfile"] += (
            b"COPY data/src/README.md data/src/Wiki.tsv.xz /service/sources/\n"
        )
        self.scratch.commit()
        self.refused(
            r"service/Dockerfile copies data/src/README\.md, .*\n"
            r".*service/Dockerfile copies data/src/Wiki\.tsv\.xz, "
        )

    def test_an_image_copying_a_missing_file_is_refused(self):
        self.scratch.plain["service/Dockerfile"] += b"COPY data/res/Gone.json /service/\n"
        self.scratch.commit()
        self.refused(r"service/Dockerfile copies data/res/Gone\.json, which isn't committed")

    def test_not_released_names_only_committed_files_that_aren_t_released(self):
        self.scratch.inputs["not_released"] += [
            {"path": "res/Gone", "why": "removed"},
            {"path": "res/NOTICE.txt", "why": "a notice"},
        ]
        self.refused(r"not_released names data/res/Gone, which isn't committed")
        self.refused(r"not_released names data/res/NOTICE\.txt, which is a release file")

    def test_a_file_added_to_or_dropped_from_the_release_needs_a_new_pin(self):
        self.scratch.drop("Mapping.sql")
        self.scratch.inputs["not_released"].append({"path": "res/Mapping.sql", "why": "test"})
        self.refused(r"the pinned manifest names files release-inputs\.json doesn't: \['Mapping")

    def test_the_refusal_says_how_to_pin_the_release_again(self):
        self.scratch.plain["data/res/NOTICE.txt"] = b"another notice\n"
        self.scratch.commit()
        self.refused(r"bump language-data/release\.json, build the release, run package\.py pin")


class PinnedManifestTests(PinnedTestCase):
    def test_the_pin_leaves_out_what_depends_on_the_run_or_the_bucket(self):
        pinned = self.pinned()
        for field in (
            "git_commit",
            "workflow_run",
            "core_sha256",
            "core",
            "previous_release",
            "previous_manifest_sha256",
        ):
            self.assertNotIn(field, pinned)
        self.assertEqual(pinned["files"], self.manifest["files"])
        self.assertEqual(pinned["ids"], self.manifest["ids"])

    def test_a_build_from_another_commit_or_run_is_the_pinned_release(self):
        built = {
            **self.manifest,
            "git_commit": "f" * 40,
            "workflow_run": {"run_id": 1},
            "previous_release": "2026.09.1",
            "previous_manifest_sha256": "e" * 64,
            "core_sha256": "d" * 64,
            "core": {"bundle": {"sha256": "d" * 64}},
        }
        check_pinned(built, self.pinned(), "the build")

    def test_a_build_with_other_content_is_refused_naming_what_differs(self):
        built = json.loads(json.dumps(self.manifest))
        built["files"][2]["sha256"] = "0" * 64
        built["ids"]["ent_seq_count"] = 4
        with self.assertRaisesRegex(
            Refusal, r"in ids; files: Elements\.json \(sha256\)\. A release's content is pinned"
        ):
            check_pinned(built, self.pinned(), "the build")

    def test_a_reordered_build_is_refused(self):
        built = {**self.manifest, "files": list(reversed(self.manifest["files"]))}
        with self.assertRaisesRegex(Refusal, r"files: their order"):
            check_pinned(built, self.pinned(), "the build")

    def test_a_missing_pin_says_how_to_make_one(self):
        with self.assertRaisesRegex(Refusal, r"release 2026\.11\.1 has no pinned manifest"):
            load_pinned(self.scratch.releases, "2026.11.1")

    def test_a_pin_holding_run_fields_or_another_release_is_refused(self):
        path = pinned_path(self.scratch.releases, "2026.10.1")
        path.write_text(json.dumps({**self.pinned(), "git_commit": "f" * 40}))
        with self.assertRaisesRegex(Refusal, r"holds git_commit, which depend on the run"):
            self.pinned()
        path.write_text(json.dumps({**self.manifest, "release": "2026.11.1"}))
        with self.assertRaisesRegex(Refusal, r"pins release '2026\.11\.1', not 2026\.10\.1"):
            self.pinned()


class PinHistoryTests(PinnedTestCase):
    def setUp(self):
        super().setUp()
        self.base = self.scratch.git("rev-parse", "HEAD")
        self.path = pinned_path(self.scratch.releases, "2026.10.1")

    def unchanged(self) -> None:
        pinned_files.check_pins_unchanged(self.scratch.root, self.scratch.releases, self.base)

    def test_a_merged_pin_never_changes(self):
        self.path.write_text(json.dumps({**self.pinned(), "conformance": []}))
        self.scratch.commit()
        with self.assertRaisesRegex(
            Refusal,
            r"never changes once it's merged, but these differ from [0-9a-f]{40}: "
            r"language-data/releases/2026\.10\.1/manifest\.json\. Pin the new content",
        ):
            self.unchanged()

    def test_a_merged_pin_is_never_deleted(self):
        self.path.unlink()
        self.scratch.commit()
        with self.assertRaisesRegex(Refusal, r"releases/2026\.10\.1/manifest\.json"):
            self.unchanged()

    def test_a_new_release_is_pinned_beside_the_merged_ones(self):
        write_pinned(self.scratch.releases, {**self.manifest, "release": "2026.11.1"})
        self.scratch.commit()
        self.unchanged()
        check_latest(self.scratch.releases, "2026.11.1")

    def test_release_json_names_the_latest_pinned_release(self):
        write_pinned(self.scratch.releases, {**self.manifest, "release": "2026.11.1"})
        with self.assertRaisesRegex(
            Refusal, r"names 2026\.10\.1, but .* pins a later release, 2026\.11\.1"
        ):
            check_latest(self.scratch.releases, "2026.10.1")


class CommandLineTests(PinnedTestCase):
    def run_package(self, *argv: str) -> tuple[int, str, str]:
        release = self.scratch.root / "language-data" / "release.json"
        options = ["--repo", str(self.scratch.root), "--inputs", str(self.scratch.inputs_path())]
        options += ["--release", str(release)]
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            status = package.main([*options, *argv])
        return status, stdout.getvalue(), stderr.getvalue()

    def test_pin_then_check_pin_with_the_build(self):
        pinned_path(self.scratch.releases, "2026.10.1").unlink()
        status, stdout, _ = self.run_package("pin", str(self.out))
        self.assertEqual(status, 0)
        self.assertIn("Pinned release 2026.10.1", stdout)
        self.scratch.commit()
        status, stdout, stderr = self.run_package("check-pin", "--built", str(self.out))
        self.assertEqual((status, stderr), (0, ""))
        self.assertIn("9 release files, 10 files the app bundles", stdout)
        self.assertIn("is the pinned one", stdout)

    def test_check_pin_refuses_a_build_of_other_content(self):
        manifest = json.loads((self.out / "manifest.json").read_text())
        manifest["conformance"][0]["sha256"] = "0" * 64
        (self.out / "manifest.json").write_text(json.dumps(manifest))
        status, _, stderr = self.run_package("check-pin", "--built", str(self.out))
        self.assertEqual(status, 1)
        self.assertIn("pinned manifest in conformance", stderr)

    def test_check_pin_refuses_a_change_to_a_merged_pin(self):
        base = self.scratch.git("rev-parse", "HEAD")
        path = pinned_path(self.scratch.releases, "2026.10.1")
        path.write_text(json.dumps({**self.pinned(), "sources": []}))
        self.scratch.commit()
        self.assertEqual(self.run_package("check-pin")[0], 0)
        status, _, stderr = self.run_package("check-pin", "--base", base)
        self.assertEqual(status, 1)
        self.assertIn("a pinned release never changes once it's merged", stderr)

    def test_pin_refuses_a_build_of_another_release(self):
        self.scratch.write("language-data/release.json", b'{"release": "2026.11.1"}\n')
        status, _, stderr = self.run_package("pin", str(self.out))
        self.assertEqual(status, 1)
        self.assertIn("holds release 2026.10.1, not 2026.11.1", stderr)


class DockerfileTests(unittest.TestCase):
    def test_reads_every_copy_from_the_build_context(self):
        dockerfile = (
            "FROM node AS build\n"
            "COPY a.json b/ ./\n"
            "COPY --from=build /x /y\n"
            "COPY --chown=node \\\n  c/d.txt \\\n  e /z/\n"
            'ADD ["f g.txt", "/h/"]\n'
            "RUN echo COPY not/this\n"
        )
        self.assertEqual(
            pinned_files.copied_sources(dockerfile, "Dockerfile"),
            ["a.json", "b", "c/d.txt", "e", "f g.txt"],
        )

    def test_refuses_a_wildcard_it_cannot_check(self):
        with self.assertRaisesRegex(Refusal, r"copies res/\*\.json: a wildcard can't be checked"):
            pinned_files.copied_sources("COPY res/*.json /r/\n", "Dockerfile")


if __name__ == "__main__":
    unittest.main()
