import json
import sqlite3
import unittest

from contract_checks import CATALOG, GENERATED, RESOURCES, artifact_metadata, sha256

RANKED_LISTS = RESOURCES / "RankedLists.sqlite3"
RANKED_PACK_PREFIXES = ("zenbu.wikipedia.", "zenbu.jiten.")


class RankedListsContractTests(unittest.TestCase):
    def test_ranked_lists_hold_each_downloadable_rank_pack_as_its_manifest_pins_it(self) -> None:
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        pinned = {
            pack["packID"]: (pack["packVersion"], pack["mappingSHA256"], pack["mappedRows"])
            for pack in catalog["packs"]
            if pack["packID"].startswith(RANKED_PACK_PREFIXES)
        }
        database = sqlite3.connect(f"file:{RANKED_LISTS}?mode=ro", uri=True)
        try:
            recorded = {
                pack_id: (version, mapping, rows)
                for pack_id, version, mapping, rows in database.execute(
                    "SELECT pack_id, pack_version, mapping_sha256, mapped_rows FROM ranked_lists"
                )
            }
            counted = dict(
                database.execute(
                    "SELECT l.pack_id, count(*) FROM ranked_evidence e "
                    "JOIN ranked_lists l USING (list_id) GROUP BY l.pack_id"
                )
            )
        finally:
            database.close()
        self.assertEqual(pinned, recorded)
        self.assertEqual({pack_id: rows for pack_id, (_, _, rows) in pinned.items()}, counted)

    def test_ranked_lists_match_the_bundled_language_data_and_their_import_report(self) -> None:
        metadata = artifact_metadata(RANKED_LISTS)
        self.assertEqual("zenbu.ranked-lists.v1", metadata["artifact_schema"])
        self.assertEqual(
            sha256(RESOURCES / "LanguageReferenceData.sqlite3"), metadata["language_data_sha256"]
        )
        report = json.loads((GENERATED / "RankedLists.import.json").read_text(encoding="utf-8"))
        self.assertEqual(sha256(RANKED_LISTS), report["artifactSHA256"])


if __name__ == "__main__":
    unittest.main()
