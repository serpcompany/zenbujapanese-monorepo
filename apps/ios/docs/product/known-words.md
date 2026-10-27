# Known Words and Learning

How a learner marks a word or kanji Unknown, Learning, or Known, and the two Account screens that
list the Known and the Learning ones. Look Up filters its results to each state
([Sorting and filtering results](results.md#filtering-results)), and Reading Aids treat a word being
learned as not known ([Reading Aids](reading-aids.md)).

## Marking a word

A word or kanji is Unknown, Learning, or Known, one at a time, and Unknown until marked. **Status**
in its page's **•••** menu and in a row's context menu picks one, with the current one checked; a
row's right swipe offers the other two, in the order Unknown, Known (green), Learning (yellow).
Known shows a green **✓ Known** tag and Learning a yellow **◐ Learning** one, wherever a word's tag
shows: Look Up's results, a word's or kanji's page, Known Words, Learning, and lists. VoiceOver
reads a result row being learned as Learning, as it reads a known one as Known. In light mode the
Learning tag's yellow is darkened so its words read at 4.5 to 1.

Check: package `WordStatusTests` (one state at a time, each state's tag, and the other two offered
in one order), `WordStatusTagContrastTests`, and `WordKnowledgeTests`; UI `LearningUITests` (the
tag on a word's page, **Status**, and a result's swipe),
`WordDetailUITests.testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown`,
`SavedWordsUITests.testAKanjiIsMarkedKnownFromItsMenu`, and
`SearchUITests.testMarkingAResultKnownShowsTheKnownCapsule`.

## Known Words and Learning

Known Words and **Learning** show their counts on their Account rows and list every word and kanji
in that state, most recent first, with no dates: Look Up's result rows, with meanings and the tag,
and its Kanji rows. A word the dictionary dropped keeps its headword, reading, and tag. A learner
can search either by headword or reading, change a row's state by a right swipe or its context
menu, or open its page in Look Up. A word whose entry ID changed opens the entry written and read
the same, else searches its headword.

States stay on the device and sync through the Zenbu account while signed in
([Zenbu account and sync](account-sync.md)). An earlier version's known words load unchanged. An
account service that can't take Learning yet keeps the device's states: Known and Unknown go as it
takes them, and Learning is sent again at a later launch, while the word is still Learning. If the
states came from a newer Zenbu, or a damaged file couldn't be kept aside, they are shown but can't
be changed: both screens say so, and each swipe and menu, a page's too, offer only a disabled Known
Words Can't Be Changed. If the file can't be read at launch, as before the first unlock, nothing is
shown or saved over it, and both screens ask to reopen Zenbu.

Check: package `WordKnowledgeTests` (and the disabled choice), `WordStatusTests` (a reload, and an
earlier version's known words and saved changes), `AccountSyncLearningTests` (Learning both ways, a
refused change undone, and an account that can't take it yet), `SavedKanjiTests`,
`KnowledgeRowsTests`, and `WordResolutionTests` (the entry a saved word opens); UI
`LearningUITests.testAWordMarkedLearningFromItsPageIsTaggedAndListedUnderLearningUntilItsKnown`,
`SavedWordsUITests` (Look Up's rows and chips, opened and marked unknown there), and
`AccountUITests.testKnownWordsAndTheMediaLibraryStartEmptyAndListsStartWithFavorites` (empty).
