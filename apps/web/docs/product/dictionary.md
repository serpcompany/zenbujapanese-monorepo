# Dictionary

The website's dictionary mirrors the app's [Dictionary](../../../ios/docs/product/dictionary.md).
Each behavior below says what the website does, where that behavior comes from, and the automated
check that enforces it (see [How behavior is verified](index.md#how-behavior-is-verified)).

The dictionary has three page types (ADR 0010): the [home](#dictionary-home), a search's
[results](#search-results), and a [word](#word-page). The browse pages that list and link to them
(ADR 0010, amended for #614) are in [Browse pages](browse.md). What the app opens from a word as screens of
its own, the conjugation table and its forms, a kanji's details, and the example sentences, is on
the word page, in sections that open and close and stay in the page's HTML while closed.

Abbreviations: **App docs** is `apps/ios/docs/product/dictionary.md`. Swift files are in
`apps/ios/Modules/Sources/SearchExperience/`. Web paths are under `apps/web/`; paths that start with
`packages/` or `apps/` are from the repository root. **SR**, **WD**, and **KD** are the app-recorded
suites `search-retrieval.json`, `word-detail.json`, and `kanji-detail.json`, with the field they
record. The dictionary service replays them on the app's own data: SR by
`apps/dictionary-api/src/conformance/search.conformance.test.ts` ("search conformance"), WD and KD
by `apps/dictionary-api/src/conformance/detail.conformance.test.ts` ("word and kanji detail
conformance"). **SRR** is `search-results.json`, the results screen after the frequency re-sort,
replayed field by field by `apps/dictionary-api/src/conformance/results.conformance.test.ts`
("search results conformance"), and rendered for seven of its cases by
`src/components/dictionary/search-results.test.tsx` ("the rendered search results page matches the
app"). **SSR** is `sentence-results.json`, that screen for each sentence the app lists Discovered
Words for, recorded and replayed with Sudachi ("sentence results conformance"), and rendered for
three of its cases by the same test. **ES** is `example-search.json`, what the Example Sentences
screen that Look Up's examples row opens lists for 69 queries, replayed by
`apps/dictionary-api/src/conformance/example-search.conformance.test.ts` ("example search
conformance") and rendered for nine of its cases by
`src/components/dictionary/search-examples.test.tsx` ("the rendered Example Sentences section
matches the app"). **WD rendered** is `src/components/dictionary/word-page.test.tsx` ("the rendered
word page matches the app"), which draws every WD case through the word page's components and reads
back what they draw. **Conjugations rendered** is `src/components/dictionary/conjugations.test.tsx`:
every WD case's table ("the rendered Conjugations section matches the app") and forms' examples
("each conjugated form’s examples match the app"). The `Dictionary API` workflow runs the suites,
then the rendered tests against the service it builds, on pull requests that change the service, the
core, the website's dictionary components or data code, the app's bundled data, or the suites. Unit
tests are named by file and test title.

## Dictionary home

**Search box.** `/dictionary/` is a heading, a one-line description, and the search box, focused
on load, centered a little above the middle of the screen, where the eye lands first. The box is a
text field and a Search button; it searches in Japanese, kana, romaji, or English. Submitting it
opens that query's results page.

- Source: #462 (the dictionary page is only a search box); #484 (the hero layout, the description,
  and the `Input` and `Button` form, which replaced #462's `InputGroup`).
- Check: smoke `200 /dictionary/`; `apps/web/e2e/search.spec.ts`, "the dictionary home searches
  and lands on the canonical results page" (the heading, the box, and submitting it); the layout,
  at a desktop and a phone width: `apps/web/e2e/search.spec.ts`, "the dictionary home centers its
  heading and box a little above the middle, the box focused".

**Browse sections.** Below the search box, the home leads into the browse pages: by kana, kanji by
school grade, categories, and common words ([Browse pages](browse.md#dictionary-home)).

**Breadcrumbs.** Every dictionary page starts with a breadcrumb trail under the site header:
Home › Dictionary on this page, then the page's own crumb on the others. The app has none. The
trail stays on one line: a long last crumb (a long headword or query) is cut short with an
ellipsis, and Home and Dictionary keep their full width.

- Source: #484; #576 (Home and Dictionary never shrink).
- Check: `apps/web/e2e/word.spec.ts`, "shows the word, its breadcrumb, and its meaning";
  `apps/web/e2e/search.spec.ts`, "a long query's crumb is cut short, never Home or Dictionary".

**Column.** Every dictionary page is one column, at most 768 pixels wide (`max-w-3xl`), centered,
with 16-pixel margins; on a phone it fills the screen's width. The home's browse sections fit this
column too. The browse pages under `/dictionary/browse/` are wider, as their mockups are
([Browse pages](browse.md#site-wide)).

- Source: #576 (widened from 672 pixels).
- Check: `apps/web/e2e/search.spec.ts`, "is one column, at most 768 pixels wide", on the home, the
  search page, a results page, and a word page, at a desktop and a phone width.

## Search results

**Searching.** A search runs when the learner submits the box, not as they type. The box submits
to `/dictionary/search/?q=<query>`, which redirects (308) to the query's own results page. The
results page keeps its box under the breadcrumbs, filled with the query; word pages have no box,
and reach search through the header's Dictionary menu (#561). The app searches as the learner
types; the website searches on Enter so that each search is its own page.

- Source: #466 (search on Enter, not as you type).
- Check: `src/app/[locale]/dictionary/search/[query]/page.test.ts` checks the query the box
  redirects to (Search URLs, below); `apps/web/e2e/search.spec.ts`, "the dictionary home searches
  and lands on the canonical results page", submits `  IRU ` and checks the redirect to
  `/dictionary/search/iru/` and the prefilled box. That typing doesn't search:
  `src/components/dictionary/search-form.interaction.test.tsx`, "typing in the box searches nothing;
  the form submits it to the search page" (no request, navigation, or history entry however long it
  waits, and a plain `GET` form).

**Radical input.** The box's Radicals button finds a kanji by its radicals, as the app's panel
does, and a kanji picked there lists only its strongest matches ([Radical input](radical-input.md)).

**Which words are found.** The website runs a TypeScript port of the app's search retrieval, with
its queries and full-text indexes, on the app's data in the dictionary service. It finds what the
app finds for Japanese, kana, romaji (`raamen`, then the app's `rāmen` and the titles' `ramen`),
and English queries, inflected ones such as `食べた` or `見ない` included, and glosses for a long number
such as 9999999, which the app's stemmer shortens. `*` after a word matches any word it starts
(`t*`), and `^` before a word only a form's or meaning's first word. It lists at most 60 words.

- Source: App docs, Search; `LookupClient.swift`; ADR 0006, ADR 0008, and ADR 0009.
- Check: SR `results` (the first 10 IDs, in order), `resolution`, and `presentation`, for 39
  queries; `apps/dictionary-api/src/conformance/full-text.test.ts`, "a long number finds glosses,
  as FTS4 stems it"; SRR's `t*` and `^t*` cases, every row. The 60-word limit: SRR `results`,
  every row, for the 43 queries that reach it (い, `eat`, 見る, and others), and the rendered い
  and いる cases in `search-results.test.tsx`; SR records only the first 10 (`resultLimit: 10`).

**Sentence search.** A Japanese sentence that isn't a word the dictionary holds, such as
日本語を勉強する, lists its Discovered Words: each word the app's Sudachi finds in it, in order, as
the app does with its Japanese Text Analysis pack. The dictionary service runs the same Sudachi,
with the dictionary the app pins.

- Source: App docs, Search (Discovered Words); `results/results.ts` in the core, which the app
  runs too; `JapaneseMorphologyClient.swift`;
  ADR 0009 (the owner's decision to build what the website couldn't analyze before).
- Check: SSR, every field, for 325 sentences: the Discovered Words heading, each row with its chips,
  and the Example Sentences row; `apps/dictionary-api/src/conformance/sentence-search.test.ts`, "a
  word the dictionary holds is still searched as itself".

**Result order.** Words appear in the app's order: its retrieval, then equally strong matches
re-sorted by the default dictionaries, as the core's `orderedByFrequency` sorts them. Within each
match group (the result's source, then its coarse match rank), the more common tier from the first
dictionary that has one comes first, then JLPT's level (N5 first), then YouTube's rank (lower
first), a ranked word before an unranked one, then the retrieval order. So いる lists 要る, いる,
炒る, 入る, 射る, 鋳る, and `iru` lists 上一, 上一段, 上一段活用 (English matches for "iru"), then 要る,
いる, 炒る, 入る, as the app and the #462 design do. The frequency comes from the app's JLPT and
TUBELEX packs, read by the dictionary service for all of a search's results, one query per pack.

- Source: App docs, Search; `orderedByFrequency` in the core's `results/ordering.ts`; #462 (rows in
  the order the app shows with its default dictionaries).
- Check: SRR `results` (every row's ID, in order, with its `match` group and `retrievalOrder`) for
  63 queries, including `iru` and いる; `packages/dictionary-core/src/results/results.test.ts`,
  "orderedByFrequency (SearchResultFrequencyOrdering.ordered)"; smoke "iru shows the refinement and
  its first rows with their chips, as the app does", which reads the rows from SRR's `iru` case.

**Result count.** Above the results, a line reads "N words for «query»" (one word: "1 word"). N is
the number of words the search lists, at most 60; the kanji row isn't counted. The app shows no
count; the line follows the #462 design's wording.

- Source: #462 design.
- Check: the count line in `search-results.test.tsx`'s SRR cases. SRR `voiceOverCount` (the count
  VoiceOver reads, including the kanji row) is checked against the core's `resultCount`, which the
  page doesn't show.

**All at once.** A results page lists every word the search finds in its HTML, at most the app's
60, as the app's list does; nothing loads later.

- Source: `SearchResultsView.swift` (one list of up to 60); the owner's decision
  of 2026-09-29 (all at once, rather than #466's 25 and then load more).
- Check: `search-results.test.tsx`, the SRR cases (every SRR row rendered, in order); smoke "iru
  lists all its words at once, in the app's order", which reads iru's rows from SRR.

**Example Sentences row.** The results start with the app's "View N Example Sentences" row ("View
1 Example Sentence"; "View 50+ Example Sentences" over 50). N counts the sentences that contain the
query (see [Example Sentences section](#example-sentences-section)), or, for a deinflected or
romaji query such as `食べた` or `miru`, the examples of the primary entry (the result written as
the query, else the first), as its page lists them. With no example sentences, there's no row. A
query that finds example sentences but no words shows only this row and the sentences.

The app's row opens an Example Sentences screen. The website has no page for it (ADR 0010), so the
row opens the sentences where the site shows them:

- **The primary entry's Examples.** For a deinflected or romaji query, the row opens that word's
  page at its Examples section (`#examples`), which lists the same sentences.
- **The top word's Examples.** For any other Japanese query, the row opens the first result's page
  at its Examples section. That word's examples aren't always the sentences the row counts: いる's
  row counts the sentences that contain いる, and opens 要る's examples.
- **The page's own section.** For an English query, whose sentences aren't any one word's, and for
  a query whose sentences have no word page to open, the row leads down the results page to its
  [Example Sentences section](#example-sentences-section).

- Source: App docs, Search; the examples row of the core's `results/results.ts` and
  `artifact/search-examples.ts`, which the app's results screen reads too; ADR 0010 and
  the owner's decision on #544 (where the row leads, with no Example Sentences page).
- Check: SRR `examples` (title, count, and primary entry) and `sections` for all 63 queries;
  `search-results.test.tsx`, "shows the Example Sentences row, the reading refinement, then the
  rows in order with their chips", "shows only the Example Sentences when only sentences match",
  "an English search lists its Example Sentences below the words, and its row links down to them",
  and the row's title and link in the SRR cases; ES `count` and `title` for 69 queries;
  `search-examples.test.tsx` ("a search’s examples match its Example Sentences row"), which holds
  every SRR row to the sentences the service lists for it: as many as its count promises; where
  the row leads: `src/lib/dictionary/results/links.test.ts`, "where the Example Sentences row
  leads", and `data.test.ts`, "leads with the Example Sentences row: English lists them on the
  page, Japanese opens the top word’s"; `apps/web/e2e/word.spec.ts`, "a word's #examples opens the
  page at its Examples section"; smoke "iru shows "View 3 Example Sentences", linked to its word's
  examples, as the app does", which reads the title from SRR, and "eat leads with '…', linked to
  its Example Sentences on the page, as the app does".

**Reading refinement.** When an English-looking query also spells a Japanese reading the app
offers ("Search for「いる」" for `iru`), the page shows that row in its own section above the
results, and it opens that search.

- Source: App docs, Search ("a Japanese-reading refinement"); the reading-refinement section of
  `SearchResultsView.swift` (`search.reading-refinement`).
- Check: SR and SRR `readingRefinement`, SRR `sections`; `search-results.test.tsx`, "shows the
  Example Sentences row, the reading refinement, then the rows in order with their chips" (title and
  link) and the SRR cases (title); smoke (the row and its link).

**Kanji row.** A one-kanji query leads the list with a KANJI row: the kanji, the label "KANJI",
and the summary of the entry written as that kanji (the first result if none is), chosen before
the re-sort, or "Kanji detail" without results. The row opens in place to the kanji's
[details](#kanji-details), the screen the app's row opens, and closes again; the details are in
the page's HTML while closed. A kanji the dictionary has no details for, or whose details the
dictionary service couldn't answer, is a row that doesn't open.

- Source: App docs, Search ("a dedicated Kanji result for a single-kanji query"); `KanjiPrimaryRow`
  and `primaryEntry(for:)` in `SearchResultsView.swift` and `DictionaryEntry.swift`; ADR 0010 (a
  one-kanji search shows its kanji's details).
- Check: SRR `kanji` (character, label, summary, and entry) for 8 kanji, and whether each SRR case
  draws its kanji's details; `search-results.test.tsx`, "leads a one-kanji query with the KANJI
  row and its primary entry’s meaning", "the KANJI row opens to the kanji’s details when the
  dictionary has them", and the 日 case; `results.test.ts`, "leads a one-kanji query with the kanji
  row, from the entry written as the kanji"; `src/lib/dictionary/results/links.test.ts`, "gives the
  kanji row the kanji’s details, when the dictionary has them"; `data.test.ts`, "gives the kanji
  row the kanji’s details when the service has them"; `apps/web/e2e/kanji.spec.ts`, "the search
  page for 要 opens 要 to its stroke order, metrics, meanings, readings, and words"; smoke "要's
  search holds its kanji row and the kanji's details".

**Result rows.** Each row shows the headword with furigana, its meaning clamped to two lines, and
its frequency chips, and opens the word page. The meaning is the one that matched for an English
query, `café` too (`displaySummary`), and the word's summary otherwise.

At the app's accessibility text sizes the meaning isn't clamped (`ResultRow`'s `lineLimit`). The
browser's text size stands in for Dynamic Type: it sets the root font size (16px by default) as
Dynamic Type sets the app's body (17 pt by default). Every size past the app's largest standard
one (a 23 pt body) is an accessibility size, so the clamp lifts once the root font size passes
16px × 23 / 17, about 21.6px (Chrome's "Very large", 24px, lifts it; "Large", 20px, doesn't). The
`meaning-clamp` rule in `globals.css` computes this with CSS `sign()`; a browser without it keeps
two lines. Page zoom isn't text size and keeps the clamp.

- Source: App docs, Search ("English rows show the meaning that matched"); `ResultRow` in
  `ResultRow.swift` (`lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)`);
  `displaySummary` in `DictionaryEntry.swift`; #462.
- Check: SRR `results[].headword`, `reading`, and `summary`; `search-results.test.tsx` (each row's
  headword, meaning, and link in the SRR cases, and "clamps each meaning to two lines, and lifts the
  clamp with large text, as the app does", which evaluates the `meaning-clamp` rule at root font
  sizes on each side of the threshold); `results.test.ts`, "shows the meaning an English query
  matched"; headword furigana: `packages/dictionary-core/src/detail/ruby.test.ts`, "rubySegments";
  the links: `links.test.ts`; `café`'s words: `sentence-search.json`'s `café`, and
  `packages/dictionary-core/src/search/latin-text.test.ts`.

**Frequency chips.** A row has one chip per default dictionary that ranks or lists the word, as the
app picks them: `JLPT N5` when the JLPT list has it, and `YouTube 812` when TUBELEX ranks it. Each
chip has the app's colored dot for how common the word is: green, yellow, orange, red, or gray for
rare. Screen readers hear the tier after a rank, as the app's labels speak it.

- Source: App docs, Search; `frequencyLookupChips` in the core's `detail/frequency.ts`; the app
  draws a chip in `FrequencyRankChip.swift`.
- Check: SRR `results[].chips` (dictionary, text, and tier) for every row of 63 queries;
  `search-results.test.tsx` (the chips as rendered in the SRR cases); smoke (iru's chips);
  `packages/dictionary-core/src/detail/frequency.test.ts`, "shows only dictionaries that rank or
  list the word, since JLPT is a level list" and "tierForRank (FrequencyTier(rank:))".

**Frequency is JLPT and YouTube only.** The website uses the app's default frequency dictionaries,
JLPT Levels then YouTube (TUBELEX), and has no way to choose others. The #462 design's Anime chip
is left out.

- Source: #464 (phase 2 plan: frequency is JLPT and TUBELEX only, the app's default packs).
- Check: `packages/dictionary-core/src/detail/frequency.test.ts`, "lists each default dictionary,
  JLPT then YouTube"; WD `frequency`.

**No results.** When no word and no example sentence matches and the query isn't one kanji, the page
shows the app's "No Dictionary Matches", with nothing under it. A query of punctuation full-text
search treats specially, such as a stray double quote (`eat"`), shows the same page rather than an
error. So does a query over 200 characters, without searching: that is the dictionary service's
limit, and the app has none.

- Source: App docs, Search; `SearchView.swift` (`search.no-results`); #462 (`Empty` for no
  results); the 200-character limit: the dictionary service's request limit
  (`maximumQueryLength` in `packages/dictionary-core/src/artifact/dictionary.ts`).
- Check: SRR `state` (`qzxvkj`); `search-results.test.tsx`, "says No Dictionary Matches, as the app
  does, when nothing matches"; `apps/dictionary-api/src/conformance/full-text.test.ts`, "a stray
  double quote finds nothing, rather than failing"; `src/lib/dictionary/data.test.ts`, "finds
  nothing for a query past the service’s 200 characters, without asking it".

**Credits.** A results page that finds something ends with a Sources list: JMdict, KANJIDIC2, JLPT
vocabulary lists, and TUBELEX, each with its licence. When it shows a kanji's details, it adds
RADKFILE, KanjiVG when the details draw stroke order, and Kanjium; when it lists example sentences,
Tatoeba. Each credit is worded once, in the core's list, which the app's Credits & Attributions
shows too, and EDRDG's licence requires them, with links, on every page that shows JMdict,
KANJIDIC2, or RADKFILE data. The list sits in a Sources disclosure that starts closed; closed, its
credits and links stay in the page's HTML. The Sources page, `/sources/`, lists every credit the
core gives the website: those the pages show, and Sudachi and Kuromoji, which analyze text for them.
Jiten's carries its share-alike notice there too, under a sentence on how Zenbu converts them.

- Source: #465 (credit every source a page shows, on every page); #560 (closed by default); the
  EDRDG licence; the list, `packages/dictionary-core/src/sources/credits.ts`; which page credits
  what, `src/lib/dictionary/sources.ts`.
- Check: closed, in the page, then opened to its links: `apps/web/e2e/kanji.spec.ts`, "the search
  page for 要 credits KanjiVG and Kanjium for the kanji details". What a kanji's details and the
  sentences add: `src/lib/dictionary/sources.test.ts` ("withShownData, the credits for what a page
  shows"); `apps/web/e2e/kanji.spec.ts`, that test and "/dictionary/search/iru/, without kanji
  details, credits neither". The base list, with each licence, and none on a search that finds
  nothing: `src/app/[locale]/dictionary/search/[query]/page.test.ts`, "the results page’s Sources".
  The Sources page: `src/app/[locale]/sources/page.test.tsx` and `apps/web/e2e/sources.spec.ts`; the
  list: `packages/dictionary-core/src/sources/credits.test.ts`.

**Left out on purpose.** The website has no Recent list, camera button, or Image Search. It also
has no ✓ Known capsule and no swipe or long-press to mark a word known, since learner data lives in
the app.

- Source: #462 (Recent list and camera button left out; learner actions open a get-the-app prompt).
- Check: not applicable.

**Reading Aids on a row.** A row's headword has furigana while Show Furigana is on, and plain text
while it's off; with Show Romaji on, the row's reading in romaji is under it, as the app's result
rows draw it. The browse pages' rows are the same rows ([Site-wide](site-wide.md), Reading Aids).

- Source: `ResultRow.swift` and `JapaneseRubyText.swift`; the core's `romaji` (`detail/romaji.ts`).
- Check: `apps/web/e2e/reading-aids.spec.ts`, "Furigana off leaves the search results and a kanji’s
  words plain" and "Romaji shows under the headword, each example, the results, and a kanji’s
  readings".

## Example Sentences section

When a search's Example Sentences row has no word page to open (see [Search
results](#search-results)), the results page lists the search's sentences itself, in an Example
Sentences section below its results, at `#examples`. It lists what the app's Example Sentences
screen lists for the search. The app's screen is a page of its own; the website's isn't (ADR 0010).

**Which sentences.** An ASCII query matches the English side of every Tatoeba pair the app has
(232,703) as a phrase of stemmed words, never across the end of a sentence: `eat` finds "eats" and
"eating". When no sentence has the query's exact words, each word of a match must be the query's in
another form (plural, third person, past, or `ing`): `startled you` finds "startle you", and
`generously` finds nothing, though "generally" has its stem. `*` after a word matches any word it
starts (`t*`), and needs a sentence with the exact words; `^` before the first matches only a
sentence's first word (`^the`). Any other query matches the Japanese side as a substring, or, if
none has it, a query in other Latin letters than romaji's matches the English as typed, then
unaccented (`café`). A deinflected or romaji query (`食べた`, `miru`) lists its primary entry's
examples instead, the ones its word page lists; other lists stop at the app's 100. The dictionary
service runs the app's own search, SQL, and FTS4 indexes, so a search lists what the app lists
however many sentences it reads.

- Source: App docs, Search; the core's `artifact/example-search.ts` (`retrieveEnglish`) and
  `examples/english-inflection.ts`, which the app asks for the same sentences; ADR 0009 (the app's
  own data and queries in the dictionary service); #428 (the owner's decisions of 2026-10-12).
- Check: ES `ids` (every listed pair ID, in order) and `usesPrimaryEntryExamples` for 69 queries,
  including phrases, one in a form no sentence has (`startled you`), a word that only shares a stem
  (`generously`), apostrophes, hyphens, prefixes (`run*`, and `t*` with over 100,000 candidates),
  first words (`^tom`, and `^the` with about 70,000), a phrase ending in a prefix (`thank y*`), long
  numbers that FTS4's stemmer shortens, and refused queries, replayed by the service's example
  search conformance; the core's `examples/english-inflection.test.ts` and
  `artifact/example-search.test.ts`.

**Order.** English matches with the exact words come first, then those that match only once
stemmed; within each, by where the match starts, then the English sentence's length in words, the
Japanese sentence's length, and the pair ID. A Japanese query lists a sentence that is exactly the
query first, then the others by where the query starts, their length, and the pair ID.

- Source: `ExampleSentenceClient.swift` (`RankTuple`).
- Check: ES `ids`, in order, for 69 queries; the core's `artifact/example-search.test.ts`.

**Words.** Each sentence's words are underlined and linked as the app links them on its screen:
a word written as one of the primary entry's forms, or as the query, is that entry; any other word
resolves by its own forms, and one the app can't resolve to one entry opens a search for its
dictionary form. Words with one entry have furigana. The words that make up an occurrence of the
query are marked with the thicker underline; the app accents them in color. The app lists a
sentence's words in a Words menu beside it; the website links them inline in the sentence, as the
#462 design's examples do. A sentence breaks onto a new line only between its words, so no word
is split across two lines (#682).

- Source: `LinkedJapaneseText.swift` and `JapaneseExampleRowContent`'s `.dedicated` presentation
  in `ExampleSentencesView.swift`; the core's `accentedPositions` (which words are accented);
  `JapaneseTextAnalysisClient.swift`; #462 design (inline links in example sentences; the owner's
  decision on #831 keeps them here).
- Check: ES `shown[].tokens` (`surface`, `entry`, `candidates`, `queryMatch`) for the first 5
  sentences of each query; `search-examples.test.tsx` (each word, its mark, and furigana over
  linked kanji, in the ES cases, and "sits at #examples, titled with its count, and shows each
  one"); `data.test.ts`, "a search’s examples read the service, and load more for the same build"
  (each word linked by the slugs the service names); `apps/web/e2e/word.spec.ts`, "on a phone, an
  example sentence breaks only between its words".

**Translation, speaker, and credits.** Each sentence shows its translation and a speaker, as a word
page's examples do. No sentence is credited on its own: the page's Sources list credits Tatoeba.

- Source: `ExampleSentencesView.swift`; #560 (per-sentence credits removed, as the app has none).
- Check: ES `shown[].english`; `search-examples.test.tsx` (the translation), and "credits no single
  sentence, leaving Tatoeba to the page’s Sources".

**Paging.** The section renders its first 25 sentences, then loads 25 more at a time as the
learner scrolls, or with the Load more examples button, from
`/dictionary/search/<query>/examples.json?build=<build>&from=<n>`, named for the dictionary build
the page was rendered from. A click and the list scrolling into view at once load the next 25
once. When the dictionary has been updated since the page loaded, it says so and offers a reload.

- Source: #464 (25, then load more as you scroll), as on word pages.
- Check: `search-examples.test.tsx`, the ES cases (the first 25 rendered, then every later page the
  service answers, against ES `ids`); `data.test.ts`, "a search’s examples from another build load
  no more"; `src/app/[locale]/dictionary/search/[query]/examples.json/route.test.ts`;
  `packages/ui/src/dictionary/load-more.interaction.test.tsx` and `load-more.test.ts` (one
  request per page when a click and scrolling coincide); smoke "eat lists its example sentences
  on its page as the app does, 25 at a time", which reads the first sentence from ES.

**Title and count.** The section is titled Example Sentences. Under the title, a line says how
many sentences it lists ("60 examples"; "The first 100 of more than 100 examples" when more match
than the app's 100), as a word page's Examples section and the app's screen do. The app's screen
is titled with the query, which the results page already shows.

- Source: `ExampleSentencesView.swift` (its title, and its count line since #537); the owner's
  decision of 2026-09-29 (keep the count line the preview showed, and add it to the app).
- Check: ES `countText` for 59 queries, replayed by the service's example search conformance and
  rendered in the ES cases of `search-examples.test.tsx`, beside its "sits at #examples, titled
  with its count, and shows each one" and "says when it lists only the first 100 of more".

**No sentences.** A search without example sentences has no section, as it has no row.

- Source: the owner's decision on #831 (no empty Example Sentences screen).
- Check: `data.test.ts`, "a search without examples, or without a service, has none"; ES cases
  without sentences in `search-examples.test.tsx`.

**Reading Aids.** A sentence's linked words have furigana while Show Furigana is on. With Show
Romaji on, the sentence in romaji is under it, written by the core's `sentenceRomaji` over the
words the page shows, as the app writes it, or "Romaji unavailable for this text" when the core
can't write it. Show Sentence Translations shows or hides its English. Its words show no short
meanings, as the app's Example Sentences screen shows none. The service sends each sentence's
romaji with it (contract 7), so a page that loads more examples shows theirs too.

- Source: `LinkedJapaneseText.swift` and `ExampleSentencesView.swift` (the `.dedicated` rows);
  `PresentationCore.swift`, `romaji(of:)`.
- Check: `src/lib/dictionary/page-example.test.ts`, "the Example Sentences section shows no word
  meanings, as the app’s Example Sentences screen"; the word page's examples share the list, and
  its checks below. English example search needs the service, so no browser test reaches it.

## Word page

**Toolbar.** Share and a ••• menu sit at the end of the breadcrumb row, at every width; the page has
no title row above the header card. Share sends the headword, its reading, and the numbered
meanings, as the app's does, through the browser's share sheet; without one it copies the link. The
menu lists Mark as Known, Add to List…, Add Note, Add Photo, Open in App, and Copy Link. The learner
actions and Open in App open the get-the-app prompt, a dialog on wide screens and a drawer on
phones. The prompt says lists, Known, notes, and photos are in the Zenbu app, and that saving lists
and known words on this website comes later, which holds whether or not the site's account pages are
open ([Account pages](account.md)); it promises nothing for notes and photos, which stay on the
device ([Privacy Policy](privacy.md)). Open in App doesn't open the app yet (#829). Copy Link copies
the page URL and shows "Link copied". There is no back button; the breadcrumbs replace it.

- Source: App docs, Dictionary and kanji details (Share and the ••• menu); `SavedItemActions.swift`;
  #462 (toolbar and menu items, get-the-app prompt, `Sonner` for Link copied); #484 (breadcrumbs
  in place of the back button); #576 (no title row; the buttons moved to the breadcrumb row).
- Check: the share text: `packages/dictionary-core/src/detail/word.test.ts`, "要る (1546640)"; the
  buttons' place, at a desktop and a phone width: `apps/web/e2e/word.spec.ts`, "puts Share and More
  actions at the end of the breadcrumb row"; the menu and the prompt, at a desktop and a phone
  width: `apps/web/e2e/word.spec.ts`, "opens the More actions menu with the app's actions" and
  "copies the link from the More actions menu"; Share:
  `src/components/dictionary/item-actions.interaction.test.tsx`, "sends the page it is on".

**Header card.** The card shows the headword with furigana, the page's one `h1`. The heading's text
is the headword alone: each furigana reading is a `data-reading` attribute drawn with CSS
(`::before`), so the readings look the same but aren't in the text search engines read. The `h1`
keeps an `aria-label` of the headword, since the kanji toggles' labels ("要, よう") would otherwise
enter its name. Ruby elsewhere, such as in example sentences, keeps its readings as text. Beside it
is the pitch accent in a capsule that pronounces the word, or a standalone speaker when the word has
no pitch. Either uses the browser's Japanese voice. Under a separator, the part-of-speech row names
one word class and its modifiers, such as "Godan verb (intransitive)", and is left out when no class
has a name. It comes from the first sense's parts of speech, falling back to the entry's. For a word
with a conjugation table the row links to the page's Conjugations section (see Conjugations).

- Source: App docs, Dictionary and kanji details; the app's `WordHeadline.swift` and
  `PitchAccentBadge.swift`, which draw the core's `wordDetail`; `detail/part-of-speech.ts`;
  #462; #576 (the headword is the `h1`, with its readings out of its text).
- Check: WD `furigana`, `partOfSpeech`; `packages/dictionary-core/src/detail/word.test.ts`, "names
  one word class, then its modifiers" and "shows no part of speech when no class has a name";
  `src/components/dictionary/word-page.test.tsx`, "is the page heading, named for the headword
  whatever its furigana" and "shows a standalone speaker for a word without pitch";
  `apps/web/e2e/word.spec.ts`, "shows the word, its breadcrumb, and its meaning" (one `h1`, its
  name, its text, and its reading drawn by `::before`). Speaking:
  `src/components/dictionary/word-page.interaction.test.tsx`, "pronouncing the word" (the pitch
  capsule and the standalone speaker each say the reading, in `ja-JP`).

**Conjugations.** A verb or adjective the app conjugates (ichidan, godan, する, 来る, i- and
na-adjectives, but not いい) has a [Conjugations section](#conjugations-section) after Frequency,
closed when the page loads. The part-of-speech row links to it (`#conjugations`), which opens it,
as the app's row opens the table; the link opens it again after it's been closed, and an address
ending in `#conjugations` opens it on load. Its heading opens and closes it, and what it holds is
in the page's HTML while closed. The app pushes the table, and each form, as screens of their own;
the website has no page for either (ADR 0010). A word the app doesn't conjugate has a plain row and
no section.

- Source: App docs, Dictionary and kanji details (the conjugation table); `PartOfSpeechRow` in
  `WordDetailSections.swift` (a `NavigationLink`); the core's `detail/conjugation-table.ts`;
  ADR 0010 (the table on the word page).
- Check: WD `opensConjugations`, compared by the service's WD replay and drawn by Conjugations
  rendered; `src/components/dictionary/conjugations.test.tsx`, "starts closed, at #conjugations,
  with the table inside" and "the part-of-speech row links to it only when the word has a table";
  `src/components/dictionary/word-page.interaction.test.tsx`, "starts closed, and opens when the
  address names it" and "the part of speech opens it, and opens it again once it is closed";
  `src/app/[locale]/dictionary/[word]/page.test.tsx`, "a verb has a closed Conjugations section,
  which its part of speech links to" and "a noun has no Conjugations section";
  `apps/web/e2e/word.spec.ts`, "the part of speech opens the Conjugations section, again after it
  closes"; `apps/web/e2e/conjugations.spec.ts`, "opens from #conjugations on the Plain forms, and
  closes from its heading" and "a word without conjugations has no Conjugations section"; smoke "the
  part of speech opens conjugations where the app's does" and "見る's page holds its Conjugations
  section, its Examples, and 見's kanji details".

**Furigana.** Furigana places each kanji run's part of the reading over it, as the app does,
including the app's current split for 黄色い声. Words read as a whole, such as 今日, carry the
reading over the whole word.

- Source: App docs; `JapaneseRubyText.swift`; #499 (keep the app's furigana, including 黄色い声).
- Check: WD `furigana`, and WD rendered; `packages/dictionary-core/src/detail/ruby.test.ts`,
  "rubySegments".

**Per-kanji furigana highlight.** In the headword, each kanji of a run whose kanji readings split
its furigana exactly one way is a toggle: selecting it colors the kanji and its part of the furigana
in the app's blue accent color, not the site's primary (肉 and にく in 弱肉強食; #831 review). Selecting it
again clears the highlight; selecting another kanji moves it. The split uses each kanji's KANJIDIC2
on and kun readings with the sound changes compounds make (学校 is がっ・こう, 人々 is ひと・びと, 発表 is はっ・ぴょう).
A single kanji and a word read as a whole, such as 大人 or 今日, have no highlight. Other furigana on
the page (related words, examples) links instead, as in the app. Each toggle is a button labeled
with its kanji and reading (学, がっ), reachable by keyboard, and the color change doesn't animate when
the reader prefers reduced motion.

- Source: App docs index, Furigana kanji highlight; the core's `detail/kanji-split.ts`, which
  the app's `JapaneseRubyText.swift` draws.
- Check: WD `furigana[].kanjiReadings` (the gate compares the detail core's split, and WD rendered
  compares each toggle and its part of the drawn furigana);
  `packages/dictionary-core/src/detail/kanji-split.test.ts`;
  `src/components/dictionary/word-page.interaction.test.tsx`, "selecting a kanji highlights it and
  its kana; again clears it, another moves it"; smoke "学校's kanji each highlight their part of the
  furigana".

**Pitch accent.** Pitch is the word's own UniDic accent, never a homophone's, or CompoundPitch's for
a compound UniDic lacks; idioms, 〜的 words, expressions, and words with neither have none. It's drawn
as the app draws it: the reading in katakana, one mora wide each (one and a half for a combined mora
such as キョ), with a dot per mora at the top when high and the bottom when low, joined by a line, and
a hollow dot for the following particle. The capsule is one button that pronounces the word; screen
readers hear "Pronounce «reading». Pitch accent, downstep N, M mora", as the app's label and value
say it: M is the number of morae drawn, and N is never past them.

- Source: App docs, Dictionary and kanji details; `pitchGraph` in the core's `detail/pitch.ts`,
  which the app's `PitchAccentBadge.swift` draws; #462 design.
- Check: WD `pitch` (downstep, levels, mora count, particle, source, and `graph`: the morae and each
  dot's position and level); WD rendered reads each dot's position from the drawn SVG;
  `packages/dictionary-core/src/detail/pitch.test.ts`; `UniDicPitchTests`; `CompoundPitchRuleTests`;
  `packages/dictionary-core/src/detail/word.test.ts`, "shows CompoundPitch when UniDic has no pitch,
  and none when neither has"; smoke "見る's pitch graph and Frequency rows match the app".

**Section order.** Below the header card, sections appear in the app's order, with Conjugations
after Frequency: Meaning, Frequency, Conjugations, Alternatives, Kanji, Alternative kanji, Related
words, Lists, Notes, and Examples. A section with nothing to show is left out, except Meaning,
Frequency, Lists, Notes, and Examples.

- Source: App docs, Dictionary and kanji details; ADR 0010 (the Conjugations section, which the
  app opens from the part-of-speech row instead).
- Check: `packages/dictionary-core/src/detail/word.test.ts`, whose sections the page draws:
  `src/app/[locale]/dictionary/[word]/page.test.tsx`, "its sections follow the core".

**Meaning.** Senses are numbered, each with its notes, and under a meaning its first checked example
(JMdict's `JMdict_e_examp`), drawn as an Examples sentence is, in the page's HTML.

- Source: `MeaningSection` in `WordDetailSections.swift`; the owner's decision on #412.
- Check: WD `senses`, each meaning its recorded JMdict glosses, joined as JMdict joins them, and its
  `example`, which WD rendered reads back; `src/app/[locale]/dictionary/[word]/page.test.tsx` and
  `apps/web/e2e/word.spec.ts`, "a meaning shows its checked example under it".

**Frequency.** One row per default dictionary, JLPT then YouTube, with its dot and its level or
rank. A dictionary without the word says "Not listed" (JLPT) or "No rank" (YouTube). JLPT levels
are unofficial estimates, as the Sources list says.

- Source: App docs, Dictionary and kanji details; `frequencyLookupRow` in the core's
  `detail/frequency.ts`; #464 (JLPT and TUBELEX only).
- Check: WD `frequency`, and WD rendered (each row's name and value as listed);
  `packages/dictionary-core/src/detail/frequency.test.ts`, "lists each default dictionary, JLPT then
  YouTube" and "says what a dictionary lacks".

**Frequency Details.** Each Frequency row is a button that opens Frequency Details, as the app's
row does: a dialog on wide screens and a drawer on phones, closed with Done. It shows the
dictionary's name, domain, description, version, and source (from the app's
`FrequencyPackCatalog.json`), then a Level section with the word's JLPT level, or a Frequency
section with its rank and percentile ("#949", "Top 0.27%"), or, when the dictionary lacks the
word, why ("YouTube has no mapped frequency rank for this entry."). The app's Manage Frequency
Dictionaries button is left out, since the website uses the default dictionaries only.

- Source: App docs, Dictionary and kanji details; `FrequencyDisclosureView` and
  `FrequencyDisclosurePresentation` in `FrequencyDisclosure.swift`; `FrequencyPack.swift`; #464 (the
  default dictionaries only).
- Check: WD `frequency[].details` (the gate compares the detail core's, and WD rendered reads them
  back from the drawn details); `packages/dictionary-core/src/detail/frequency.test.ts`,
  "frequencyRowDetails (FrequencyDisclosurePresentation)", including "each pack’s disclosure is
  its manifest in the app’s FrequencyPackCatalog.json";
  `src/components/dictionary/word-page.interaction.test.tsx`, "selecting a row opens Frequency
  Details for that dictionary"; smoke "見る's pitch graph and Frequency rows match the app" (the
  rows open a dialog).

**Alternatives.** The other written forms on one line, then the other readings on another, with
their labels, leaving out Search only forms and repeats. A form with a kanji links to the search
for its first kanji, which leads with that kanji's row and its details, as the app's form line
opens that kanji.

- Source: `DictionaryEntry.alternativeForms`; `AlternativeFormsSection` in
  `WordDetailSections.swift`; ADR 0010 (a kanji's details open from its search).
- Check: WD `alternativeForms`; `packages/dictionary-core/src/detail/word.test.ts`, "leaves out
  Search only forms and repeats from the alternatives"; where a kanji links:
  `src/lib/dictionary/urls.test.ts`, "open the kanji’s search, which leads with its KANJI row". The
  link on the page: `src/app/[locale]/dictionary/[word]/page.test.tsx`, "a written form with a kanji
  links to the search for its first kanji".

**Kanji and Alternative kanji.** Kanji lists each kanji of the headword once; Alternative kanji
lists kanji from the other written forms that the headword lacks. Each row shows the kanji and its
first two meanings, and opens in place to the kanji's [details](#kanji-details), as the app's row
opens Kanji Detail; it closes again, and the details are in the page's HTML while closed. A kanji
the dictionary has no details for, or whose details the dictionary service couldn't answer, is a
row that doesn't open; the page shows without them rather than failing. The app shows the
character alone; the meanings follow the #462 design.

- Source: `DictionaryEntry.primaryKanji` and `alternativeKanji`; #462 design; ADR 0010 (the details
  on the word page).
- Check: WD `kanji`, `alternativeKanji` (the conformance test also checks the two meanings shown);
  `packages/dictionary-core/src/detail/word.test.ts`, "primaryKanji (DictionaryEntry.primaryKanji)"
  and "alternativeKanji (DictionaryEntry.alternativeKanji)";
  `src/app/[locale]/dictionary/[word]/page.test.tsx`, "a kanji the dictionary has details for opens
  to them; one without is a plain row"; `src/lib/dictionary/data.test.ts`, "a word’s kanji carry
  their details, when the dictionary has them" and "a word page whose kanji details fail still
  shows, with that kanji closed, and logs it"; `apps/web/e2e/word.spec.ts`, "opens and closes a
  kanji in the Kanji section"; `apps/web/e2e/kanji.spec.ts`, "the word page opens 要 to its stroke
  order, metrics, meanings, readings, and words"; smoke "見る's page holds its Conjugations section,
  its Examples, and 見's kanji details".

**Related words.** Each related word shows its headword with furigana, the relation, and its
summary, and opens its word page when it has one.

- Source: `RelationshipsSection` in `WordDetailSections.swift`.
- Check: WD `relatedWords`; the conformance test checks that every related word links to its page.

**Lists and Notes.** Each section shows a prompt, Add to List or Add Note, that opens the
get-the-app prompt. The app's ✓ Known capsule and encounter photo aren't shown.

- Source: #462 (learner sections as get-the-app prompts until #468); #468 leaves them, since
  signing in on the web doesn't make them work yet ([Account pages](account.md)).
- Check: `src/app/[locale]/dictionary/[word]/page.test.tsx`, "Lists and Notes each offer the action
  the app has, as a prompt"; `apps/web/e2e/word.spec.ts`, "Lists and Notes each open the get-the-app
  prompt", at a desktop and a phone width.

**Examples.** A word lists the same examples, in the same order, as the app's Word Detail: its
meanings' checked examples, then up to the app's 100 others. The page renders the first 25 and loads
25 more at a time as the learner scrolls, or with the Load more examples button. A line above the
list gives the count: "N examples", or "The first N of more than N examples" when there are more. A
word without examples says "No source-matched examples". The section is at `#examples`, where a
search's Example Sentences row opens it. A sentence counts in either width, Ｔシャツ or Tシャツ.

- Source: App docs, Dictionary and kanji details; the core's `artifact/example-retrieval.ts`; #464
  (25, then load more as you scroll, plus the total); #499 (readings share examples).
- Check: WD `examples` (`listed`, `reportedCount`, `truncated`, and the first 25 in `shown`);
  `src/lib/dictionary/data.test.ts`, "a word page shows its first 25 examples, and the rest load 25
  at a time"; `src/app/[locale]/dictionary/examples/[file]/route.test.ts`, "returns the next 25 of a
  word's examples" and "asks the dictionary for a position past the 100 sentences it matched";
  `packages/dictionary-core/src/detail/examples.test.ts`, "exampleCountText"; scrolling for more:
  `apps/web/e2e/word.spec.ts`, "loads more examples when the list reaches its end, then has no
  more"; `#examples`: `src/app/[locale]/dictionary/[word]/page.test.tsx`, "the Examples section sits
  at #examples, where search results send their sentences", and `apps/web/e2e/word.spec.ts`, "a
  word's #examples opens the page at its Examples section". The empty message:
  `src/app/[locale]/dictionary/[word]/page.test.tsx`, "a word without examples says so, in place of
  a list" (要所). Either width, and checked examples first: WD's Ｔシャツ, Ｈ, and ＮＧ, and
  `packages/dictionary-core/src/artifact/example-retrieval.test.ts`.

**Example words.** Each sentence shows each word underlined, as the app splits it; an inflected
verb or adjective is one word with its endings. A word that resolves to one entry has furigana and
opens its word page. A word the app can't resolve to one entry, such as だ, opens a search for its
dictionary form. The page's own word, in either width (Tシャツ on Ｔシャツ's), is marked with a
thicker underline; the app accents it in color. Split compounds such as 一日 have no marked word.

- Source: App docs, Dictionary and kanji details; `LinkedJapaneseText.swift`;
  `JapaneseTextAnalysisClient.swift`; #499 (split compounds don't highlight).
- Check: WD `examples.shown[].tokens` (`surface`, `entry`, `candidates`, `pageWord`);
  `packages/dictionary-core/src/examples/linking.test.ts`;
  `packages/dictionary-core/src/detail/examples.test.ts`, "links each word, with furigana over
  linked kanji only". The underline style: `apps/web/e2e/word.spec.ts`, "an example underlines
  the page's word more thickly than its other words" (2 pixels against 1).

**Example translation, speaker, and credits.** Each example shows its English translation and a
speaker that reads the sentence. Like the app, it doesn't credit each sentence: the page's Sources
list credits Tatoeba and its licence, CC BY 2.0 FR.

- Source: #560 (per-sentence credits, added under #465, removed as clutter).
- Check: `apps/web/e2e/word.spec.ts`, "credits no single example, and keeps its Sources closed
  until opened".

**Examples across a deploy.** A page loads later examples only from the dictionary build it was
rendered from. When the dictionary has been updated since, the page says "These examples have been
updated since the page loaded." and offers a reload.

- Source: website design (#464).
- Check: `src/lib/dictionary/data.test.ts`, "a page from another build doesn't load this build's
  examples"; `src/app/[locale]/dictionary/examples/[file]/route.test.ts`, "is not found for an
  unknown word or another build". The message and its reload:
  `packages/ui/src/dictionary/load-more.interaction.test.tsx`, "a stale page says the examples were
  updated, and its button reloads"; the stale answer: `src/lib/dictionary/page-fetch.test.ts`.

**Credits.** A word page ends with a Sources list: JMdict, UniDic, KANJIDIC2, JLPT vocabulary lists,
TUBELEX, and Tatoeba. When it can show a kanji's details, it adds RADKFILE, KanjiVG when any of them
draws stroke order, and Kanjium. The list starts closed, as a results page's does, with its credits
and links in the page's HTML.

- Source: #465; #560 (closed by default); `src/lib/dictionary/sources.ts`.
- Check: `src/app/[locale]/dictionary/[word]/page.test.tsx`, "credits the kanji data its details
  show" and "keeps its Sources closed, with every credit in the HTML"; `apps/web/e2e/word.spec.ts`,
  "credits no single example, and keeps its Sources closed until opened";
  `src/lib/dictionary/sources.test.ts`; `apps/web/e2e/kanji.spec.ts`, "the word page credits KanjiVG
  and Kanjium for the kanji details" and "/dictionary/いる-1577980/, without kanji details, credits
  neither". The base list, with each licence: `src/app/[locale]/dictionary/[word]/page.test.tsx`,
  "credits JMdict, UniDic, KANJIDIC2, the JLPT lists, TUBELEX, and Tatoeba, each with its licence".

**Reading Aids.** The headword has furigana while Show Furigana is on; while it's off the headword
is plain and its reading is under it, unless the two are the same. With Show Romaji on, the reading
in romaji is under the headword, after each reading among the other forms, and under each related
word. The examples, and each meaning's example, follow the Example Sentences section's aids, and
with Show Word Meanings on, a short meaning in the accent colour is under each word linked to one
entry, at most 6rem wide and cut with an ellipsis: the entry's first meaning shortened by the
core's `shortGloss`, as in the app, and none under a particle, an auxiliary, or a
symbol (`wordMeaning`, `examples/word-meaning.ts`). Every word counts as unknown: the website has no
known words yet.

- Source: `WordHeadline.swift`, `WordDetailSections.swift` (other forms, related words),
  `LinkedJapaneseText.swift` (`meaning(for:)`), and the core's `shortGloss` (`detail/text.ts`).
- Check: `src/app/[locale]/dictionary/[word]/page.test.tsx`, "draws every Reading Aid, and the page
  lets the settings show or hide each" (the reading and romaji under the headword, and each
  example's romaji, translation, and short meanings, as the service sends them);
  `packages/dictionary-core/src/detail/word.test.ts`, "要る: a linked word carries its short
  meaning…" and `packages/dictionary-core/src/examples/word-meaning.test.ts`;
  `apps/web/e2e/reading-aids.spec.ts`,
  "Furigana off leaves the word page’s headword plain, with its reading under it", "Word Meanings
  shows a short meaning under each word of the word page’s examples", and "Sentence Translations off
  hides each example’s English".

## Conjugations section

A word page's Conjugations section holds what the app's Conjugations screen, and each form's
screen, show. The app pushes them from Word Detail; the website opens them in place on the word
page (ADR 0010).

**Conjugation table.** The section starts with a one-line rule for how the word's class
conjugates. Plain and Polite tabs switch register when both exist (verbs); both registers' forms
are in the page's HTML, the one not shown hidden. The app's table screen first repeats the word,
its meaning, and its class; the section is under the word's own header, so it doesn't. Each row
names the form and shows it with the changed ending in the accent color, with furigana only when
the ending has kanji (来させる), and opens in place to that form. The website copies the app's
forms exactly, including its する rule, which appends できる to the noun for the potential (愛する
gives 愛できる), filed as app bug #521; the website changes with the app when it's fixed.

- Source: App docs, Dictionary and kanji details (the conjugation table); `ConjugationsView` in
  `ConjugationsView.swift`, which draws the core's `detail/conjugation.ts` (`rowFurigana`) and
  `detail/conjugation-table.ts`; ADR 0010.
- Check: WD `conjugations` (the summary, rule, registers, and each form's kind, title, surface,
  reading, ending, and row furigana), compared by the service's WD replay and drawn by
  Conjugations rendered, which reads back each register's rows and whether it's hidden;
  `src/components/dictionary/conjugations.test.tsx`, "shows the rule, the register control, and
  both registers’ rows, Polite hidden", "an adjective has no register control, and one register",
  and "shows furigana on a row only when its ending has kanji (来させる)";
  `src/components/dictionary/word-page.interaction.test.tsx`, "Polite switches register, and the
  other register stays in the page, hidden"; `apps/web/e2e/conjugations.spec.ts`, "the Polite tab
  shows the Polite forms in place of the Plain ones"; smoke "見る's conjugations and its past's
  examples match the app".

**Conjugated form.** A form's row opens in place, as the app pushes the form's screen, and closes
again. Screen readers hear the row as the form, its spelling, and its reading ("Past, 見た,
みた"). Opened, it says what the form means, then "Same spelling as …" when another form in the
register shares its spelling (potential and passive 見られる), then the form with furigana, its
ending highlighted, and a speaker.

- Source: `ConjugatedFormView` and `sharedSpellings(of:in:)` in `ConjugationsView.swift`; ADR 0010.
- Check: WD `conjugations` (each form's explanation, headline furigana, and shared spellings),
  compared by the service's WD replay and drawn by Conjugations rendered; `conjugations.test.tsx`,
  "each form is a closed row, named for its form, holding what the form means" and "a form says
  what it means, and which forms share its spelling"; `apps/web/e2e/conjugations.spec.ts`, "a form
  opens to its explanation, its pronounced form, and its examples".

**Conjugated form examples.** An opened form ends with Examples: every Example Sentence that uses
the complete form, as the app's screen lists them. That is the first 100 sentences the app's
search for the form finds (the sentence that is exactly the form first, then by where the form
first occurs, the sentence's length, and pair ID; a form that is ASCII once normalized, such as
Ｈ, searches the English translations, as the app does), keeping those whose words, as the
tokenizer and the app's inflection grouping split them, include the form: 見たかった and 見た目 aren't
examples of 見た. They load all at once from `/dictionary/conjugations/<form>.json` the first time
the form opens, so the page doesn't carry every form's examples; until then the form says
"Loading examples", and if they can't load, "Examples couldn’t load. Try again later." Each
example links its words as the app's screen does, with no page entry, and accents the words that
make up the form with the thicker underline; the translation and speaker are a word page's, with
no per-sentence credits. A form without examples says "No example sentences use this form yet." The
dictionary service runs the app's search and tokenizer for a form when it's first asked, and keeps
the list; like the app, it finds a form's examples by its spelling alone.

- Source: `ConjugatedForm.examples` in `ConjugationsView.swift`; `ExampleSentenceClient.search`
  (`retrieveJapanese`, `retrieveEnglish`); `JapaneseTextAnalysisClient.words`;
  the core's `accentedPositions`, which the app's `.conjugatedForm` presentation also draws;
  ADR 0009 (the app's analysis in the dictionary service); ADR 0010.
- Check: WD `conjugations[].examples` (every example's pair ID in order, and the first 3 with each
  word's entry or candidates and whether it's accented), recorded with the helpers the screen uses
  and compared by the service's WD replay (`detail.conformance.test.ts`), and drawn by Conjugations
  rendered, which reads back every pair ID and the first 3's words, links, and accents;
  `apps/dictionary-api/src/conformance/conjugation-examples.test.ts` ("a conjugated form's
  examples"); core `examples/forms.test.ts`, `artifact/word-examples.test.ts`;
  `conjugations.test.tsx`, "a form’s examples link each word and accent the form’s words";
  `src/lib/dictionary/data.test.ts`, "a conjugated form’s examples come from the service, all at
  once for its row" and "a form’s examples come from the fixtures without a service, all at once";
  `src/app/[locale]/dictionary/conjugations/[file]/route.test.ts`, "returns every one of a form's
  examples at once", "a form no sentence uses has no examples", and "reads the form as written, not
  normalized"; `word-page.interaction.test.tsx`, "a row opens its form, which loads its examples
  once, from the JSON route", "an opened form lists the examples its route returns", and "a form
  says so when its examples can’t load"; `apps/web/e2e/conjugations.spec.ts`, "a form opens to its
  explanation, its pronounced form, and its examples" and "a form without examples says so"; smoke
  "見る's conjugations and its past's examples match the app". WD has two forms that search English, Ｈ
  (which finds 3 examples) and ＮＧ (which finds none).

**Reading Aids.** A form's headline follows the word's headword: furigana, its reading under it
while furigana is off, and its romaji. A row that shows furigana shows its romaji too; the others
are plain, as in the app. A form's examples follow the word page's.

- Source: `ConjugationsView.swift` (`ConjugationRow`, `rowFurigana`, the form's `WordHeadline`).
- Check: `apps/web/e2e/reading-aids.spec.ts`, "Romaji shows under the headword, each example, the
  results, and a kanji’s readings" (a form's romaji).

## Kanji details

A kanji's details are what the app's Kanji Detail shows. They open in place from a word page's
Kanji and Alternative kanji rows, and from a one-kanji search's KANJI row, and are in the page's
HTML while closed. A kanji has no page of its own (ADR 0010). A page that shows a kanji's details
credits KANJIDIC2, RADKFILE, KanjiVG when it draws stroke order, Kanjium, and Waller's JLPT kanji
lists (CC BY) when a kanji shows a JLPT level (see each page's Credits; checked by
`src/lib/dictionary/sources.test.ts`, "withShownData").

**Header.** The kanji, then its metrics: strokes ("Stroke" for one), the grade when KANJIDIC2 has
one, and the JLPT level when Jonathan Waller's kanji lists give one. JLPT reads as the app writes
it, `N` and the level, so 一 and 日 show N5 and 要 shows N3. A kanji his lists leave out shows no
JLPT level, never KANJIDIC2's pre-2010 one: that includes 172 jōyō kanji, such as 分, that no
modern list gives a level. The meanings follow on one line.

- Source: `KanjiOverview` and `KanjiReferenceEntry.stats` in `KanjiDetailSections.swift`; the
  owner's comment on #614 (2026-10-06): "Kanji JLPT levels come from Jonathan Waller's kanji
  lists … This settles #485's level scale."
- Check: KD `strokeCount`, `grade`, `jlpt` (一, 日, 要, and 分), and `meanings`;
  `packages/dictionary-core/src/artifact/kanji-data.test.ts`, "a kanji’s JLPT level";
  `packages/dictionary-core/src/detail/kanji.test.ts`, "要" and "a kanji without elements lists
  its components; one stroke is singular"; `apps/web/e2e/kanji.spec.ts`, "the search page for 要
  opens 要 to its stroke order, metrics, meanings, readings, and words", and the same on the word
  page.

**Share and actions.** Beside the metrics, Share and a ••• menu, as the app's Kanji Detail has
them. Share sends the kanji, its readings, and its meanings, as the app's does, with the link to
the kanji's search page, the only URL a kanji has (ADR 0010). Without a share sheet it copies that
link. The menu is a word page's: Mark as Known, Add to List…, Add Note, Add Photo, Open in App,
and Copy Link, which copies the kanji's search page, not the page the details are on. The learner
actions and Open in App open the get-the-app prompt. Each button is named for its kanji ("Share
要", "More actions for 要"), since a word page can show several kanji's details.

- Source: App docs, Dictionary and kanji details (Share and the ••• menu); `KanjiDetailView.swift`
  (`SharedPage(kanji:page:)`); `SavedItemActions.swift` (`SharedPage`, `ShareButton`); #462 (the
  menu items and the get-the-app prompt).
- Check: the share text: `packages/dictionary-core/src/detail/kanji.test.ts`, "要"; Share:
  `src/components/dictionary/item-actions.interaction.test.tsx` ("a kanji's Share"), "sends
  the kanji, its share text, and its search page, not the page it is on" and "copies the kanji's
  search page where the browser has no share sheet"; the buttons' names:
  `src/components/dictionary/kanji-details.test.tsx`, "Share and More actions, named for the
  kanji"; the menu, the prompt, and Copy Link at a desktop and a phone width:
  `apps/web/e2e/kanji.spec.ts`, "…: 要's More actions offer the app's actions" (on the search and
  word pages) and "Copy Link copies 要's search page, from the word page too".

**Stroke order.** A kanji with a KanjiVG diagram has a stroke-order button under the glyph. It
opens a dialog, or a drawer on phones, that draws the strokes on a dashed grid and plays, pauses,
or steps through them, starting from the first stroke each time it opens, as the app's sheet does.
A kanji without a diagram has no button.

- Source: `KanjiStrokeOrderView.swift`; `components/dictionary/stroke-order.tsx`.
- Check: KD `hasStrokeOrder`, `strokeOrderStrokes`;
  `packages/dictionary-core/src/detail/strokes.test.ts`; `apps/web/e2e/kanji.spec.ts`, "shows the
  kanji's stroke order" (the dialog opens). Playing, pausing, and stepping, and starting again
  from the first stroke: `apps/web/e2e/kanji.spec.ts`, "steps, plays, and pauses the strokes, from
  the first each time it opens", on a browser clock the test pauses and moves on.

**Readings.** On, Kun, and Name readings, each with up to three of the kanji's words whose reading
starts with it, as "headword · summary". A row with words opens its first word's page, with a
chevron, as the app's row does; screen readers hear the app's label for it ("Kun reading い.る,
要る, to be needed, …"). A row without words opens nothing. The words aren't links of their own,
as in the app.

- Source: `KanjiReadingsSection` and `KanjiReadingRow` in `KanjiDetailSections.swift`; #462 (the
  row layout).
- Check: KD `readings`; `packages/dictionary-core/src/detail/kanji.test.ts`, "lists up to three
  words whose reading starts with the reading’s stem"; the rows:
  `packages/ui/src/dictionary/kanji-readings.test.tsx` ("the rendered kanji Readings rows match the
  app"), which draws every KD case's readings through the component and reads back each row's
  link, spoken label, and text. It reads the suite from the repository, so `pnpm test` runs it;
  `apps/web/e2e/kanji.spec.ts`, "a reading row opens its first word, named as the app's row
  is".

**Components and Elements.** Elements list each element with its role (Meaning / structure, Sound,
or Sound pattern) and up to three meanings, or its linked on-readings when it has none. Components
appear only for a kanji without elements. An element or component that is a kanji links to that
kanji's search, which leads with its row and details. The app also opens an element detail
screen; see [Required, not built yet](not-built-yet.md).

- Source: `kanjiElements` in the core's `detail/kanji.ts`, which the app's `KanjiElementsSection`
  (`KanjiDetailSections.swift`) draws.
- Check: KD `elements`, `components`; `packages/dictionary-core/src/detail/kanji.test.ts`,
  "kanjiElements (KanjiElementReferenceData.elements)" and "a kanji without elements lists its
  components; one stroke is singular"; the links: `src/lib/dictionary/data.test.ts`, "kanji details
  read the service, and link each kanji to its search".

**Lists and Notes.** After the elements and before the words, as in the app, the Lists and Notes
prompts a word page has: Add to List and Add Note, each opening the get-the-app prompt.

- Source: `KanjiDetailView.swift` (the `LISTS` and `NOTES` sections); #462 (learner sections as
  get-the-app prompts until #468).
- Check: `src/components/dictionary/kanji-details.test.tsx`, "Lists and Notes come after the
  elements and before the words, in the app's order" and "Lists and Notes offer the app, as on a
  word page"; `apps/web/e2e/kanji.spec.ts`, "Lists and Notes open the get-the-app prompt, as a word
  page's do".

**Words.** The app's 24 words containing the kanji, in the app's order, each with furigana and its
summary, opening its word page. A word keeps its headword on one line, and its summary wraps
beside it (#682).

- Source: `entries(containingKanji:)` in `LookupClient.swift`; `KanjiDetailView.swift`;
  `KanjiWordsSection` in `KanjiDetailSections.swift`.
- Check: KD `words`; `packages/dictionary-core/src/detail/kanji.test.ts`, "lists the app’s 24 words
  for 要, in its order"; the conformance test checks every listed word links to its page;
  `apps/web/e2e/kanji.spec.ts`, "on a phone, each of 要's words keeps its headword on one line".

**々 and other characters without a kanji screen.** 々 has no kanji details, as it has no Kanji
Detail in the app, so its row doesn't open.

- Source: #499.
- Check: KD case 々 (`opensDetail: false`).

**Reading Aids.** With Show Romaji on, each reading is in romaji under it, written by the core's
`romaji` from the reading as KANJIDIC gives it (い.る is i.ru), and each of the kanji's words has
furigana and its reading in romaji, as in the app.

- Source: `KanjiDetailSections.swift`.
- Check: `apps/web/e2e/reading-aids.spec.ts`, "Furigana off leaves the search results and a kanji’s
  words plain" and "Romaji shows under the headword, each example, the results, and a kanji’s
  readings".

## URLs, SEO, and indexing

**Word URLs.** A word lives at `/dictionary/<slug>-<ent_seq>/`, where the slug is the headword and
the JMdict entry number decides the word. Any other slug, a bare number, or a padded number
redirects (308) to the canonical URL in one hop. An unknown number returns 404, as do 0 and a
number past any JMdict entry.

- Source: ADR 0007; #465.
- Check: `src/lib/dictionary/urls.test.ts`, "word URLs (ADR 0007)"; smoke
  `308 /dictionary/1259290/ -> …` and `404 /dictionary/999999999/`;
  `apps/dictionary-api/src/app.test.ts`, "404s %s, which names nothing, as for an unknown one" (word
  0, and a number past any entry). The service names each word's slug with the same `wordSlug` when
  it answers, so a page and its links always agree.

**Retired word URLs.** A word whose entry was retired returns 410 Gone, or redirects (308) to its
replacement in one hop when the dictionary holds the replacement. Each language-data release
records the entries it drops (`language-data/retired-entries.md`).

- Source: ADR 0007; #465; #828.
- Check: `src/lib/dictionary/retired.test.ts`, "retiredWordResponse".

**Removed URLs.** The kanji, conjugation, and Example Sentences pages that came before ADR 0010
are gone, and their URLs redirect (308) to the nearest page:

- `/dictionary/kanji/<character>/` to the search for the kanji, `/dictionary/search/<character>/`,
  which leads with its row and details.
- `/dictionary/<slug>-<ent_seq>/conjugations/`, and each form under it, to the word page.
- `/dictionary/search/<query>/examples/` to the search's results page.

Each arrives in one hop from the URL as its sitemap listed it. An old URL that wasn't canonical
then takes a second hop, the one its new page makes: a conjugation URL with another slug or a bare
number, to the word's canonical URL; a compatibility ideograph's kanji URL, such as U+F928 (廊)'s,
to the search for its normalized form (U+5ECA), as every search's query is. A search for the word
"conjugations" is a search, not a removed page. The kanji and conjugations sitemaps answer 404.

- Source: ADR 0010; the owner's decision on #544 (308 to the nearest page).
- Check: `src/lib/moved-pages.test.ts`, "removedDictionaryPages, the pages the three page types
  replaced"; `apps/web/e2e/urls.spec.ts`, the one-hop redirects for each old URL,
  "/dictionary/search/conjugations/ is the search's own, not a removed conjugation page", and
  "/sitemaps/kanji.xml is 404" and "/sitemaps/conjugations.xml is 404"; smoke
  `308 /dictionary/kanji/%E8%A6%8B/ -> …`, the conjugation and Example Sentences 308s, and
  `404 /sitemaps/kanji.xml`.

**Locales.** Every dictionary page is also in Japanese, under `/ja/` ([Languages](languages.md)).
Every result is Japanese, whatever language the search is in, and its meanings are JMdict's English.

- Source: ADR 0007; ADR 0010; the owner's decisions on #544 and #847.
- Check: [Languages](languages.md), URLs and What each language shows.

**Search URLs.** A search lives at `/dictionary/search/<query>/`, at the query the core searches:
its `normalizeQuery` folds width and case and joins the words with one space, as in the app. Any
other form redirects (308) to it. Dots are encoded, so a query never looks like a file. `.` and
`..` can't be paths, so they stay on `/dictionary/search/` as finding nothing.

- Source: #466.
- Check: `src/app/[locale]/dictionary/search/[query]/page.test.ts`, "a search lives at the query the
  core searches"; `src/lib/dictionary/urls.test.ts`, "search URLs"; `apps/web/e2e/urls.spec.ts`,
  "/dictionary/search/IRU/ redirects to /dictionary/search/iru/ in one hop".

**Titles and descriptions.** Each page is its own canonical URL. Its title and description are
in [Titles, descriptions, and sharing](snippets.md).

- Source: #465 (metadata).
- Check: `apps/web/e2e/word.spec.ts`, "shows the word, its breadcrumb, and its meaning", and
  `apps/web/e2e/search.spec.ts`, "the dictionary home searches and lands on the canonical results
  page".

**Indexing.** The dictionary home, word pages, and results pages that list a word, or whose kanji
row shows the details of a kanji with meanings or readings, are indexable. A one-kanji search that
lists no word and whose kanji has no meanings or readings (about 475 of 13,108, such as 㐂), a
search that finds nothing or only example sentences, `/dictionary/search/` itself, the JSON routes
that load examples into a page (a word's, a search's, and a conjugated form's), and
`/dictionary/service.json` (whether the site reaches its dictionary service, for CI) are
`noindex`. Production is indexed; staging asks for a password first
([`staging-access.md`](../../../../docs/agents/staging-access.md)). Staging and production write
their canonical URLs on their own host: staging's canonical tags name
`https://staging.zenbujapanese.com` (smoke "canonical tags name …"); local development writes
production's.

- Source: #465; #466; the owner's decision of 2026-09-29 (a new dictionary page is indexed unless
  the SEO review takes it out); ADR 0010 (a kanji's details keep the rule the kanji page had).
- Check: smoke "a search that finds nothing is noindex, and a kanji's search is indexable", and in
  production, no `X-Robots-Tag` on 見る's page, 見's search, or eat's search; the JSON routes'
  `route.test.ts` files (`X-Robots-Tag: noindex`), including
  `src/app/[locale]/dictionary/conjugations/[file]/route.test.ts` and
  `src/app/dictionary/service.json/route.test.ts`; search pages:
  `src/lib/dictionary/results/links.test.ts`, "isIndexable".

**Sitemaps.** `robots.txt` names the sitemap index, `/sitemap-index.xml`, in every environment, and
`/sitemap.xml` redirects (308) to it. The index lists files at the site's root, each named for its
group: `/sitemap-pages.xml`, which lists the dictionary home and the browse home; the word
sitemaps, `/sitemap-words.xml`, `/sitemap-words-2.xml`, and on, with every word page's canonical
URLs ([Languages](languages.md#search-engines)); and the four browse sitemaps,
`/sitemap-kana.xml`, `/sitemap-categories.xml`, `/sitemap-frequency-lists.xml`, and
`/sitemap-kanji-lists.xml` ([Browse pages](browse.md#site-wide)). Each deploy writes the word and
browse sitemaps from its environment's dictionary build, so they answer even when the service can't
(ADR 0016). Every URL is on the environment's own host, so staging's name
`https://staging.zenbujapanese.com`, and the homepage is the origin with no slash. The old
`/sitemaps/pages.xml` and `/sitemaps/dictionary/<n>.xml` redirect (308) to them; the one browse
sitemap, `/sitemaps/browse.xml` (later `/sitemap-browse.xml`), is gone (404). Those are the
only dictionary sitemaps (ADR 0010, amended for #614). Search pages aren't in any sitemap yet.

- Source: ADR 0007; #465; ADR 0010; #663 (the SERP XML sitemaps standard); #805, ADR 0016.
- Check: `src/lib/dictionary/sitemaps.test.ts`, "are every word sitemap, then each browse sitemap,
  and nothing else" and "with SITE_ENV=… a request to … lists the written sitemaps on …";
  `src/lib/sitemap.test.ts`, "sitemap files sit at the root, named for their group";
  `src/lib/robots.test.ts`; `apps/web/e2e/sitemaps.spec.ts`; `apps/web/e2e/urls.spec.ts`, the old
  sitemaps' one-hop redirects, with and without a slash; smoke "$index lists the pages, tools, word, and browse sitemaps on …, and no other" and `308 /sitemap.xml -> /sitemap-index.xml`, "word sitemap lists 1 to
  50,000 canonical URLs", "robots.txt lists the sitemap index", and `404 /sitemaps/kanji.xml`.

**Structured data.** Each dictionary page carries `BreadcrumbList` structured data for its trail.

- Source: #484.
- Check: `apps/web/e2e/search.spec.ts`, "… carries its breadcrumb trail as BreadcrumbList
  structured data", on the dictionary home, a results page, and a word page: one list, with each
  crumb's name and URL, on the page's canonical host.

**Opening a link in the app.** On an iPhone with the Zenbu app installed, a search or word URL,
or a removed kanji URL, opens in the app (the [app's product docs](../../../ios/docs/product/dictionary.md#links-from-zenbujapanesecom)
say where), and without it, on the website, which redirects a kanji URL to the kanji's search.
`/.well-known/apple-app-site-association` says so: it names the app,
`<team ID>.com.zenbujapanese.dictionary`, and claims `/dictionary/search/?*`,
`/dictionary/kanji/?*`, and `/dictionary/*-*`, after excluding `/dictionary/*.json`, the JSON
routes that load more of a page. The pattern can't say that a word URL ends in digits, so any
other dictionary path with a dash, which the website answers 404, opens the app's Look Up screen.
The dictionary home and the site's other pages stay on the website. The file answers 200 as
`application/json` at that exact path, without a redirect, and 404 until the site has the Apple
team ID (`APPLE_TEAM_ID`, set by a person), so nothing claims the site's links before then.

- Source: #568, part of #563 (Tomodachi's "Open in Zenbu").
- Check: `src/lib/app-links.test.ts`, "appleAppSiteAssociationResponse"; `apps/web/e2e/urls.spec.ts`,
  "/.well-known/apple-app-site-association is JSON where Apple asks, claiming dictionary links for
  the app", on the production build. That iOS then opens the app is checked on a device.

## Required, not built yet (#831)

The #831 inventory's differences and the app features the owner's decision on #831 requires, each
with its app source and the check it will get, are in [Required, not built yet](not-built-yet.md).
