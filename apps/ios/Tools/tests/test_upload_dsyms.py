import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import upload_dsyms

TOKEN = "sntrys_test-token-not-real"


class Runner:
    def __init__(self, keychain: str = "", keychain_status: int = 0, upload_status: int = 0):
        self.keychain = keychain
        self.keychain_status = keychain_status
        self.upload_status = upload_status
        self.calls: list[tuple[list[str], dict]] = []

    def __call__(self, command: list[str], **options) -> subprocess.CompletedProcess:
        self.calls.append((command, options))
        if command[0] == "security":
            return subprocess.CompletedProcess(command, self.keychain_status, self.keychain, "")
        return subprocess.CompletedProcess(
            command, self.upload_status, "", f"error: unauthorized for {TOKEN}"
        )

    def uploads(self) -> list[tuple[list[str], dict]]:
        return [call for call in self.calls if call[0][0] == "npx"]


class UploadDSYMsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.archive = Path(self.folder.name) / "Zenbu Japanese.xcarchive"
        (self.archive / "dSYMs" / "Zenbu Japanese.app.dSYM").mkdir(parents=True)

    def tearDown(self) -> None:
        self.folder.cleanup()

    def upload(self, runner: Runner, environ: dict) -> tuple[bool, str]:
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors), contextlib.redirect_stdout(io.StringIO()):
            uploaded = upload_dsyms.upload(self.archive, environ, runner)
        return uploaded, errors.getvalue()

    def test_uploads_the_archives_dsyms_to_the_apps_project_with_a_pinned_cli(self) -> None:
        runner = Runner()
        uploaded, _ = self.upload(runner, {"SENTRY_AUTH_TOKEN": TOKEN})
        self.assertTrue(uploaded)
        [(command, options)] = runner.uploads()
        self.assertEqual(command[:3], ["npx", "--yes", "@sentry/cli@3.8.0"])
        self.assertEqual(command[-5:], ["--org", "serpcompany", "--project", "zenbujapanese-ios", str(self.archive / "dSYMs" / "Zenbu Japanese.app.dSYM")])
        self.assertEqual(options["env"]["SENTRY_AUTH_TOKEN"], TOKEN)
        self.assertNotIn(TOKEN, " ".join(command))

    def test_reads_the_token_from_the_login_keychain_when_the_shell_has_none(self) -> None:
        runner = Runner(keychain=f"{TOKEN}\n")
        uploaded, _ = self.upload(runner, {"SENTRY_AUTH_TOKEN": " "})
        self.assertTrue(uploaded)
        keychain_command = runner.calls[0][0]
        self.assertEqual(keychain_command[:4], ["security", "find-generic-password", "-s", "zenbu-sentry-auth-token"])
        self.assertEqual(keychain_command[-1], str(upload_dsyms.KEYCHAIN))
        self.assertEqual(runner.uploads()[0][1]["env"]["SENTRY_AUTH_TOKEN"], TOKEN)

    def test_a_missing_token_warns_and_uploads_nothing(self) -> None:
        runner = Runner(keychain_status=44)
        uploaded, errors = self.upload(runner, {})
        self.assertFalse(uploaded)
        self.assertEqual(runner.uploads(), [])
        self.assertIn("warning: no Sentry token", errors)

    def test_a_failed_upload_is_a_warning_that_never_shows_the_token(self) -> None:
        runner = Runner(upload_status=1)
        uploaded, errors = self.upload(runner, {"SENTRY_AUTH_TOKEN": TOKEN})
        self.assertFalse(uploaded)
        self.assertIn("warning:", errors)
        self.assertNotIn(TOKEN, errors)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(upload_dsyms.main([str(Path(self.folder.name) / "missing.xcarchive")]), 0)

    def test_an_archive_without_dsyms_warns(self) -> None:
        (self.archive / "dSYMs" / "Zenbu Japanese.app.dSYM").rmdir()
        runner = Runner()
        uploaded, errors = self.upload(runner, {"SENTRY_AUTH_TOKEN": TOKEN})
        self.assertFalse(uploaded)
        self.assertEqual(runner.calls, [])
        self.assertIn("holds no dSYMs", errors)

    def test_a_builds_products_folder_uploads_its_dsyms(self) -> None:
        products = Path(self.folder.name) / "Release-iphonesimulator"
        (products / "Zenbu Japanese.app.dSYM").mkdir(parents=True)
        self.archive = products
        runner = Runner()
        uploaded, _ = self.upload(runner, {"SENTRY_AUTH_TOKEN": TOKEN})
        self.assertTrue(uploaded)
        self.assertEqual(runner.uploads()[0][0][-1], str(products / "Zenbu Japanese.app.dSYM"))

    def test_needs_exactly_one_archive(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(upload_dsyms.main([]), 2)


if __name__ == "__main__":
    unittest.main()
