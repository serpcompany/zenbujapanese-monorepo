import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from apps.ios.Tools.prepare_sudachi_core import PreparationError, prepare


class PrepareSudachiCoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "official.whl"
        self.dictionary = b"independently-known-dictionary"
        with zipfile.ZipFile(self.source, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("package/resources/system.dic", self.dictionary)
            archive.writestr("package/unrelated.txt", b"not shipped")
        self.manifest = self.root / "catalog.json"
        self._write_manifest()

    def tearDown(self):
        self.temporary.cleanup()

    def _write_manifest(self, **overrides):
        pack = {
            "distribution": "bundledDefault",
            "downloadURL": self.source.as_uri(),
            "downloadBytes": self.source.stat().st_size,
            "downloadSHA256": self._sha256(self.source.read_bytes()),
            "archiveEntry": "package/resources/system.dic",
            "installedBytes": len(self.dictionary),
            "installedSHA256": self._sha256(self.dictionary),
            "bundledResource": "system_core",
            "bundledResourceExtension": "dic",
        }
        pack.update(overrides)
        self.manifest.write_text(json.dumps({"schemaVersion": 1, "packs": [pack]}))

    @staticmethod
    def _sha256(data):
        return hashlib.sha256(data).hexdigest()

    def test_prepares_only_verified_dictionary_and_reuses_cache_offline(self):
        cache = self.root / "cache"
        first_output = self.root / "first" / "system_core.dic"
        identity = prepare(self.manifest, cache, first_output)

        self.assertEqual(first_output.read_bytes(), self.dictionary)
        self.assertEqual(identity["source"], self._sha256(self.source.read_bytes()))
        self.assertEqual(identity["dictionary"], self._sha256(self.dictionary))
        self.assertEqual(
            identity["measured_peak_payload_bytes"],
            self.source.stat().st_size + (2 * len(self.dictionary)),
        )
        self.assertFalse((first_output.parent / "official.whl").exists())

        self.source.unlink()
        second_output = self.root / "second" / "system_core.dic"
        second_identity = prepare(self.manifest, cache, second_output)
        self.assertEqual(second_output.read_bytes(), self.dictionary)
        self.assertEqual(second_identity["source"], identity["source"])
        self.assertEqual(second_identity["dictionary"], identity["dictionary"])
        self.assertEqual(
            second_identity["dictionary_bytes"], identity["dictionary_bytes"]
        )
        self.assertEqual(second_identity["contract"], identity["contract"])

    def test_extracted_cache_identity_covers_the_complete_artifact_contract(self):
        first = prepare(self.manifest, self.root / "cache", None)
        self._write_manifest(archiveEntry="package/resources/alternate.dic")

        with self.assertRaisesRegex(
            PreparationError, "missing the pinned dictionary entry"
        ):
            prepare(self.manifest, self.root / "cache", None)

        contract_directories = list((self.root / "cache" / "contracts").iterdir())
        self.assertEqual(len(contract_directories), 2)
        self.assertIn(first["contract"], {item.name for item in contract_directories})

    def test_fails_closed_before_staging_wrong_source_bytes(self):
        self._write_manifest(downloadSHA256="0" * 64)
        output = self.root / "product" / "system_core.dic"

        with self.assertRaisesRegex(PreparationError, "wheel checksum"):
            prepare(self.manifest, self.root / "cache", output)

        self.assertFalse(output.exists())

    def test_fails_closed_before_staging_wrong_extracted_dictionary(self):
        self._write_manifest(installedSHA256="f" * 64)
        output = self.root / "product" / "system_core.dic"

        with self.assertRaisesRegex(PreparationError, "dictionary checksum"):
            prepare(self.manifest, self.root / "cache", output)

        self.assertFalse(output.exists())

    def test_offline_staging_requires_the_explicitly_prepared_cache(self):
        output = self.root / "product" / "system_core.dic"

        with self.assertRaisesRegex(PreparationError, "repository bootstrap"):
            prepare(
                self.manifest,
                self.root / "empty-cache",
                output,
                allow_network=False,
            )

        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
