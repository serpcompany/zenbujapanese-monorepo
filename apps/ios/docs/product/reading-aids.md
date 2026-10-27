# Reading Aids

Reading Aids are the app's switches for how Japanese reads, in Account → Reading Aids:

- Furigana, Romaji, and Hide Furigana on Known Words;
- Word Meanings (a short meaning under each linked word the learner hasn't marked known) and Kanji
  Meanings (under each kanji in Look Up's Grade panel); and
- Sentence Translations, with a translation language (English so far) and who translates Player
  captions — YouTube, or Apple Translation on the device, which Reading Aids offers to download.

They sync with the other settings ([Zenbu account and sync](account-sync.md)).

Check: UI `AccountUITests.testReadingAidsAndFrequencyDictionariesOpen` and
`testTurningRomajiOnWritesExampleSentencesAndAKanjisReadingsInRomaji` (Romaji on, an example
sentence and a kanji's reading written in it); package `PlayerReadingAidTests` and
`WordMeaningTests` (the preferences), and the recorded `RomajiConformanceTests` with core
`detail/romaji.test.ts` (how a reading and a sentence are written in romaji).

## The Show menus

A **Show** section ends the **•••** menu of a word and of a kanji, and opens Example Sentences' and
Player's: **Furigana**, **Furigana on Known Words** (Hide Furigana on Known Words turned around,
dimmed while Furigana is off), **Word Meanings**, and **Translations**. They are the same switches
as Reading Aids', so flipping one redraws the sentences already on screen and shows in Reading Aids.
On iPhone and iPad the menu stays open while they're flipped, and its other choices close it; the
Mac closes a menu on every choice. With Translations off, VoiceOver reads a word's example without
its English.

Check: UI `WordDetailUITests.testTheMenuTurnsReadingAidsOffForTheExamplesAndAccount` (Word Meanings,
Furigana, and Translations change an example, and Reading Aids shows them off),
`testAShowSwitchLeavesTheMenuOpenAndAnotherChoiceClosesIt`, and `testAKanjisMenuHasTheShowSwitches`;
`SearchResultsUITests.testExampleSentencesMenuHidesAndShowsTheirTranslations` and
`PlayerWatchUITests.testTheMenuHidesAndShowsACaptionsTranslation`; package `PlayerReadingAidTests`
(Furigana on Known Words turned around).
