# Sorting and filtering results

Look Up's results open with a row naming their order, which re-sorts and filters them
([Dictionary](dictionary.md#look-up) describes the results themselves).

## Sorting results

While results are showing, their first row, above Example Sentences, names the order: **Sorted by
Default**, **Sorted by YouTube**, **Sorted by Known Words**. Tapping it opens a short menu with two
rows, **Sort By** and **Filter** ([Filtering results](#filtering-results)). **Sort By** names the
current order underneath and opens a list with **Default**, one item for each enabled frequency
dictionary by its name (JLPT, YouTube, Japanese Wikipedia, TV & Movies, Anime, Manga, Novels, Visual
Novels, Video Games), and **Known Words**, one checked at a time. There is no direction to choose.

- **Default** is Look Up's own order ([Dictionary](dictionary.md#look-up)).
- **A dictionary** orders every matching word by that dictionary alone, most common first,
  however it matched. JLPT orders by level, N5 first.
- **Known Words** puts the learner's known words first. Marking a word known or unknown moves it
  at once.

A word the chosen dictionary doesn't rank goes after the ranked words. Ties, and the words without
a rank, keep their Default order. A choice an earlier build saved with a direction reads as Default.

Check: core `results/ordering.test.ts` (each order, and the row's words); package
`ResultsScreenTests` (the same on the bundled data); UI
`SearchResultsUITests.testTheSortedByRowNamesTheChosenOrder` (a dictionary, Known Words, and back
to Default).

Switching re-sorts the visible results without searching again and announces the new order to
VoiceOver. The choice is kept on the device across launches and applies to Japanese, English, and
romaji queries. If frequency data can't be read, a dictionary sort shows as Default until it can
be. If the chosen dictionary is disabled or removed, Look Up goes back to Default. The Kanji row,
Example Sentences, the reading refinement, and Discovered Words keep their places; when there are no
word rows to sort (only Discovered Words, or only a single kanji's Kanji row), the row isn't shown.

Check: core `results/ordering.test.ts` and `results/learner.test.ts` (VoiceOver's announcement, the
stored choice, unreadable ranks, a disabled dictionary); package `ResultsScreenTests` (the stored
choice, an unreadable dictionary, a disabled one, and none enabled, on the bundled data).

## Filtering results

The **Sorted by** row's menu has a **Filter** row, naming its current choice underneath, under
**Sort By**. It opens **All**, **Known**, and **Unknown**, one checked at a time: **Known** shows
only known words and **Unknown** only the words not yet known. Marking a word known or unknown moves
it out of or into the list at once. Enabling and disabling frequency dictionaries happens under
**Account → Frequency Dictionaries**, not here.

While a filter is on, the **Sorted by** row adds it after the order, as in **Sorted by Default · 1
filter**; no other row is added. Filtering keeps the chosen sort. When it hides every word, the
list shows **No Words Match Your Filter** with the count and **Clear Filter**.

Changing the filter updates the visible results without searching again and announces how many
words show to VoiceOver. The filter is kept on the device across launches and applies to
Japanese, English, and romaji queries. The Kanji row, Example Sentences, the reading refinement,
and Discovered Words are never filtered.

Check: core `results/ordering.test.ts` (known or unknown words, the order kept, the count, and the
stored filter); package `ResultsScreenTests` (known words only, and the count a filter hides); UI
`SearchResultsUITests.testFilteringToKnownWordsHidesEveryWordUntilTheFilterIsCleared` (the row's **1
filter**, **No Words Match Your Filter**, and **Clear Filter**) and
`testAWordLeavesTheUnknownFilterOnceItsMarkedKnown`.
