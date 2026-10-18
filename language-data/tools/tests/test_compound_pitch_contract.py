import unittest

from contract_checks import GENERATED, RESOURCES, SOURCES, assert_built_from_its_source


class CompoundPitchContractTests(unittest.TestCase):
    def test_compound_pitch_matches_the_bundled_language_data_and_its_import_report(self) -> None:
        assert_built_from_its_source(
            self,
            RESOURCES / "CompoundPitch.sqlite3",
            "zenbu.compound-pitch.v1",
            SOURCES / "UniDic-CWJ-3.1.0.source.json",
            GENERATED / "UniDic-CWJ-3.1.0-compound-pitch.import.json",
        )


if __name__ == "__main__":
    unittest.main()
