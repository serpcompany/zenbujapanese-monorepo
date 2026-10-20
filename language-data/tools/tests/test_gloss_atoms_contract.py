import sqlite3
import unittest

from contract_checks import RESOURCES

PAIRED_BY_POSITION = (
    "The app (LookupDatabase.glosses(ofEntriesEquivalentTo:)) and the dictionary service's "
    "conformance support pair each sense in senses_json with the gloss_atoms whose sense_order is "
    "its position. jmdict_entries.py numbers every <sense> but leaves a sense with no English gloss "
    "out of senses_json, so such a sense would hand the next sense's glosses to the one before it. "
    "Number only the senses senses_json keeps, or key the glosses some other way, before releasing "
    "these entries."
)


class GlossAtomsContractTests(unittest.TestCase):
    def test_each_entrys_sense_orders_are_the_positions_of_its_stored_senses(self) -> None:
        database = sqlite3.connect(
            f"file:{RESOURCES / 'LanguageReferenceData.sqlite3'}?mode=ro", uri=True
        )
        try:
            entries, drifted = database.execute(
                """
                WITH senses AS (
                  SELECT entry_id, count(DISTINCT sense_order) AS count,
                    min(sense_order) AS first, max(sense_order) AS last
                  FROM gloss_atoms GROUP BY entry_id
                )
                SELECT count(*), json_group_array(entries.source_record_id) FILTER (
                  WHERE senses.entry_id IS NULL OR senses.first != 0
                    OR senses.last != senses.count - 1
                    OR senses.count != json_array_length(entries.senses_json)
                )
                FROM entries LEFT JOIN senses ON senses.entry_id = entries.id
                """
            ).fetchone()
        finally:
            database.close()
        self.assertGreater(entries, 0)
        self.assertEqual("[]", drifted, PAIRED_BY_POSITION)


if __name__ == "__main__":
    unittest.main()
