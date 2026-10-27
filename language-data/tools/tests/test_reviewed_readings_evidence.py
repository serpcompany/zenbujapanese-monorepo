from __future__ import annotations

import copy
import sys
import tempfile
import unittest
from pathlib import Path

from contract_checks import ROOT, unidic_archive

sys.path.insert(0, str(ROOT / "language-data/tools"))
from review_tubelex_readings import EXCERPT, UNIDIC, Listed, computed, evidence_review, listed, problems, scope
from tubelex_reading_evidence import write_excerpt


class ReviewedReadingsEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        folder = tempfile.TemporaryDirectory()
        cls.addClassCleanup(folder.cleanup)
        cls.listing = listed()
        cls.ranks = [row["rank"] for row in cls.listing.review["rows"]]
        review = evidence_review(cls.listing, unidic_archive(EXCERPT, Path(folder.name)))
        cls.found = computed(cls.listing, review, cls.ranks)

    def test_every_rows_evidence_and_verdict_are_what_the_tool_computes_from_the_pinned_sources(self) -> None:
        self.assertEqual([], problems(self.listing, self.found))

    def test_the_review_leaves_out_by_judgment_only_three_rows_the_rule_passes(self) -> None:
        passed = [row for row in self.listing.review["rows"] if self.found[row["rank"]]["verdict"]["rule"] == "rank"]
        self.assertEqual(89, len(passed))
        self.assertEqual(["刃", "空", "開く"], sorted(row["form"] for row in passed if not row["reading"]))

    def test_keeping_a_row_the_rule_fails_is_a_problem(self) -> None:
        review = copy.deepcopy(self.listing.review)
        next(row for row in review["rows"] if row["form"] == "後").update(reading="あと", entry=1269320)
        found = problems(Listed(self.listing.manifest, self.listing.rows, self.listing.path, review), self.found)
        self.assertEqual(["後 (名詞-普通名詞-副詞可能, row 69) keeps あと (JMdict 1269320), which the rule doesn't rank"], found)

    def test_a_listed_row_that_is_no_longer_unplaced_is_a_problem(self) -> None:
        found = {rank: row for rank, row in self.found.items() if rank != 69}
        self.assertEqual(["後 (名詞-普通名詞-副詞可能, row 69) is no longer an unplaced row"], problems(self.listing, found))

    @unittest.skipUnless(UNIDIC.is_file(), "needs all of UniDic, which the rebuild downloads")
    def test_all_of_unidic_gives_the_same_evidence_the_unplaced_rows_and_the_excerpt(self) -> None:
        review = evidence_review(self.listing, UNIDIC)
        self.assertEqual(self.found, computed(self.listing, review, self.ranks))
        with tempfile.TemporaryDirectory() as folder:
            excerpt = Path(folder) / EXCERPT.name
            write_excerpt(UNIDIC, review.lexicon, excerpt)
            self.assertEqual(EXCERPT.read_bytes(), excerpt.read_bytes())
        self.assertEqual(self.ranks, scope(self.listing, UNIDIC))


if __name__ == "__main__":
    unittest.main()
