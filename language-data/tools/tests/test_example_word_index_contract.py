import unittest

from contract_checks import GENERATED, RESOURCES, SOURCES, assert_built_from_its_source

(SOURCE_RECORD,) = SOURCES.glob("Tatoeba-jpn-indices-*.source.json")


class ExampleWordIndexContractTests(unittest.TestCase):
    def test_word_index_matches_the_bundled_language_data_and_its_import_report(self) -> None:
        assert_built_from_its_source(
            self,
            RESOURCES / "ExampleWordIndex.sqlite3",
            "zenbu.example-word-index.v1",
            SOURCE_RECORD,
            GENERATED / SOURCE_RECORD.name.replace(".source.json", ".import.json"),
        )


if __name__ == "__main__":
    unittest.main()
