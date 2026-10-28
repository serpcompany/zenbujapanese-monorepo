# Dictionary

Dictionary is the app's primary Product Experience. It appears as the **Look Up** tab and uses
bundled Language Reference Data so ordinary dictionary lookup works offline.

## Look Up

A learner can look up Japanese or English using:

- the keyboard;
- handwriting recognition, which reads the finished drawing's shape, so stroke order and
  direction don't matter;
- radical selection; or
- kanji by school grade ([Grade](#grade)).

Check: UI `SearchUITests.testAnEnglishSearchListsTheWordAndOpensItsDetail` (the keyboard) and
`SearchInputUITests` (a drawn stroke's kanji, and a radical's, looked up); package
`HandwritingRecognitionTests` (a drawn kanji is read whatever the stroke order) and
`RadicalLookupTests` (radicals narrow to the kanji that have them).

A query reads the same whatever its width or case (Ｎ as n, ｶﾞｷﾞ as ガギ, a voiced mark joined to
its kana), and white space of any kind, or the U+FEFF a paste can carry, only separates its words.

Check: package `DictionaryCoreTests` (a query normalized by the core, scalar for scalar); core
`search/query.test.ts` and `embedded/dictionary.test.ts`.

Image Search, for Japanese in a photo, is Translate's **Image** option
([Image Search](translate.md#image-search)).

Check: UI `SearchUITests` (Look Up has no camera button) and `ImageSearchUITests`.

### Top bar

Look Up's top bar is Player's: a small, centered **Look Up** title above the same search field,
with the prompt **Look up Japanese or English** (**Look Up** at the largest text sizes) and a clear
button while it has text.

- **Recent.** With nothing looked up, the title bar's **•••** menu offers **Clear Recent
  Lookups** while recent lookups are listed. The recent lookups are listed without a heading.
- **Input buttons.** Three round buttons, a pencil for **Handwriting**, a grid for **Radicals**, and
  a cap for **Grade**, sit at the bottom left on every Look Up screen: above the tab bar on Recent
  and results, and above the keyboard while typing. Each opens its panel in one tap.
- **Typing.** Tapping the field slides the screen up as Player's does: the title bar slides away,
  the field moves to the top, and an **X** appears beside it. The clear button inside the field
  clears the text.
- **Results.** Submitting, or picking a recent lookup, the reading refinement, or a handwriting
  candidate, a radical candidate, or a grade's kanji, puts the keyboard away and keeps the query in
  the field at the top, with **X** beside it. The first row of the results names the order and opens
  Sort and Filter ([Sorting results](results.md#sorting-results), [Filtering
  results](results.md#filtering-results)).
- **X** clears the query and returns to Recent.

On iPad, where the tabs sit at the top of the screen, nothing slides away: the title bar and the
tabs stay above the field while typing and beside the results, and there is no **X**. On the Mac
the field sits in the window's toolbar. On both, the clear button inside the field empties it and
returns to Recent ([iPad and Mac](index.md#ipad-and-mac)).

Check: UI `SearchUITests.testASearchKeepsItsQueryInTheFieldAndRunsAgainFromRecent` (the query kept
in the field, the input buttons beside the results (Grade's on iPhone only), back to Recent with
**X** on iPhone and the clear button on iPad and the Mac, and no heading),
`testTheFieldOffersCloseAndTheInputButtonsWhileTyping` (iPhone),
`testTheTabsStayBesideTheResultsWhichStayAcrossTabs`,
`SearchResultsUITests.testClearingRecentSearchesEmptiesTheList` (the **•••** menu), and
`LayoutUITests` (the field and the input buttons at every size the device offers). How the bar
slides on iPhone is by hand ([Look Up manual
checks](../../../../docs/agents/ios.md#look-up-manual-checks)).

### Handwriting and Radicals

Tapping the pencil, the grid, or the cap slides up a full-height sheet over the field and the tab
bar, with a grabber at the top: drag it down to close it. Drawing on the pad never drags the sheet.
The same three buttons stay at its bottom left, in the same place as on Look Up's screen, with the
current one highlighted, so another mode is one tap away. The panels share one gray background, flat
candidate tiles in the same fill as the radical squares, and glass buttons (white in light mode).

- **Handwriting.** A white drawing pad sits at the top, with candidate tiles below it: five to a row
  (three at the largest text sizes), each with the kanji's first meaning. Three rows show and more
  scroll. **Undo**, at the bottom right, removes the last stroke and recognizes the rest again.
  Before there are candidates, text shows under the pad only while recognizing, when nothing
  matches, or when recognition fails.
- **Radicals.** A white strip at the top lists the kanji that contain every selected radical, or
  says **Select one or more radicals**. Below it, the radicals scroll under pinned stroke-count
  headers, in the same tiles five to a row, and radicals that can't combine with the selection are
  hidden. A header opens and closes its section, as Grade's do ([Grade](#grade)). **Undo**, at the
  bottom right as in Handwriting, removes the last radical selected and is dimmed until one is.

A candidate from any panel is added to the end of the query, so picking one character after another,
in any mix of handwriting, radicals, and grades, builds a word. The panel closes and the results
show, with the query in the field. In dark mode the strip and pad are black. A Mac can't drag a
sheet away, so there the panel is a sheet with a **Done** button, which Escape presses too, sized
to stay inside the window ([iPad and Mac](index.md#ipad-and-mac)).

Check: UI `SearchInputUITests`: `testThePencilAndGridOpenOnePanelThatSwitchesBetweenThem` (the
sheet, its three buttons, Grade without **Undo** on iPhone only, and closing it, dragged away on
iPhone and iPad and with **Done** on the Mac), `testThePanelOpensAndStaysWhileTheFieldHasTheCaret`
(from above the keyboard), `testADrawnStrokeOffersKanjiUntilItsUndone` (a stroke drawn downward
leaves the sheet open), and `testARadicalsKanjiJoinsTheQueryAndSearches` (**Undo**, and a second
pick added to the first); package `HandwritingUndoTests`, `SearchInputCandidateTests` (a candidate
joins the query, and only candidates written in Japanese are offered), and `RadicalLookupTests` (the
kanji a pick lists and the radicals still offered, on the bundled radical file); core
`search/radicals.test.ts` and `search/query.test.ts`. The panel's colors are by hand.

### Grade

The cap opens **Grade**: Grade 1 to Grade 6, **Secondary school**, and **Jinmeiyō**, each the
website's kanji list for it, most frequent first ([Kanji
lists](../../../web/docs/product/browse.md#kanji-lists)), read from the bundled kanji data through
the shared core, offline.

- **Sections.** Grade and Radicals are one sectioned panel: a strip at the top, then sections whose
  headers open and close them with a tap, in Handwriting's tiles, five to a row (three at the
  largest text sizes). Every section starts open, and each panel remembers on the device which the
  learner closed.
- **Tiles.** A tile shows the kanji with a short meaning under it, unless **Show Kanji Meanings** in
  Account → Reading Aids is off (it's on until then). Tapping a tile adds its kanji to the end of
  the query, as a radical candidate does, and the panel closes. Grade has no **Undo**. Jinmeiyō's
  compatibility kanji (猪 at U+FA16 beside U+732A) are tiles of their own that search their ordinary
  form and borrow its missing meaning or readings; the filter finds one by either form.
- **Filter.** Where Radicals has its strip, Grade has a filter field. An English meaning, a
  reading in kana, or the kanji itself narrows every grade at once: a grade with matches opens
  and counts them, as **1 of 80**, and the rest are hidden. Each change returns the list to the
  top, and clearing it restores every grade, open or closed as before.
- **Known kanji.** A kanji marked known from its kanji detail's **•••** menu has a green outline,
  the ✓ Known tag's green, and each grade's header counts the known kanji it shows beside its
  total. Both forms of a compatibility kanji are known, and counted, together.

Check: UI `GradeInputUITests` on iPhone only (iPad and Mac on hold, 2026-10-18):
`testAGradesKanjiJoinsTheQueryAndOpensItsDetail` (a grade closed, a kanji from the next one looked
up, and its kanji detail opened), `testMarkingAKanjiKnownOutlinesItsTileAndCountsItInItsGrade`
(marked known, then unknown), `testClosedSectionsStayClosedAndTheFilterNarrowsEveryGrade` (Radicals'
sections too), `testTurningOffKanjiMeaningsLeavesTheKanjiAlone`, and
`testBothFormsOfACompatibilityKanjiAreTiles`; package `SchoolKanjiTests` (each list against the
bundled KANJIDIC2 grades by code point, the filter, compatibility kanji, known counts, remembered
sections, and Kanji Meanings on by default) and `PanelTileTests` (the columns); core
`browse/school-kanji.test.ts` (the lists as the website's `kanjiListResponse` answers them, and
compatibility kanji).

### Results

Japanese, English, and romaji queries show one **Results** list. Stronger matches come first; among
equally good matches, the enabled frequency dictionaries decide the order, in the learner's priority
order (see [Frequency Dictionaries](index.md#account)). Frequency never adds a result the query did
not match or lifts an incidental match above a direct one. English rows show the meaning that
matched. Matching notes follow ([Notes in Look Up](saved-data.md#notes-in-look-up)).

Check: the recorded `SearchConformanceTests` and `SearchResultsConformanceTests`; package
`SearchResultOrderingTests`; core `search/latin-text.test.ts`.

An English query (`café` too, as typed, then unaccented) groups its matches, strongest first:

1. words whose first meaning is the query, with or without notes in parentheses that end the
   meaning ("dog", "dog (Canis familiaris)", and "soft (and fluffy) (e.g. bed)" count; "to (take
   out and) show" isn't "to"), or, for a verb, "to" and the query;
2. words where a later meaning is the query;
3. words whose meanings mention it ("hot dog");
4. words that match only by romaji: exact, then starting with the query, then containing it, each
   its own group; then by Romaji's spelling (`rāmen`), then by it without macrons (`ramen`).

Within each group the more common word comes first, so `dog` leads with 犬 and `water` with 水.
Words the frequency dictionaries don't rank follow, JMdict's common words first, then the earlier
meaning; romaji that resembles the query (ドッグ for `dog`) only breaks a tie.

Check: package `SearchResultOrderingTests` and `EnglishSearchCommonWordTests`; core
`search/romaji-search.test.ts`; the recorded `SearchResultsConformanceTests` (`rāmen` to `biru`).

Each row shows compact chips such as `JLPT N3` or `YouTube 812`: one for the first enabled
dictionary, which orders the results (a dash when it doesn't rank the word), then one for each other
dictionary that ranks it. While Look Up's results are sorted by a dictionary ([Sorting
results](results.md#sorting-results)), that dictionary takes the first chip's place. JLPT shows only
when it lists the word. At accessibility text sizes, only the first chip shows, with a count of the
rest.

Check: core `detail/frequency.test.ts` (which chips show, and in what order) and
`results/learner.test.ts` (the sorted dictionary's chip first); package `ResultsScreenTests` (the
same on the bundled data, and the one chip with a count at the largest text sizes); the recorded
`SearchResultsConformanceTests`; UI `SearchResultsUITests` (each list drawn once, with its chips).

A chip's dot says how common the word is: green for a rank up to 1,500, yellow to 5,000, orange
to 15,000, red to 30,000, and gray beyond. These are Migaku's star cutoffs, so learners who know
that scale read the chips the same way. JLPT N5 and N4 are green, N3 and N2 yellow, and N1
orange. With Differentiate Without Color on, a star count such as 5★ replaces the dot.

Check: core `detail/frequency.test.ts` (the tiers); package `ResultsScreenTests` (their stars).

A known word shows a green **✓ Known** tag at the right of its headword, one being learned a
yellow **◐ Learning** one. A right swipe offers the other two states; a long-press opens **Status**.

Check: UI `SearchUITests.testMarkingAResultKnownShowsTheKnownCapsule` and `LearningUITests` (by
swipe on iPhone and iPad, reading the row as known or Learning; by right-click on the Mac, which
opens **Status**, as a Mac row gives a test no value); package `WordKnowledgeTests`.

An inflected Japanese query such as `まけたら` or `勉強した` finds its dictionary forms on the
device. When the query is itself a word (`いって` is 一手), that word stays first.

Check: package `JapaneseDeinflectionTests`; the recorded `SearchConformanceTests`.

Results show once, in order and with their chips; changing the enabled dictionaries or their
order re-sorts them at once. If frequency data can't be read, Look Up still shows every result and
says which dictionary is unavailable. Results can also offer a Japanese-reading refinement, related
Example Sentences, discovered words, and a dedicated Kanji result for a single-kanji query. An
English query's Example Sentences have its words in any form: `startled you` finds "startle you".

Check: package `ResultsScreenTests` and `FrequencyListsTests` (a finished first screen; a dictionary
that can't be read named, the others still ordering); core `detail/frequency.test.ts` (the notice's
words), `artifact/example-search.test.ts`, and `examples/english-inflection.test.ts` (which
sentences an English query finds); the recorded `SearchResultsConformanceTests` (the refinement,
Example Sentences, and Kanji rows), `SentenceResultsConformanceTests` (discovered words), and
`ExampleSearchConformanceTests` (`startled you` and `generously`); UI
`SearchResultsUITests.testARomajiQueryOffersItsJapaneseReading`,
`testAWordOffersItsExampleSentences`, and `SearchUITests.testAQueryWithNoMatchesSaysSo`.

The Example Sentences row opens the query's sentences on a screen titled with the query, whose
**•••** menu holds the [**Show** switches](reading-aids.md#the-show-menus). Under the title, a line
says how many it lists: "60 examples", or "The first 100 of more than 100 examples" when more match
than the 100 it lists, as the website's section does.

Check: the recorded `ExampleSearchConformanceTests` (`countText`, which the website is held to as
well); core `detail/examples.test.ts` and `embedded/text.test.ts`; UI
`SearchResultsUITests.testExampleSentencesSayHowManyAreListed` (3 examples, and over 100) and
`testExampleSentencesMenuHidesAndShowsTheirTranslations`.

Recent lookups, the latest 50, sync to a signed-in learner's devices and are listed while the query
is empty. A learner can repeat one, remove one by swiping or long-pressing it, or clear them all
from the **•••** menu ([Top bar](#top-bar)). Result headings scroll with the results, unpinned.

Check: UI `SearchUITests.testASearchKeepsItsQueryInTheFieldAndRunsAgainFromRecent`,
`SearchResultsUITests.testARecentSearchIsRemovedFromItsMenu` (long-press, or right-click on the
Mac), and `SearchResultsUITests.testClearingRecentSearchesEmptiesTheList`.

## Dictionary and kanji details

A kana word's examples are the sentences Tatoeba's word index links to it (でも not in いつでも); others
match their written forms and reading, in either width NFKC reads as one (Ｔシャツ, Tシャツ). JMdict's
checked examples of its meanings lead, even one the spelling misses (食べた for 食べる), and none drops,
so a list can pass 100. Each meaning shows its first with the page, which skips them if unreadable.

Check: the recorded `WordDetailConformanceTests` (each sense's `example`) and
`ExampleSearchConformanceTests`; package `KanaHeadwordExampleTests`, `MeaningExamplesTests`; core
`artifact/example-retrieval.test.ts`; UI `WordDetailUITests` (a meaning's example, or none).
Below the top card, sections appear in this order: Meaning, Frequency, Alternatives (other
written forms), Kanji, Alternative Kanji, Related Words, Lists, Notes, and Examples.

Check: the recorded `WordDetailConformanceTests`; core `detail/word.test.ts` and
`embedded/presentation.test.ts`; UI `WordDetailUITests` (Kanji, Lists, and Notes on the page, and
each row once in its section) and `TranslateUITests.testAWordSheetListsEachRowOnceInItsOwnSection`.

Each meaning opens a menu. **Speak** reads its glosses, each whole as JMdict gives it, in an English
voice, leaving out a parenthesis that ends one and reading a leading one as words ("dog (Canis
(lupus) familiaris), canine" is "dog, canine"), never the note line. **Copy** copies it with its
note line, and **Look Up** searches a gloss (１０万's "100,000"). The pronounce buttons stay Japanese.

Check: core `detail/meaning-actions.test.ts`; package `MeaningActionsTests`; the service's
`embedded-detail.conformance.test.ts`; UI `testAMeaningSpeaksInEnglishAndLooksUpAGloss`.

A related word opens the entry it names. One that names none is looked up, and opens the
result written and read the same, or the first result when none is.

Check: package `WordResolutionTests`; core `embedded/dictionary.test.ts`.

The top of a word detail shows the headword with furigana, following the Reading Aids setting.
Tapping one of its kanji shows which furigana belongs to it (see [Furigana kanji
highlight](index.md#furigana-kanji-highlight)). When furigana is off, the reading appears under the
headword instead. A long headword shrinks one size to keep its furigana beside the pitch accent;
when even that doesn't fit, the pitch accent moves to its own line under a full-size headword. To
the right of the headword are the pitch accent (the reading in katakana with an overline across the
high morae and a hook at the downstep) in a capsule with a speaker, which pronounces the word when
tapped, and the latest encounter photo. A word without pitch shows a standalone pronounce button.
Pitch is the word's own UniDic accent, never a homophone's (橋 2, 箸 1, 端 0); a compound UniDic lacks
(記者会見) is estimated from its parts, but not an idiom, a 〜的 word, or an expression, and a word with
neither has none. A part-of-speech row follows and opens the conjugation table when one exists. It
names one word class and then its modifiers in sentence case without repeating "verb", for example
"Godan verb (intransitive)", "Noun · する verb (transitive)", "Adverb (と)", or "Pre-noun adjective".

Check: recorded `WordDetailConformanceTests` (furigana, pitch, and the part of speech);
`UniDicPitchTests`; core `detail/pitch.test.ts` and `detail/part-of-speech.test.ts`; package
`CompoundPitchTests`; UI `WordDetailUITests.testTappingAKanjiInTheHeadwordHighlightsItsReading` and
`AccountUITests.testTurningFuriganaOffShowsTheReadingUnderTheHeadword`.

The conjugation table starts with the word, its reading and meaning, its word class, and a one-line
rule for how that class conjugates. A Plain/Polite control switches register when both exist. Each
row names the form and shows it with the changed ending highlighted. Selecting a row opens that
form's screen. It leads with what the form means, then shows the form the way Word Detail shows a
word (furigana and a pronounce button) with its ending highlighted, and then every Example Sentence
that uses the complete form, in Word Detail's list. Forms that share a spelling, such as potential
and passive 見られる, say so. A word in the example opens its Word Detail, and Back returns to the form.

Check: the recorded `WordDetailConformanceTests` (each table's forms and their examples); UI
`SearchUITests.testAVerbOpensItsConjugationsAndAForm`.

Linked Japanese in example sentences, on Example Sentences and on a word's page, splits into words
as Image Search does and underlines each, so word boundaries are visible. An inflected verb or
adjective is one word with its endings, such as 見なかった, 見ている, or 静かな, and opens its dictionary entry.
The words that make up the current entry or the looked-up form are accented. Words the learner
marked known have no underline, and no furigana when **Hide Furigana on Known Words** is on, but can
still be selected. [Reading Aids](reading-aids.md) and a word's and Example Sentences' **•••** menus
add a short accent-colored meaning under each unknown word and each sentence's English.

Check: the recorded `ExampleSearchConformanceTests`; core `examples/morphology.test.ts` and
`linking.test.ts` (which pieces join into one word), `artifact/word-examples.test.ts` (which words
are accented), and `detail/text.test.ts` (the short meaning); package `LinkedWordResolutionTests`
and `WordMeaningTests`; UI `ImageSearchUITests`, `WordDetailUITests` (a linked word opens).

On Example Sentences, a word's Examples, and a form's examples, a sentence appears with its words
linked, furigana, and romaji when Romaji is on: never as plain text first, and at the height it
keeps. Each list shows 25 sentences, those that fit the screen first, then 25 more at its end.
Back from a word opened on Example Sentences finds its sentence on screen, within a third of the
list of where it was. A list that fails says "Examples couldn’t be loaded.", never that it has none;
a later page, "More examples couldn’t be loaded." Each has **Retry** and is read again on return.

Check: UI `ExampleRowsUITests` (rows 1, 23, and 26 of each screen arrive linked while held, after
no empty or failed message, and keep their height; a form's word opens; the place is kept, Romaji
on; a failed read says so, read on return and Retry); `LoadedExamplesTests`, `ExamplePlaceTests`.

A **Frequency** section lists each enabled dictionary's rank or JLPT level for the word. It is drawn
with the page, except just after a launch, and follows a change of dictionaries at once. Selecting a
row opens that dictionary's details. JLPT levels are presented as unofficial study estimates.

Check: the recorded `WordDetailConformanceTests` (each pack's row and its details); package
`ResultsScreenTests` (the rows' names, values, and details); UI
`WordDetailUITests.testAFrequencyRowOpensItsDetails` and `AccountUITests` (one turned off).

The top-right of a word detail holds **Share**, which shares the headword, reading, and numbered
meanings as text, with the canonical link to the word's page on zenbujapanese.com
(`https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/` for 見る). The link goes as a web
link beside the text, on every device. With Zenbu it opens the word in Zenbu ([Links from
zenbujapanese.com](#links-from-zenbujapanesecom)), else the website. Beside Share is a **•••** menu,
starting with **Status** (Unknown, Learning, or Known, one checked) and **Add to List…**, then Add
Note, Take Photo, Choose Photo, and the [**Show** switches](reading-aids.md#the-show-menus). The
word's **✓ Known** or **◐ Learning** tag shows under its headword. A word is Unknown until the
learner marks it; its state persists on the device, keyed by the entry's stable identifier.

Check: UI `WordDetailUITests.testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown` (the menu,
without **Take Photo** on the Mac), `testTheMenuTurnsReadingAidsOffForTheExamplesAndAccount`,
`testAShowSwitchLeavesTheMenuOpenAndAnotherChoiceClosesIt`, `testAKanjisMenuHasTheShowSwitches`
(**Show**), and `testShareOffersTheWordsWebLink` (iPhone and iPad); package `WordKnowledgeTests` and
`WordDetailShareTests` (what **Share** sends: the text, and a link that opens the word again).

**Add to List…** opens a sheet listing every word list, with a checkmark on the lists that
contain the word. Tapping a list adds or removes the word at once, **New List** asks for a name,
creates the list, and adds the word to it, and Done closes the sheet. A **Lists** section above
Notes names every list holding the word, each opening that list in Account, followed by
**Add to List**, which opens the same sheet. Look Up's results don't show which lists a word is in.

Check: UI `WordDetailUITests.testAddToListPutsTheWordInFavoritesAndANewList` (the sheet, New List,
the Lists section, and a list opening in Account); package `WordListsTests`.

A learner can write notes for a word and associate photos with it, which stay on the word
([Notes and photos](saved-data.md#notes-and-photos)).

A kanji detail presents readings, meanings, stroke order, components, elements, and words that
contain the kanji, in the core's order: an empty one is left out, but not Lists, Notes, or a listed
kanji's Readings. After a spinner, all but stroke order appear at once; links keep the place.

Check: the recorded `KanjiDetailConformanceTests`; core `embedded/presentation.test.ts`; package
`KanjiScrollMemoryTests`; UI `WordDetailUITests.testAKanjiShowsItsStrokeOrderAndItsWords` and
`testAKanjiPageIsDrawnOnceWithItsFactsAndItsWords`.

An element's page shows the element, its meanings and what it contributes, the on-readings it links,
its alternative forms, the kanji it is on its own (the most frequent among the element and its
alternatives), the kanji that contain it, each with up to three meanings and its on-readings, and
the sources. A kanji opens its own detail, and coming back returns to it in the list.

Check: the recorded `KanjiElementConformanceTests`; core `detail/kanji-element.test.ts`; package
`KanjiScrollMemoryTests` and `KanjiFilesTests` (a compatibility kanji and the kanji it unifies
with each keep their own page); UI
`WordDetailUITests.testAKanjisElementShowsWhatItContributesAndAKanjiItIsIn`.

Beside the kanji, a kanji detail shows its stroke count, its school grade when it has one, and its
JLPT level when Jonathan Waller's kanji lists give one, as N5 to N1: 一 and 日 show N5. The JLPT has
published no kanji list since 2010, so the level is his estimate. A kanji his lists leave out shows
no JLPT level, including 172 jōyō kanji, such as 分, that no modern list gives one.

Check: package `KanjiStatTests`; the recorded `KanjiDetailConformanceTests`.

A kanji detail has the same **Share** button and **•••** menu as a word detail. Share sends the
kanji, its readings, and its meanings as text, with the link to the kanji's search on
zenbujapanese.com, such as `https://zenbujapanese.com/dictionary/search/%E6%97%A5/` for 日, which the
website opens with the kanji's details and Zenbu in Look Up. The website has no kanji pages, and
shares a kanji at the same search; a compatibility kanji's is its normalized form's. Before the page
has loaded, Share sends the kanji alone. The menu sets the kanji's **Status**, adds it to lists, and
adds notes and photos, which work as they do for a word. Lists and Notes sections appear above the
words containing the kanji, and the kanji shows its Known or Learning tag. A kanji is saved as
itself, not as a dictionary word, so marking 最 known doesn't mark the word 最.

Check: package `SavedKanjiTests`; `WordDetailShareTests` (the kanji's text and link, which
searches the kanji again); UI `SavedWordsUITests.testAKanjiIsMarkedKnownFromItsMenu` and
`WordDetailUITests.testShareOffersTheKanjisWebLink`.

## Links from zenbujapanese.com

A zenbujapanese.com dictionary link opens its word, kanji, or search in Zenbu, and **Share** sends
such links: [Links from zenbujapanese.com](website-links.md).
