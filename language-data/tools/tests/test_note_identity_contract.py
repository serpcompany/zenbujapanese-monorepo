import hashlib
import sqlite3
import unittest

from contract_checks import RESOURCES

RELEASED_ENTRIES = 218_948
RELEASED_NOTE_IDENTITIES = (
    "eccaf3e7e4dff071c9fb2bd48079ec07433597dc8615fe0519e34f8b3b91c9e4"
)
KEEP_THEM = (
    "Every entry keeps the note_identity that 1.0.0 to 2.0.0 saved notes and photos under: the app "
    "reads it to move those to the word's Language Reference ID, and a learner can update from any "
    "of them. A rebuild writes each existing entry's note_identity from the previous database "
    "(language-data/tools/README.md, Refresh a source snapshot) and is pinned again here only once "
    "every earlier entry's value is unchanged."
)


class NoteIdentityContractTests(unittest.TestCase):
    def test_every_entry_keeps_the_note_identity_released_versions_saved_notes_under(
        self,
    ) -> None:
        database = sqlite3.connect(
            f"file:{RESOURCES / 'LanguageReferenceData.sqlite3'}?mode=ro", uri=True
        )
        digest = hashlib.sha256()
        entries = 0
        try:
            rows = database.execute(
                "SELECT lower(hex(id)), note_identity FROM entries ORDER BY id"
            )
            for entry_id, identity in rows:
                digest.update(f"{entry_id} {identity}\n".encode())
                entries += 1
        finally:
            database.close()
        self.assertEqual(
            (entries, digest.hexdigest()),
            (RELEASED_ENTRIES, RELEASED_NOTE_IDENTITIES),
            KEEP_THEM,
        )


if __name__ == "__main__":
    unittest.main()
