# Dictionary

Dictionary is the app's primary Product Experience. It appears as the **Search** tab and uses
bundled Language Reference Data so ordinary dictionary lookup works offline.

## Search

A learner can search in Japanese or English using:

- the keyboard;
- handwriting recognition, which reads the finished drawing's shape, so stroke order and
  direction don't matter; or
- radical selection.

Check: UI `SearchUITests.testAnEnglishSearchListsTheWordAndOpensItsDetail` (the keyboard) and
`testHandwritingAndRadicalsReplaceTheKeyboard` (the handwriting canvas and the radical grid);
package `HandwritingRecognitionTests` (a drawn kanji is read whatever the stroke order) and
`RadicalLookupTests` (radicals narrow to the kanji that have them).

Image Search, for Japanese in a photo, is Translate's **Image** option
([Image Search](translate.md#image-search)).

Check: UI `SearchUITests` (Search has no camera button) and `ImageSearchUITests`.

### Top bar

Search's top bar is Player's: a small, centered **Search** title above the same search field,
with the prompt **Search Japanese or English** (**Search** at the largest text sizes) and a clear
button while it has text.

- **Recent.** With nothing searched, the title bar's **•••** menu offers **Clear Recent
  Searches** while recent searches are listed. The recent searches are listed without a heading.
- **Input buttons.** Two round buttons, a pencil for **Handwriting** and a grid for **Radicals**,
  sit at the bottom left on every Search screen: above the tab bar on Recent and results, and
  above the keyboard while typing. Either opens its panel in one tap.
- **Typing.** Tapping the field slides the screen up as Player's does: the title bar slides away,
  the field moves to the top, and an **X** appears beside it. The clear button inside the field
  clears the text.
- **Results.** Submitting, or picking a recent search, the reading refinement, or a handwriting
  or radical candidate, puts the keyboard away and keeps the query in the field at the top, with
  **X** beside it. The first row of the results names the order and opens Sort and Filter
  ([Sorting results](#sorting-results), [Filtering results](#filtering-results)).
- **X** clears the query and returns to Recent.

### Handwriting and Radicals

Tapping the pencil or the grid slides up a full-height sheet over the search field and the tab
bar, with a grabber at the top: drag it down to close it. Drawing on the pad never drags the
sheet. The same two buttons stay at its bottom left, in the same place as on the search screen,
with the current one highlighted, so the other mode is one tap away. Both panels share one gray
background, flat candidate tiles in the same fill as the radical squares, and glass buttons
(white in light mode).

- **Handwriting.** A white drawing pad sits at the top, with candidate tiles below it:
  five to a row, each with the kanji's first meaning. Three rows show and more scroll. **Undo**,
  at the bottom right, removes the last stroke and recognizes the rest again. Before
  there are candidates, text shows under the pad only while recognizing, when nothing matches,
  or when recognition fails.
- **Radicals.** A white strip at the top lists the kanji that contain every selected radical,
  or says **Select one or more radicals**. Below it, the radicals scroll under pinned stroke-count
  headers, and radicals that can't combine with the selection are hidden. **Undo**, the same
  button as Handwriting's at the bottom right, removes the last radical selected and is dimmed
  until one is.

A candidate from either panel is added to the end of the query, so picking one character after
another, in any mix of handwriting and radicals, builds a word. The panel closes and the results
show, with the query in the field. In dark mode the strip and pad are black.

Japanese, English, and romaji searches show one **Results** list. Stronger matches come first;
among equally good matches, the enabled frequency dictionaries decide the order, in the
learner's priority order (see [Frequency Dictionaries](index.md#account)). Frequency never adds a
result the query did not match or lifts an incidental match above a direct one. English rows
show the meaning that matched.

Check: the recorded `SearchConformanceTests` and `SearchResultsConformanceTests`; package
`SearchResultOrderingTests`.

An English query groups its matches, strongest first:

1. words whose first meaning is the query, with or without notes in parentheses that end the
   meaning ("dog", "dog (Canis familiaris)", and "soft (and fluffy) (e.g. bed)" count; "to (take
   out and) show" isn't "to"), or, for a verb, "to" and the query;
2. words where a later meaning is the query;
3. words whose meanings mention it ("hot dog");
4. words that match only by romaji: an exact romaji match, then one that starts with the query,
   then one that contains it, each its own group.

Within each group the more common word comes first, so `dog` leads with 犬 and `water` with 水.
Words the frequency dictionaries don't rank follow, JMdict's common words first, then the earlier
meaning; romaji that resembles the query (ドッグ for `dog`) only breaks a tie.

Check: package `SearchResultOrderingTests` and `EnglishSearchCommonWordTests`; the recorded
`SearchResultsConformanceTests`.

Each row shows compact chips such as `JLPT N3` or `YouTube 812`: one for the first enabled
dictionary, which orders the results (a dash when it doesn't rank the word), then one for each
other dictionary that ranks it. While Search is sorted by a dictionary (below), that
dictionary takes the first chip's place. JLPT shows only when it lists the word. At accessibility text
sizes, only the first dictionary's chip shows, followed by a count of the rest.

Check: package `SearchFrequencyChipTests` and `SearchResultSortTests` (the sorted dictionary's
chip first); the recorded `SearchResultsConformanceTests`.

A chip's dot says how common the word is: green for a rank up to 1,500, yellow to 5,000, orange
to 15,000, red to 30,000, and gray beyond. These are Migaku's star cutoffs, so learners who know
that scale read the chips the same way. JLPT N5 and N4 are green, N3 and N2 yellow, and N1
orange. With Differentiate Without Color on, a star count such as 5★ replaces the dot.

Check: package `SearchFrequencyChipTests` (the tiers and their stars).

A word the learner knows shows a green **✓ Known** capsule at the right of its headword.
Swiping a row to the right, or long-pressing it, marks the word known or unknown without
opening it.

Check: UI `SearchUITests.testMarkingAResultKnownShowsTheKnownCapsule` (by swipe on iPhone and
iPad, right-click on the Mac); package `WordKnowledgeTests`.

An inflected Japanese query such as `まけたら` or `勉強した` finds its dictionary forms on the
device. When the query is itself a word (`いって` is 一手), that word stays first.

Check: package `JapaneseDeinflectionTests`; the recorded `SearchConformanceTests`.

Changing the enabled dictionaries or their order re-sorts the visible results without searching
again. If frequency data can't be read, Search still shows every result and says which
dictionary is unavailable. Results can also offer a Japanese-reading refinement, related
Example Sentences, discovered words, and a dedicated Kanji result for a single-kanji query.

Check: package `SearchFrequencyOrchestrationTests` and `SearchFrequencyUnavailableNoticeTests`; the
recorded `SearchResultsConformanceTests` (the refinement, Example Sentences, and Kanji rows); UI
`SearchResultsUITests.testARomajiQueryOffersItsJapaneseReading`,
`testAWordOffersItsExampleSentences`, and `SearchUITests.testAQueryWithNoMatchesSaysSo`.

Recent text searches are stored on the device and listed while the
query is empty. A learner can repeat a search, remove one by swiping or long-pressing it, or clear the entire history
from the **•••** menu, which offers **Clear Recent Searches** while recent searches are listed. Result headings scroll
with the results instead of staying pinned over them.

Check: UI `SearchUITests.testASearchIsListedUnderRecentAndRunsAgain`,
`SearchResultsUITests.testARecentSearchIsRemovedFromItsMenu` (long-press, or right-click on the
Mac), and `SearchResultsUITests.testClearingRecentSearchesEmptiesTheList`.

### Sorting results

While results are showing, their first row, above Example Sentences, names the order: **Sorted
by Default**, **Sorted by YouTube**, **Sorted by Known Words**. Tapping
it opens a short menu with two rows, **Sort By** and **Filter** ([Filtering results](#filtering-results)).
**Sort By** names the current order underneath and opens a list with **Default**, one item for each
enabled frequency dictionary by its name (JLPT, YouTube, Japanese Wikipedia, TV & Movies, Anime,
Manga, Novels, Visual Novels, Video Games), and **Known Words**, one checked at a time. There is
no direction to choose.

- **Default** is the order described above.
- **A dictionary** orders every matching word by that dictionary alone, most common first,
  however it matched. JLPT orders by level, N5 first.
- **Known Words** puts the learner's known words first. Marking a word known or unknown moves it
  at once.

A word the chosen dictionary doesn't rank goes after the ranked words. Ties, and the words without
a rank, keep their Default order. A choice saved with a direction by an earlier build reads as
Default.

Check: package `SearchResultSortTests` (the row's words); UI
`SearchResultsUITests.testSortingByADictionarySaysSoUntilReset`.

Switching re-sorts the visible results without searching again and announces the new order to
VoiceOver. The choice is kept on the device across launches and applies to Japanese, English,
and romaji searches. While ranks are loading, or if frequency data can't be read, a dictionary
sort shows as Default and returns once the ranks load. If the chosen dictionary is disabled or
removed, Search goes back to Default. The Kanji row, Example Sentences, the reading refinement, and Discovered Words keep their
places; when there are no word rows to sort (only Discovered Words, or only a single kanji's
Kanji row), the row isn't shown.

### Filtering results

The **Sorted by** row's menu has a **Filter** row, naming its current choice underneath, under **Sort By**.
It opens **All**, **Known**, and **Unknown**, one checked at a time: **Known** shows only known
words and **Unknown** only the words not yet known. Marking a word known or unknown moves it out
of or into the list at once. Enabling and disabling frequency dictionaries happens under
**Account → Frequency Dictionaries**, not here.

While a filter is on, the **Sorted by** row adds it after the order, as in **Sorted by Default · 1
filter**; no other row is added. Filtering keeps the chosen sort. When it hides every word, the
list shows **No Words Match Your Filter** with the count and **Clear Filter**.

Changing the filter updates the visible results without searching again and announces how many
words show to VoiceOver. The filter is kept on the device across launches and applies to
Japanese, English, and romaji searches. The Kanji row, Example Sentences, the reading refinement,
and Discovered Words are never filtered.

Check: package `SearchResultSortTests` (VoiceOver's announcement, the stored choice, loading and
unreadable ranks, a disabled dictionary).

## Dictionary and kanji details

A word detail can present its written form and reading, ordered meanings, alternative forms,
kanji, related words, conjugations, source-matched Example Sentences, pronunciation, and
frequency information when the corresponding data is available.
Examples for a word written in kana, such as それで or でも, are the sentences Tatoeba's word
index links to that word, so a kana word inside a longer one (でも in いつでも) does not count.
Other words match their written forms and reading.

Check: the recorded `WordDetailConformanceTests` and `ExampleSearchConformanceTests`; package
`KanaHeadwordExampleTests`.
Below the top card, sections appear in this order: Meaning, Frequency, Alternatives (other
written forms), Kanji, Alternative Kanji, Related Words, Lists, Notes, and Examples.

Check: the recorded `WordDetailConformanceTests`; UI `WordDetailUITests` (Kanji, Lists, and Notes
on the page).

The top of a word detail shows the headword with furigana, following the Reading Aids setting.
Tapping one of its kanji shows which furigana belongs to it (see
[Furigana kanji highlight](index.md#furigana-kanji-highlight)).
When furigana is off, the reading appears under the headword instead. A long headword shrinks one size to
keep its furigana beside the pitch accent; when even that doesn't fit, the pitch accent moves to
its own line under a full-size headword. To the right of the
headword are the pitch accent (the reading in katakana with an overline across the high morae and
a hook at the downstep) in a capsule with a speaker, which pronounces the word when tapped, and
the latest encounter photo. A word without pitch shows a standalone pronounce button. Pitch comes from
UniDic; for a two-part compound UniDic doesn't list whole, such as 記者会見, it is estimated from
the parts' accent-combination types, and a word with neither shows no pitch. A part-of-speech row
follows and opens the conjugation table when one exists. It names one word class and then its
modifiers in sentence case without repeating "verb", for example "Godan verb (intransitive)",
"Noun · する verb (transitive)", "Adverb (と)", or "Pre-noun adjective".

Check: the recorded `WordDetailConformanceTests` (furigana, pitch, and the part of speech);
package `PitchAccentTests`, `CompoundPitchTests`, and `PartOfSpeechFormatterTests`; UI
`WordDetailUITests.testTappingAKanjiInTheHeadwordHighlightsItsReading` and
`AccountUITests.testTurningFuriganaOffShowsTheReadingUnderTheHeadword`.

The conjugation table starts with the word, its reading and meaning, its word class, and a
one-line rule for how that class conjugates. A Plain/Polite control switches register when both
exist. Each row names the form and shows it with the changed ending highlighted. Selecting a row
opens that form's screen. It leads with what the form means, then shows the form the way Word
Detail shows a word (furigana and a pronounce button) with its ending highlighted, and then every
Example Sentence that uses the complete form, in the same list Word Detail uses. Forms that share a spelling, such as potential and
passive 見られる, say so. Selecting a word in the example opens its Word Detail, and Back returns
to the form.

Check: the recorded `WordDetailConformanceTests` (each table's forms and their examples); UI
`SearchUITests.testAVerbOpensItsConjugationsAndAForm`.

Linked Japanese in Example Sentences gives each word its own underline, so word boundaries are
visible. An inflected verb or adjective is one word with its endings, such as 見なかった,
見ている, or 静かな, and opens its dictionary entry. The words that make up the current entry or
the searched form are accented. Words the learner marked known have no underline, and no
furigana when **Hide Furigana on Known Words** is on, but can still be selected. With **Show
Word Meanings** on, each unknown word shows a short accent-colored meaning under it, and
**Show Sentence Translations** controls whether example sentences show their English.

Check: the recorded `ExampleSearchConformanceTests`; package `JapaneseInflectionGroupingTests`,
`LinkedWordResolutionTests`, and `WordMeaningTests`.

A **Frequency** section lists each enabled dictionary's rank or JLPT level for the word.
Selecting a row opens that dictionary's details. JLPT levels are presented as unofficial study
estimates.

Check: the recorded `WordDetailConformanceTests` (each pack's row and its details).

Selectable Japanese inside Word Detail and Example Sentences uses the same interactive
word-boundary analysis as Image Search. Selecting a linked word continues into its normal
dictionary entry.

Check: package `LinkedWordResolutionTests`; UI `ImageSearchUITests` (a linked word opens its
entry).

The top-right of a word detail holds **Share**, which shares the headword, reading, and numbered
meanings as text, and a **•••** menu. The menu starts with **Mark as Known** (or **Mark as
Unknown**) and **Add to List…**, followed by Add Note, Take Photo, and Choose Photo. A known word shows the same
**✓ Known** capsule under its headword. A word counts as unknown until the learner marks it, and
known words persist on the device, keyed by the dictionary entry's stable identifier.

Check: UI `WordDetailUITests.testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown` (the menu,
without **Take Photo** on the Mac); package `WordKnowledgeTests`; `WordDetailShareTests` (what
**Share** sends).

**Add to List…** opens a sheet listing every word list, with a checkmark on the lists that
contain the word. Tapping a list adds or removes the word at once, **New List** asks for a name,
creates the list, and adds the word to it, and Done closes the sheet. A **Lists** section above
Notes names every list holding the word, each opening that list in Account, followed by
**Add to List**, which opens the same sheet. Search results don't show which lists a word is in.

Check: UI `WordDetailUITests.testAddToListPutsTheWordInFavoritesAndANewList` (the sheet, New List,
the Lists section, and a list opening in Account); package `WordListsTests`.

A learner can write notes for a word and associate photos with it. Notes and associated
photos persist on the device. If saved notes can't be read, a copy is kept on the device rather
than written over, and every note that can be read stays, on its word or any other
([Saved data that can't be read](index.md#saved-data-that-cant-be-read)).

Check: UI `WordDetailUITests.testANoteIsKeptOnTheWord` and
`SavedWordsUITests.testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted`; package
`WordNoteStorageTests` and `EncounterMediaStorageTests`.

A kanji detail can present readings, meanings, stroke order, components, elements, and words
that contain the kanji. Component and element links can be followed without losing the
learner's place in the preceding detail.

Check: the recorded `KanjiDetailConformanceTests`; package `KanjiScrollMemoryTests`; UI
`WordDetailUITests.testAKanjiShowsItsStrokeOrderAndItsWords`.

Beside the kanji, a kanji detail shows its stroke count, its school grade when it has one, and
its JLPT level when Jonathan Waller's kanji lists give one, as N5 to N1: 一 and 日 show N5. The
JLPT has published no kanji list since 2010, so the level is his estimate. A kanji his lists
leave out shows no JLPT level, including 172 jōyō kanji, such as 分, that no modern list gives
one. `KanjiStatTests` and the kanji detail conformance suite check it.

Check: package `KanjiStatTests`; the recorded `KanjiDetailConformanceTests`.

A kanji detail has the same **Share** button and **•••** menu as a word detail. Share sends the
kanji, its readings, and its meanings as text. The menu marks the kanji known, adds it to lists,
and adds notes and photos, which work as they do for a word. Lists and Notes sections appear
above the words containing the kanji, and a known kanji shows the **✓ Known** capsule. A kanji
is saved as itself, not as a dictionary word, so marking 最 known doesn't mark the word 最.

Check: package `SavedKanjiTests`; UI `SavedWordsUITests.testAKanjiIsMarkedKnownFromItsMenu`.

## Links from zenbujapanese.com

Tapping a zenbujapanese.com dictionary link in another app, such as Tomodachi's **Open in
Zenbu**, opens it in Zenbu rather than the browser. From any tab, Translate included, Zenbu
switches to the Search tab and closes an open word sheet. A running Translate conversation keeps
going, and the bar above the tab bar returns to it. Then:

- a word, `/dictionary/<slug>-<number>/` such as `/dictionary/見る-1259290/`, opens that word's
  Word Detail on top of what Search was showing. The number is JMdict's entry number, which
  decides the word whatever the slug says. A word the app's dictionary doesn't have searches the
  slug's text instead, or returns to the Search screen when the URL has no slug;
- a search, `/dictionary/search/<query>/`, returns to the Search screen and searches the query;
- a kanji, `/dictionary/kanji/<kanji>/`, opens the detail of that exact character. The website
  removed these pages and redirects them to the kanji's search, but the app has a kanji detail to
  open; and
- any other zenbujapanese.com URL returns to the Search screen.

A word's old conjugation pages open the word, and a search's old Example Sentences page the
search, as the website redirects them. iOS opens Zenbu only for the URLs the website's
association file claims ([website product docs](../../../web/docs/product/dictionary.md#urls-seo-and-indexing));
until the website has Zenbu's Apple team ID, links open the website.

- Source: #568, part of #563.
- Check: package `WebsiteLinkTests` (`apps/ios/Modules/Tests/SearchExperienceTests/WebsiteLinkTests.swift`)
  for how each URL reads and what it opens, against the bundled dictionary. That iOS hands a
  tapped link to Zenbu is by hand, on a device.

