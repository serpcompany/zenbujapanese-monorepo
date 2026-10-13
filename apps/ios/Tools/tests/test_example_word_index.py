import sys
import unittest
from collections import Counter, defaultdict

from contract_checks import ROOT

sys.path.insert(0, str(ROOT / "apps/ios/Tools"))
import import_example_word_index as importer

NIGHT, NIGHTS, EVENING = b"\x01", b"\x02", b"\x03"
PAIRS = 10_000


def entries_writing(form: str, readings: dict[bytes, str], common: set[bytes]):
    return importer.Entries(
        by_sequence={},
        kana_headword=set(),
        common=common,
        headwords={entry: form for entry in readings},
        by_form={form: set(readings)},
        readings=defaultdict(set, {entry: {reading} for entry, reading in readings.items()}),
        primary_written={entry: form for entry in readings},
        fingerprint={entry: entry for entry in readings},
        siblings={entry: [entry] for entry in readings},
        listed={entry: entry for entry in readings},
    )


def kept(found: dict[bytes, int], with_word: int, with_entry: dict[bytes, int], meant=None):
    return importer.kept_entries(Counter(found), with_word, Counter(with_entry), PAIRS, meant or {})


class EnglishWordsTests(unittest.TestCase):
    def test_a_sentence_has_the_words_the_core_reads_in_a_query(self) -> None:
        self.assertEqual(
            importer.english_words("Where's the well-known bathroom? The BATHROOM, no. 2!"),
            {"where's", "the", "well-known", "bathroom", "no", "2"},
        )

    def test_full_width_letters_are_the_words_they_spell(self) -> None:
        self.assertEqual(importer.english_words("Ｄｏｇ　ＤＡＹＳ"), {"dog", "days"})

    def test_a_typographic_apostrophe_ends_a_word_as_it_does_in_the_core(self) -> None:
        self.assertEqual(importer.english_words("It’s a pen."), {"it", "s", "a", "pen"})


class NamesTests(unittest.TestCase):
    def test_a_word_capitalized_wherever_it_does_not_start_a_sentence_is_a_name(self) -> None:
        sentences = [
            "I met Tony in New York.",
            "New shoes hurt, so he bought new ones in York.",
            "Here I am.",
        ]
        self.assertEqual(importer.names_in(sentences), {"tony", "york", "i"})

    def test_a_word_that_starts_a_sentence_says_nothing_wherever_the_sentence_starts(self) -> None:
        sentences = ["Hello there.", "She said no. Hello again!", 'He asked, "Hello?"', "‘Hello,’ I said."]
        self.assertEqual(importer.names_in(sentences), {"i"})

    def test_a_word_written_small_once_is_no_name(self) -> None:
        self.assertEqual(importer.names_in(["We love Japan.", "It is japan, the lacquer."]), set())

    def test_full_width_capitals_are_capitals(self) -> None:
        self.assertEqual(importer.names_in(["We watch ＴＶ."]), {"tv"})


class MentionedWordsTests(unittest.TestCase):
    def test_a_gloss_mentions_each_word_in_it_whatever_is_joined_to_it(self) -> None:
        for gloss, words in {
            "new york": {"new", "york"},
            "mt. fuji": {"mt", "fuji"},
            "fuji-san": {"fuji", "san", "fuji-san"},
            "driver's license": {"driver", "s", "license", "driver's"},
        }.items():
            with self.subTest(gloss):
                self.assertEqual(importer.mentioned_words(gloss), words)

    def test_a_gloss_mentions_a_name_written_with_long_vowel_marks(self) -> None:
        self.assertIn("kyushu", importer.mentioned_words("kyūshū (southernmost main island)"))


class MeantWordsTests(unittest.TestCase):
    def test_a_gloss_means_the_word_it_is_with_or_without_to_and_closing_notes(self) -> None:
        for gloss, words in {
            "pen": {"pen"},
            "to have": {"have"},
            "meat (for consumption)": {"meat"},
            "to open (a door, etc.)": {"open"},
            "dog (canis (lupus) familiaris)": {"dog"},
            "how (incredible, strongly, badly, etc.) (after a question word)": {"how"},
            "to": {"to"},
            "to (somewhere)": {"to"},
        }.items():
            with self.subTest(gloss):
                self.assertEqual(importer.meant_words(gloss), words)

    def test_a_gloss_of_several_words_or_with_a_note_inside_means_no_one_word(self) -> None:
        for gloss in (
            "railway station",
            "ice cream",
            "to go out",
            "(not) ever",
            "meat (for consumption) or flesh",
            "pen (unclosed",
            "u.s.",
        ):
            with self.subTest(gloss):
                self.assertEqual(importer.meant_words(gloss), set())


class ResolutionTests(unittest.TestCase):
    def token(self, text: str):
        return importer.TOKEN_PATTERN.match(text)

    def test_a_written_form_two_entries_share_names_the_one_common_entry(self) -> None:
        entries = entries_writing("夜", {NIGHT: "よる", NIGHTS: "や"}, common={NIGHT})
        self.assertIsNone(importer.resolve(self.token("夜"), entries))
        self.assertEqual(importer.common_entry(self.token("夜"), entries), NIGHT)
        self.assertEqual(importer.resolve(self.token("夜(や)"), entries), NIGHTS)

    def test_a_written_form_names_no_entry_when_two_are_common_or_none_is(self) -> None:
        both = entries_writing("年", {NIGHT: "とし", NIGHTS: "ねん"}, common={NIGHT, NIGHTS})
        neither = entries_writing("年", {NIGHT: "とし", NIGHTS: "ねん"}, common=set())
        self.assertIsNone(importer.common_entry(self.token("年"), both))
        self.assertIsNone(importer.common_entry(self.token("年"), neither))

    def test_bare_kana_two_entries_share_still_names_neither(self) -> None:
        entries = entries_writing("そう", {NIGHT: "そう", NIGHTS: "そう"}, common={NIGHT})
        self.assertIsNone(importer.resolve(self.token("そう"), entries))
        self.assertIsNone(importer.common_entry(self.token("そう"), entries))


class KeptEntriesTests(unittest.TestCase):
    def test_a_first_meaning_is_kept_from_a_tenth_of_the_words_pairs(self) -> None:
        meant = {NIGHT: 0}
        self.assertEqual(kept({NIGHT: 10}, 100, {NIGHT: 40}, meant), [(NIGHT, 10)])
        self.assertEqual(kept({NIGHT: 9}, 100, {NIGHT: 40}, meant), [])
        self.assertEqual(kept({NIGHT: 19}, 200, {NIGHT: 40}, meant), [])

    def test_an_entry_that_comes_with_the_word_no_oftener_than_chance_is_not_kept(self) -> None:
        the = 3_600
        everywhere = {NIGHT: 6_800}
        self.assertEqual(kept({NIGHT: 2_600}, the, everywhere, {NIGHT: 0}), [])
        self.assertEqual(kept({NIGHT: 2_600}, the, everywhere), [])
        self.assertEqual(kept({NIGHT: 900}, the, {NIGHT: 900}, {NIGHT: 0}), [])

    def test_a_meaning_that_mostly_comes_with_other_words_is_not_kept(self) -> None:
        self.assertEqual(kept({NIGHT: 12}, 100, {NIGHT: 300}, {NIGHT: 0}), [])
        self.assertEqual(kept({NIGHT: 12}, 100, {NIGHT: 280}, {NIGHT: 0}), [(NIGHT, 12)])

    def test_the_first_meaning_used_most_leads_whatever_its_score(self) -> None:
        found = {NIGHT: 40, NIGHTS: 30, EVENING: 90}
        with_entry = {NIGHT: 400, NIGHTS: 30, EVENING: 90}
        self.assertEqual(
            kept(found, 100, with_entry, {NIGHT: 0, NIGHTS: 0}),
            [(NIGHT, 40), (NIGHTS, 30)],
        )

    def test_an_entry_that_is_no_first_meaning_is_kept_only_where_none_is_used(self) -> None:
        found = {NIGHT: 4, NIGHTS: 30, EVENING: 60}
        with_entry = {NIGHT: 4, NIGHTS: 60, EVENING: 90}
        meant = {NIGHT: 0, NIGHTS: 2}
        self.assertEqual(kept(found, 100, with_entry, meant), [(NIGHTS, 30), (EVENING, 60)])
        self.assertEqual(kept({**found, NIGHT: 5}, 100, with_entry, meant), [])

    def test_an_entry_that_does_not_mean_the_word_needs_a_third_of_its_pairs_and_a_score(
        self,
    ) -> None:
        self.assertEqual(kept({EVENING: 34}, 100, {EVENING: 200}), [(EVENING, 34)])
        self.assertEqual(kept({EVENING: 33}, 100, {EVENING: 200}), [])
        self.assertEqual(kept({EVENING: 34}, 100, {EVENING: 400}), [])

    def test_entries_that_do_not_mean_the_word_are_in_score_order(self) -> None:
        found = {NIGHT: 60, EVENING: 40}
        self.assertEqual(
            kept(found, 100, {NIGHT: 700, EVENING: 50}), [(EVENING, 40), (NIGHT, 60)]
        )

    def test_a_word_keeps_its_three_best_entries(self) -> None:
        found = {bytes([value]): 20 + value for value in range(5)}
        listed = kept(found, 100, dict(found), {entry: 0 for entry in found})
        self.assertEqual([both for _, both in listed], [24, 23, 22])


class WordEntryRowsTests(unittest.TestCase):
    evening = ("evening", 0, EVENING, 28, 28, 28, None)
    night = ("night", 0, NIGHT, 12, 12, 12, 1)

    def setUp(self) -> None:
        self.pair_entries: dict[bytes, set[bytes]] = {}
        self.pair_words: dict[bytes, set[str]] = {}
        for number in range(200):
            pair = number.to_bytes(2, "big")
            if number < 12:
                self.pair_entries[pair], self.pair_words[pair] = {NIGHT}, {"night"}
            elif number < 40:
                self.pair_entries[pair], self.pair_words[pair] = {EVENING}, {"evening", "the"}
            else:
                self.pair_entries[pair], self.pair_words[pair] = {NIGHTS}, {"the"}
        self.pair_words[bytes(2)] = {"night", "rare"}

    def rows(self, names: dict[str, set[bytes]]) -> list[tuple]:
        meanings = {"night": {NIGHT: 1}}
        return importer.word_entry_rows(self.pair_entries, self.pair_words, meanings, names)

    def test_each_word_lists_its_entries_with_the_pairs_they_were_counted_in(self) -> None:
        self.assertEqual(self.rows(names={}), [self.evening, self.night])

    def test_a_name_keeps_only_an_entry_that_means_it_or_mentions_it(self) -> None:
        self.assertEqual(self.rows(names={"evening": set(), "night": set()}), [self.night])
        self.assertEqual(self.rows(names={"evening": {EVENING}}), [self.evening, self.night])


if __name__ == "__main__":
    unittest.main()
