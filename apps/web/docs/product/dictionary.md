# Dictionary

The website's dictionary mirrors the app's [Dictionary](../../../ios/docs/product/dictionary.md).
Each behavior below says what the website does, where that behavior comes from, and the automated
check that enforces it (see [How behavior is verified](index.md#how-behavior-is-verified)).

The dictionary has three page types (ADR 0010): the [home](#dictionary-home), a search's
[results](#search-results), and a [word](#word-page). What the app opens from a word as screens of
its own, the conjugation table and its forms, a kanji's details, and the example sentences, is on
the word page, in sections that open and close and stay in the page's HTML while closed.

Abbreviations: **App docs** is `apps/ios/docs/product/dictionary.md`. Swift files are in
`apps/ios/Modules/Sources/SearchExperience/`. Web paths are under `apps/web/`; paths that start
with `packages/` or `apps/` are from the repository root. **SR**, **WD**, and **KD** are the
app-recorded suites `search-retrieval.json`, `word-detail.json`, and `kanji-detail.json`, with the
field they record. The dictionary service replays them on the app's own data: SR by
`apps/dictionary-api/src/conformance/search.conformance.test.ts` ("search conformance"), WD and KD
by `apps/dictionary-api/src/conformance/detail.conformance.test.ts` ("word and kanji detail
conformance"). **SRR** is `search-results.json`, the results screen after the frequency re-sort,
replayed field by field by `apps/dictionary-api/src/conformance/results.conformance.test.ts`
("search results conformance"), and rendered for seven of its cases by
`src/components/dictionary/search-results.test.tsx` ("the rendered search results page matches the
app"). **ES** is `example-search.json`, what the Example Sentences screen that Search's examples
row opens lists for 67 queries, replayed by
`apps/dictionary-api/src/conformance/example-search.conformance.test.ts` ("example search
conformance") and rendered for eight of its cases by
`src/components/dictionary/search-examples.test.tsx` ("the rendered Example Sentences section
matches the app"). **WD rendered** is `src/components/dictionary/word-page.test.tsx` ("the
rendered word page matches the app"), which draws every WD case through the word page's components
and reads back what they draw. **Conjugations rendered** is
`src/components/dictionary/conjugations.test.tsx` ("the rendered Conjugations section matches the
app"), which does the same for every WD case's conjugation table and its forms' examples. The
`Dictionary API` workflow runs the suites, then the rendered tests against the service it builds,
on pull requests that change the service, the core, the website's dictionary components or data
code, the app's bundled data, or the suites. Unit tests are named by file and test title.

## Dictionary home

**Search box.** `/dictionary/` is a heading, a one-line description, and the search box, focused
on load, centered a little above the middle of the screen, where the eye lands first. The box is a
text field and a Search button; it searches in Japanese, kana, romaji, or English. Submitting it
opens that query's results page.

- Source: #462 (the dictionary page is only a search box); #484 (the hero layout, the description,
  and the `Input` and `Button` form, which replaced #462's `InputGroup`).
- Check: smoke `200 /dictionary/`; `apps/web/e2e/search.spec.ts`, "the dictionary home searches
  and lands on the canonical results page" (the heading, the box, and submitting it). The layout: No
  automated check yet (#511).

**Breadcrumbs.** Every dictionary page starts with a breadcrumb trail under the site header:
Home › Dictionary on this page, then the page's own crumb on the others. The app has none.

- Source: #484.
- Check: `apps/web/e2e/word.spec.ts`, "shows the word, its breadcrumb, and its meaning".

## Search results

**Searching.** A search runs when the learner submits the box, not as they type. The box submits
to `/dictionary/search/?q=<query>`, which redirects (308) to the query's own results page. The
results page keeps its box under the breadcrumbs, filled with the query; word pages use the
header's search. The app searches as the learner types; the website searches on Enter so that
each search is its own page.

- Source: #466 (search on Enter, not as you type).
- Check: `src/lib/dictionary/urls.test.ts`, "search URLs", checks how a query is normalized and
  encoded into its path; `apps/web/e2e/search.spec.ts`, "the dictionary home searches and lands on
  the canonical results page", submits `  IRU ` and checks the redirect to `/dictionary/search/iru/`
  and the prefilled box. That typing doesn't search: No automated check yet (#511).

**Which words are found.** The website runs a TypeScript port of the app's search retrieval, with
the app's own queries and full-text indexes, on the app's own data in the dictionary service. It
finds what the app finds for Japanese, kana, romaji, and English queries, including inflected
queries such as `食べた` or `見ない`, and glosses for a long number such as 9999999, which the
app's stemmer shortens. `*` after a word matches any word it starts (`t*`), and `^` before a word
matches only a form's or meaning's first word, as in the app. It lists at most 60 words, the app's
limit.

- Source: App docs, Search; `LookupClient.swift`; ADR 0006, ADR 0008, and ADR 0009.
- Check: SR `results` (the first 10 IDs, in order), `resolution`, and `presentation`, for 30
  queries; `apps/dictionary-api/src/conformance/full-text.test.ts`, "a long number finds glosses,
  as FTS4 stems it"; SRR's `t*` and `^t*` cases, every row. The 60-word limit: SRR `results`,
  every row, for the 38 queries that reach it (い, `eat`, 見る, and others), and the rendered い
  and いる cases in `search-results.test.tsx`; SR records only the first 10 (`resultLimit: 10`).

**Sentence search.** A Japanese sentence that isn't a word the dictionary holds, such as
日本語を勉強する, lists its Discovered Words: each word the app's Sudachi finds in it, in order, as
the app does with its Japanese Text Analysis pack. The dictionary service runs the same Sudachi,
with the dictionary the app pins.

- Source: App docs, Search (Discovered Words); `SearchResultsView.swift` and `SearchResultsScreen.swift`;
  `JapaneseMorphologyClient.swift`;
  ADR 0009 (the owner's decision to build what the website couldn't analyze before).
- Check: `apps/dictionary-api/src/conformance/sentence-search.test.ts`, "「日本語を勉強する」 lists
  its words as Discovered Words" and "a word the dictionary holds is still searched as itself". SR
  records no sentence cases yet (none with the `analyzed` resolution): recording them needs the
  app's Japanese Text Analysis pack in the Simulator.

**Result order.** Words appear in the app's order: its retrieval, then equally strong matches
re-sorted by the default dictionaries, as `SearchResultFrequencyOrdering` sorts them. Within each
match group (the result's source, then its coarse match rank), the more common tier from the first
dictionary that has one comes first, then JLPT's level (N5 first), then YouTube's rank (lower
first), a ranked word before an unranked one, then the retrieval order. So いる lists 要る, いる,
炒る, 入る, 射る, 鋳る, and `iru` lists 上一, 上一段, 上一段活用 (English matches for "iru"), then 要る,
いる, 炒る, 入る, as the app and the #462 design do. The frequency comes from the app's JLPT and
TUBELEX packs, read by the dictionary service for all of a search's results, one query per pack.

- Source: App docs, Search; `SearchResultFrequencyOrdering.swift`; #462 (rows in
  the order the app shows with its default dictionaries).
- Check: SRR `results` (every row's ID, in order, with its `match` group and `retrievalOrder`) for
  54 queries, including `iru` and いる; `packages/dictionary-core/src/results/results.test.ts`,
  "orderedItems (SearchResultFrequencyOrdering.ordered)"; smoke "iru shows the refinement and its
  first rows with their chips, as the app does", which reads the rows from SRR's `iru` case.

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
the query, else the first), at most 100. With no example sentences, there's no row. A query that
finds example sentences but no words shows only this row and the sentences.

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

- Source: App docs, Search; the examples section of `SearchResultsView` and
  `SearchResultsScreen.exampleCount` and `exampleActionTitle` in `SearchResultsScreen.swift`; ADR 0010 and
  the owner's decision on #544 (where the row leads, with no Example Sentences page).
- Check: SRR `examples` (title, count, and primary entry) and `sections` for all 54 queries;
  `search-results.test.tsx`, "shows the Example Sentences row, the reading refinement, then the
  rows in order with their chips", "shows only the Example Sentences when only sentences match",
  "an English search lists its Example Sentences below the words, and its row links down to them",
  and the row's title and link in the SRR cases; ES `count` and `title` for 67 queries;
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

- Source: App docs, Search ("a dedicated Kanji result for a single-kanji query");
  `KanjiPrimaryRow` and `primaryEntry(for:)` in `SearchResultsView.swift` and `DictionaryEntry.swift`;
  ADR 0010 (a one-kanji search shows its kanji's details).
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
query (`displaySummary`), and the word's summary otherwise.

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
  headword, meaning, and link in the SRR cases, and "clamps each meaning to two lines, and lifts
  the clamp with large text, as the app does", which evaluates the `meaning-clamp` rule at root
  font sizes on each side of the threshold);
  `results.test.ts`, "shows the meaning an English query matched"; headword furigana:
  `packages/dictionary-core/src/detail/ruby.test.ts`, "rubySegments"; the links: `links.test.ts`.

**Frequency chips.** A row has one chip per default dictionary that ranks or lists the word, as the
app picks them: `JLPT N5` when the JLPT list has it, and `YouTube 812` when TUBELEX ranks it. Each
chip has the app's colored dot for how common the word is: green, yellow, orange, red, or gray for
rare. Screen readers hear the tier after a rank, as the app's labels speak it.

- Source: App docs, Search; `SearchFrequencyRankPresentationModel` in `FrequencyPresentation.swift`;
  `FrequencyRankChip.swift`.
- Check: SRR `results[].chips` (dictionary, text, and tier) for every row of 54 queries;
  `search-results.test.tsx` (the chips as rendered in the SRR cases); smoke (iru's chips);
  `packages/dictionary-core/src/detail/frequency.test.ts`, "shows only dictionaries that rank or
  list the word, since JLPT is a level list" and "tierForRank (FrequencyTier(rank:))".

**Frequency is JLPT and YouTube only.** The website uses the app's default frequency dictionaries,
JLPT Levels then YouTube (TUBELEX), and has no way to choose others. The #462 design's Anime chip
is left out.

- Source: #464 (phase 2 plan: frequency is JLPT and TUBELEX only, the app's default packs).
- Check: `packages/dictionary-core/src/detail/frequency.test.ts`, "lists each default dictionary,
  JLPT then YouTube"; WD `frequency`.

**No results.** When no word and no example sentence matches and the query isn't one kanji, the
page shows the app's "No Dictionary Matches" with its hint, "Try another Japanese or English
Search query." A query of punctuation full-text search treats specially, such as a stray double
quote (`eat"`), shows the same page rather than an error. So does a query over 200 characters,
without searching: that is the dictionary service's limit, and the app has none.

- Source: App docs, Search; `SearchView.swift` (`search.no-results`); #462 (`Empty` for no
  results); the 200-character limit: the dictionary service's request limit
  (`maximumQueryLength` in `packages/dictionary-core/src/artifact/dictionary.ts`).
- Check: SRR `state` (`qzxvkj`); `search-results.test.tsx`, "says No Dictionary Matches, as the app
  does, when nothing matches"; `apps/dictionary-api/src/conformance/full-text.test.ts`, "a stray
  double quote finds nothing, rather than failing"; `src/lib/dictionary/data.test.ts`, "finds
  nothing for a query past the service’s 200 characters, without asking it".

**Credits.** A results page that finds something ends with a Sources list: JMdict, KANJIDIC2, JLPT
levels, and TUBELEX, each with its licence. When it shows a kanji's details, it adds RADKFILE,
KanjiVG when the details draw stroke order, and Kanjium; when it lists example sentences, Tatoeba.
Every page's credits match the app's Credits & Attributions, and EDRDG's licence requires them,
with links, on every page that shows JMdict, KANJIDIC2, or RADKFILE data.

- Source: #465 (credit every source a page shows, on every page); `CreditsView.swift`; the EDRDG
  licence; `src/lib/dictionary/sources.ts`.
- Check: what a kanji's details and the sentences add: `src/lib/dictionary/sources.test.ts`
  ("withShownData, the credits for what a page shows"); `apps/web/e2e/kanji.spec.ts`, "the search
  page for 要 credits KanjiVG and Kanjium for the kanji details" and "/dictionary/search/iru/,
  without kanji details, credits neither". The base list: No automated check yet (#511).

**Left out on purpose.** The website has no Recent list, camera button, or Image Search. It also
has no ✓ Known capsule and no swipe or long-press to mark a word known, since learner data lives in
the app.

- Source: #462 (Recent list and camera button left out; learner actions open a get-the-app
  prompt).
- Check: not applicable.

## Example Sentences section

When a search's Example Sentences row has no word page to open (see
[Search results](#search-results)), the results page lists the search's sentences itself, in an
Example Sentences section below its results, at `#examples`. It lists what the app's Example
Sentences screen lists for the search. The app's screen is a page of its own; the website's isn't
(ADR 0010).

**Which sentences.** An ASCII query matches the English side of every Tatoeba pair the app has
(232,703) as a phrase of stemmed words, so `eat` finds "eats" and "eating", never across the end of
a sentence, and only when some sentence has the query's exact words. `*` after a word matches any
word it starts (`t*`), and `^` before the first matches only a sentence's first word (`^the`), as
FTS4 reads them. Any other query matches the Japanese side as a substring. A deinflected or romaji
query (`食べた`, `miru`) lists its primary entry's examples instead, the ones its word page lists.
At most the app's 100 are listed.

The dictionary service runs the app's own search, its SQL on the app's own FTS4 indexes, so a
search lists what the app lists however many sentences it reads.

- Source: App docs, Search; `ExampleSentenceClient.swift` (`search`, `examples`);
  `ExampleSentenceSearchRetrieval.swift` (`retrieveEnglish`, `retrieveJapanese`);
  `ExampleSentencesScreen.examples` in
  `ExampleSentencesView.swift`; ADR 0009 (the app's own data and queries in the dictionary
  service).
- Check: ES `ids` (every listed pair ID, in order) and `usesPrimaryEntryExamples` for 67 queries,
  including phrases, apostrophes, hyphens, prefixes (`run*`, and `t*` with over 100,000
  candidates), first words (`^tom`, and `^the` with about 70,000), a phrase ending in a prefix
  (`thank y*`), long numbers that FTS4's stemmer shortens, and refused queries, replayed by the
  service's example search conformance.

**Order.** English matches with the exact words come first, then those that match only once
stemmed; within each, by where the match starts, then the English sentence's length in words, the
Japanese sentence's length, and the pair ID. A Japanese query lists a sentence that is exactly the
query first, then the others by where the query starts, their length, and the pair ID.

- Source: `ExampleSentenceClient.swift` (`RankTuple`).
- Check: ES `ids`, in order, for 67 queries.

**Words.** Each sentence's words are underlined and linked as the app links them on its screen:
a word written as one of the primary entry's forms, or as the query, is that entry; any other word
resolves by its own forms, and one the app can't resolve to one entry opens a search for its
dictionary form. Words with one entry have furigana. The words that make up an occurrence of the
query are marked with the thicker underline; the app accents them in color. The app lists a
sentence's words in a Words menu beside it; the website links them inline in the sentence, as the
#462 design's examples do.

- Source: `LinkedJapaneseText.swift` and `JapaneseExampleRowContent`'s `.dedicated` presentation
  in `ExampleSentencesView.swift` (`ExampleSentencesScreen.queryScalarRanges`);
  `JapaneseTextAnalysisClient.swift`; #462 design (inline links in example sentences; the owner's
  decision on #511 keeps them here).
- Check: ES `shown[].tokens` (`surface`, `entry`, `candidates`, `queryMatch`) for the first 5
  sentences of each query; `search-examples.test.tsx` (each word, its mark, and furigana over
  linked kanji, in the ES cases, and "sits at #examples, titled with its count, and shows each
  one"); `data.test.ts`, "a search’s examples read the service, and load more for the same build"
  (each word linked by the slugs the service names).

**Translation, speaker, and credits.** Each sentence shows its translation and a speaker, and
credits both sides of its Tatoeba pair, as a word page's examples do.

- Source: `ExampleSentencesView.swift`; #465 (per-sentence attribution).
- Check: ES `shown[].english`; `search-examples.test.tsx` (the translation and credit).

**Paging.** The section renders its first 25 sentences, then loads 25 more at a time as the
learner scrolls, or with the Load more examples button, from
`/dictionary/search/<query>/examples.json?build=<build>&from=<n>`, named for the dictionary build
the page was rendered from. A click and the list scrolling into view at once load the next 25
once. When the dictionary has been updated since the page loaded, it says so and offers a reload.

- Source: #464 (25, then load more as you scroll), as on word pages.
- Check: `search-examples.test.tsx`, the ES cases (the first 25 rendered, then every later page
  the service answers, against ES `ids`); `data.test.ts`, "a search’s examples from another build
  load no more"; `src/app/dictionary/search/[query]/examples.json/route.test.ts`;
  `src/components/dictionary/load-more.interaction.test.tsx` and `load-more.test.ts` (one request
  per page when a click and scrolling coincide); smoke "eat lists its example sentences on its page
  as the app does, 25 at a time", which reads the first sentence from ES.

**Title and count.** The section is titled Example Sentences. Under the title, a line says how
many sentences it lists ("60 examples"; "The first 100 of more than 100 examples" when more match
than the app's 100), as a word page's Examples section does. The app's screen is titled with the
query, which the results page already shows, and has no count line.

- Source: `ExampleSentencesView.swift` (`navigationTitle(query.value)`); the owner's decision of
  2026-09-29 (keep the count line the preview showed), where the #511 review had chosen none;
  ADR 0010 (a section in place of the page).
- Check: `search-examples.test.tsx`, "sits at #examples, titled with its count, and shows each
  one" and "says when it lists only the first 100 of more".

**No sentences.** A search without example sentences has no section, as it has no row.

- Source: the owner's decision on #511 (no empty Example Sentences screen).
- Check: `data.test.ts`, "a search without examples, or without a service, has none"; ES cases
  without sentences in `search-examples.test.tsx`.

## Word page

**Toolbar.** The page's title is the headword, followed by Share and a ••• menu. Share sends the
headword, its reading, and the numbered meanings, as the app's does, through the browser's share
sheet; without one it copies the link. The menu lists Mark as Known, Add to List…, Add Note, Add
Photo, Open in App, and Copy Link. The learner actions and Open in App open the get-the-app prompt,
a dialog on wide screens and a drawer on phones. Open in App doesn't open the app yet (#467). Copy
Link copies the page URL and shows "Link copied". There is no back button; the breadcrumbs replace
it.

- Source: App docs, Dictionary and kanji details (Share and the ••• menu); `SavedItemActions.swift`;
  #462 (toolbar and menu items, get-the-app prompt, `Sonner` for Link copied); #484 (breadcrumbs
  in place of the back button).
- Check: the share text: `packages/dictionary-core/src/detail/word.test.ts`, "要る (1546640)"; the
  menu and the prompt, at a desktop and a phone width: `apps/web/e2e/word.spec.ts`, "opens the More
  actions menu with the app's actions" and "copies the link from the More actions menu"; Share:
  `src/components/dictionary/saved-item-actions.interaction.test.tsx`, "sends the page it is on".

**Header card.** The card shows the headword with furigana, and beside it the pitch accent in a
capsule that pronounces the word, or a standalone speaker when the word has no pitch. Either uses
the browser's Japanese voice. Under a separator, the part-of-speech row names one word class and
its modifiers, such as "Godan verb (intransitive)", and is left out when no class has a name. It
comes from the first sense's parts of speech, falling back to the entry's. For a word with a
conjugation table the row links to the page's Conjugations section (see Conjugations).

- Source: App docs, Dictionary and kanji details; `WordHeadline.swift` and
  `PitchAccentBadge.swift`; `PartOfSpeechFormatter.swift`; `DictionaryEntry.displayPartOfSpeech`;
  #462.
- Check: WD `furigana`, `partOfSpeech`; `packages/dictionary-core/src/detail/word.test.ts`, "names
  one word class, then its modifiers" and "shows no part of speech when no class has a name";
  `src/components/dictionary/word-page.test.tsx`, "shows a standalone speaker for a word without
  pitch". Speaking: No automated check yet (#511).

**Conjugations.** A verb or adjective the app conjugates (ichidan, godan, する, 来る, i- and
na-adjectives, but not いい) has a [Conjugations section](#conjugations-section) after Frequency,
closed when the page loads. The part-of-speech row links to it (`#conjugations`), which opens it,
as the app's row opens the table; the link opens it again after it's been closed, and an address
ending in `#conjugations` opens it on load. Its heading opens and closes it, and what it holds is
in the page's HTML while closed. The app pushes the table, and each form, as screens of their own;
the website has no page for either (ADR 0010). A word the app doesn't conjugate has a plain row and
no section.

- Source: App docs, Dictionary and kanji details (the conjugation table); `PartOfSpeechRow` in
  `WordDetailSections.swift` (a `NavigationLink`); `JapaneseConjugationClient.swift`
  (`JapaneseConjugator`); ADR 0010 (the table on the word page).
- Check: WD `opensConjugations`, compared by the service's WD replay and drawn by Conjugations
  rendered; `src/components/dictionary/conjugations.test.tsx`, "starts closed, at #conjugations,
  with the table inside" and "the part-of-speech row links to it only when the word has a table";
  `src/components/dictionary/word-page.interaction.test.tsx`, "starts closed, and opens when the
  address names it" and "the part of speech opens it, and opens it again once it is closed";
  `src/app/dictionary/[word]/page.test.tsx`, "a verb has a closed Conjugations section, which its
  part of speech links to" and "a noun has no Conjugations section"; `apps/web/e2e/word.spec.ts`,
  "the part of speech opens the Conjugations section, again after it closes";
  `apps/web/e2e/conjugations.spec.ts`, "opens from #conjugations on the Plain forms, and closes
  from its heading" and "a word without conjugations has no Conjugations section"; smoke "the part
  of speech opens conjugations where the app's does" and "見る's page holds its Conjugations
  section, its Examples, and 見's kanji details".

**Furigana.** Furigana places each kanji run's part of the reading over it, as the app does,
including the app's current split for 黄色い声. Words read as a whole, such as 今日, carry the
reading over the whole word.

- Source: App docs; `JapaneseRubyText.swift`; #499 (keep the app's furigana, including 黄色い声).
- Check: WD `furigana`, and WD rendered; `packages/dictionary-core/src/detail/ruby.test.ts`,
  "rubySegments".

**Per-kanji furigana highlight.** In the headword, each kanji of a run whose kanji readings split
its furigana exactly one way is a toggle: selecting it colors the kanji and its part of the furigana
in the app's blue accent color, not the site's primary (肉 and にく in 弱肉強食; #511 review). Selecting it
again clears the highlight; selecting another kanji moves it. The split uses each kanji's KANJIDIC2
on and kun readings with the sound changes compounds make (学校 is がっ・こう, 人々 is ひと・びと, 発表 is はっ・ぴょう).
A single kanji and a word read as a whole, such as 大人 or 今日, have no highlight. Other furigana on
the page (related words, examples) links instead, as in the app. Each toggle is a button labeled
with its kanji and reading (学, がっ), reachable by keyboard, and the color change doesn't animate when
the reader prefers reduced motion.

- Source: App docs index, Furigana kanji highlight; `KanjiReadingSplitter.swift`;
  `JapaneseRubyText.kanjiReadings`.
- Check: WD `furigana[].kanjiReadings` (the gate compares the detail core's split, and WD rendered
  compares each toggle and its part of the drawn furigana);
  `packages/dictionary-core/src/detail/kanji-split.test.ts`;
  `src/components/dictionary/word-page.interaction.test.tsx`, "selecting a kanji highlights it and
  its kana; again clears it, another moves it"; smoke "学校's kanji each highlight their part of the
  furigana".

**Pitch accent.** Pitch comes from UniDic, or for a two-part compound UniDic doesn't list whole,
such as 記者会見, from CompoundPitch; a word with neither shows no pitch. It is drawn as the app
draws it: the reading in katakana, one mora wide each (one and a half for a combined mora such as
キョ), with a dot per mora at the top when high and the bottom when low, joined by a line, and a
hollow dot for the following particle. The capsule is one button that pronounces the word; screen
readers hear "Pronounce «reading». Pitch accent, downstep N, M mora", as the app's label and value
say it: M is the source's mora count, even where it differs from the morae drawn (#511 review).

- Source: App docs, Dictionary and kanji details; `PitchAccentBadge` and `PitchContourLayout` in
  `PitchAccentBadge.swift`; #462 design.
- Check: WD `pitch` (downstep, levels, mora count, particle, source, and `graph`: the morae and each
  dot's position and level); WD rendered reads each dot's position from the drawn SVG;
  `packages/dictionary-core/src/detail/pitch.test.ts`;
  `packages/dictionary-core/src/detail/word.test.ts`, "shows CompoundPitch when UniDic has no pitch,
  and none when neither has"; smoke "見る's pitch graph and Frequency rows match the app".

**Section order.** Below the header card, sections appear in the app's order, with Conjugations
after Frequency: Meaning, Frequency, Conjugations, Alternatives, Kanji, Alternative kanji, Related
words, Lists, Notes, and Examples. A section with nothing to show is left out, except Meaning,
Frequency, Lists, Notes, and Examples.

- Source: App docs, Dictionary and kanji details; ADR 0010 (the Conjugations section, which the
  app opens from the part-of-speech row instead).
- Check: No automated check yet (#511).

**Meaning.** Senses are numbered, each with its notes.

- Source: `MeaningSection` in `WordDetailSections.swift`.
- Check: WD `senses`.

**Frequency.** One row per default dictionary, JLPT then YouTube, with its dot and its level or
rank. A dictionary without the word says "Not listed" (JLPT) or "No rank" (YouTube). JLPT levels
are unofficial estimates, as the Sources list says.

- Source: App docs, Dictionary and kanji details; `FrequencyPresentationModel` in
  `FrequencyPresentation.swift`; #464 (JLPT and TUBELEX only).
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

- Source: `DictionaryEntry.alternativeForms`; `AlternativeFormsSection` in `WordDetailSections.swift`;
  ADR 0010 (a kanji's details open from its search).
- Check: WD `alternativeForms`; `packages/dictionary-core/src/detail/word.test.ts`, "leaves out
  Search only forms and repeats from the alternatives"; where a kanji links:
  `src/lib/dictionary/urls.test.ts`, "open the kanji’s search, which leads with its KANJI row". The
  link on the page: No automated check yet (#511).

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
  `src/app/dictionary/[word]/page.test.tsx`, "a kanji the dictionary has details for opens to
  them; one without is a plain row"; `src/lib/dictionary/data.test.ts`, "a word’s kanji carry their
  details, when the dictionary has them" and "a word page whose kanji details fail still shows,
  with that kanji closed, and logs it"; `apps/web/e2e/word.spec.ts`, "opens and closes a kanji in
  the Kanji section"; `apps/web/e2e/kanji.spec.ts`, "the word page opens 要 to its stroke order,
  metrics, meanings, readings, and words"; smoke "見る's page holds its Conjugations section, its
  Examples, and 見's kanji details".

**Related words.** Each related word shows its headword with furigana, the relation, and its
summary, and opens its word page when it has one.

- Source: `RelationshipsSection` in `WordDetailSections.swift`.
- Check: WD `relatedWords`; the conformance test checks that every related word links to its page.

**Lists and Notes.** Each section shows a prompt, Add to List or Add Note, that opens the
get-the-app prompt. The app's ✓ Known capsule and encounter photo aren't shown.

- Source: #462 (learner sections as get-the-app prompts until #468).
- Check: No automated check yet (#511).

**Examples.** A word lists the same examples, in the same order, as the app's Word Detail, up to
the app's 100. The page renders the first 25 and loads 25 more at a time as the learner scrolls,
or with the Load more examples button. A line above the list gives the count: "N examples", or
"The first 100 of more than 100 examples" when the app found more than it lists. A word without
examples says "No source-matched examples". The section is at `#examples`, where a search's
Example Sentences row opens it.

- Source: App docs, Dictionary and kanji details; `ExampleSentenceEntryRetrieval.swift`; #464 (25, then
  load more as you scroll, plus the total); #499 (readings share examples, and headwords that
  change under NFKC, such as Ｔシャツ, have none, as in the app).
- Check: WD `examples` (`listed`, `reportedCount`, `truncated`, and the first 25 in `shown`);
  `src/lib/dictionary/data.test.ts`, "a word page shows its first 25 examples, and the rest load 25
  at a time"; `src/app/dictionary/examples/[file]/route.test.ts`, "returns the next 25 of a word's
  examples" and "is not found for %s" (a position past the app’s 100);
  `packages/dictionary-core/src/detail/examples.test.ts`, "exampleCountText"; loading more as the
  learner scrolls, in a browser: `apps/web/e2e/word.spec.ts`, "loads more examples when the list
  reaches its end, then has no more"; `#examples`: `src/app/dictionary/[word]/page.test.tsx`, "the
  Examples section sits at #examples, where search results send their sentences", and
  `apps/web/e2e/word.spec.ts`, "a word's #examples opens the page at its Examples section". The
  empty message: No automated check yet (#511).

**Example words.** Each sentence shows each word underlined, as the app splits it; an inflected
verb or adjective is one word with its endings. A word that resolves to one entry has furigana and
opens its word page. A word the app can't resolve to one entry, such as だ, opens a search for its
dictionary form. The page's own word is marked with a thicker underline; the app accents it in
color. Split compounds such as 一日 have no marked word, as in the app.

- Source: App docs, Dictionary and kanji details; `LinkedJapaneseText.swift`;
  `JapaneseTextAnalysisClient.swift`; #499 (split compounds don't highlight).
- Check: WD `examples.shown[].tokens` (`surface`, `entry`, `candidates`, `pageWord`);
  `packages/dictionary-core/src/examples/linking.test.ts`;
  `packages/dictionary-core/src/detail/examples.test.ts`, "links each word, with furigana over
  linked kanji only". The underline style: No automated check yet (#511).

**Example translation, speaker, and credits.** Each example shows its English translation and a
speaker that reads the sentence. Under it, each side of the Tatoeba pair is credited with its
sentence ID, linking to Tatoeba, its contributor, and its licence. The app doesn't credit each
sentence.

- Source: #465 (per-sentence attribution).
- Check: `packages/dictionary-core/src/detail/examples.test.ts`, "keeps the position, text,
  translation, and both sides’ attribution"; the conformance test checks each side's attribution is
  intact.

**Examples across a deploy.** A page loads later examples only from the dictionary build it was
rendered from. When the dictionary has been updated since, the page says "These examples have been
updated since the page loaded." and offers a reload.

- Source: website design (#464).
- Check: `src/lib/dictionary/data.test.ts`, "a page from another build doesn't load this build's
  examples"; `src/app/dictionary/examples/[file]/route.test.ts`, "is not found for an unknown word
  or another build". The message: No automated check yet (#511).

**Credits.** A word page ends with a Sources list: JMdict, UniDic, KANJIDIC2, JLPT levels, TUBELEX,
and Tatoeba. When it can show a kanji's details, it adds RADKFILE, KanjiVG when any of them draws
stroke order, and Kanjium.

- Source: #465; `src/lib/dictionary/sources.ts`.
- Check: `src/app/dictionary/[word]/page.test.tsx`, "credits the kanji data its details show";
  `src/lib/dictionary/sources.test.ts`; `apps/web/e2e/kanji.spec.ts`, "the word page credits
  KanjiVG and Kanjium for the kanji details" and "/dictionary/いる-1577980/, without kanji details,
  credits neither". The base list: No automated check yet (#511).

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
gives 愛できる); that is filed as app bug #521, and the website changes with the app when it is
fixed.

- Source: App docs, Dictionary and kanji details (the conjugation table); `ConjugationsView` in
  `ConjugationsView.swift` (`rowShowsFurigana`); `JapaneseConjugationClient.swift`
  (`JapaneseConjugator`); ADR 0010.
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
Ｈ, searches the English translations, as the app does), keeping those whose words, as Kuromoji
and the app's inflection grouping split them, include the form: 見たかった and 見た目 aren't
examples of 見た. They load all at once from `/dictionary/conjugations/<form>.json` the first time
the form opens, so the page doesn't carry every form's examples; until then the form says
"Loading examples", and if they can't load, "Examples couldn’t load. Try again later." Each
example links its words as the app's screen does, with no page entry, and accents the words that
make up the form with the thicker underline; the translation, speaker, and per-sentence credits
are a word page's. A form without examples says "No example sentences use this form yet." The
dictionary service runs the app's search and Kuromoji for a form when it's first asked, and keeps
the list; like the app, it finds a form's examples by its spelling alone.

- Source: `ConjugatedForm.examples` in `ConjugationsView.swift`; `ExampleSentenceClient.search`
  (`retrieveJapanese`, `retrieveEnglish`); `JapaneseTextAnalysisClient.words`;
  `LinkedJapaneseText.queryScalarRanges` and `matchesQuery` (the `.conjugatedForm` presentation);
  ADR 0009 (the app's analysis in the dictionary service); ADR 0010.
- Check: WD `conjugations[].examples` (every example's pair ID in order, and the first 3 with each
  word's entry or candidates and whether it's accented), recorded with the helpers the screen uses
  and compared by the service's WD replay (`detail.conformance.test.ts`), and drawn by
  Conjugations rendered, which reads back every pair ID and the first 3's words, links, and
  accents; `apps/dictionary-api/src/conformance/conjugation-examples.test.ts` ("a conjugated form's
  examples"); `packages/dictionary-core/src/examples/forms.test.ts`; `conjugations.test.tsx`, "a
  form’s examples link each word and accent the form’s words"; `src/lib/dictionary/data.test.ts`,
  "a conjugated form’s examples come from the service, all at once for its row" and "a form’s
  examples come from the fixtures without a service, all at once";
  `src/app/dictionary/conjugations/[file]/route.test.ts`, "returns every one of a form's examples
  at once", "a form no sentence uses has no examples", and "reads the form as written, not
  normalized"; `word-page.interaction.test.tsx`, "a row opens its form, which loads its examples
  once, from the JSON route", "an opened form lists the examples its route returns", and "a form
  says so when its examples can’t load"; `apps/web/e2e/conjugations.spec.ts`, "a form opens to its
  explanation, its pronounced form, and its examples" and "a form without examples says so"; smoke
  "見る's conjugations and its past's examples match the app". WD has two forms that search
  English, Ｈ (which finds 3 examples) and ＮＧ (which finds none).

## Kanji details

A kanji's details are what the app's Kanji Detail shows. They open in place from a word page's
Kanji and Alternative kanji rows, and from a one-kanji search's KANJI row, and are in the page's
HTML while closed. A kanji has no page of its own (ADR 0010). A page that shows a kanji's details
credits KANJIDIC2, RADKFILE, KanjiVG when it draws stroke order, and Kanjium (see each page's
Credits).

**Header.** The kanji, then its metrics: strokes ("Stroke" for one), and the grade and JLPT level
when KANJIDIC2 has them. JLPT reads as the app writes it, `N` and KANJIDIC2's level, so 要 shows
N2. The meanings follow on one line.

- Source: `KanjiOverview` in `KanjiDetailSections.swift`; #485 (the website shows JLPT as the app
  does).
- Check: KD `strokeCount`, `grade`, `meanings`; `packages/dictionary-core/src/detail/kanji.test.ts`,
  "要" and "a kanji without elements lists its components; one stroke is singular";
  `apps/web/e2e/kanji.spec.ts`, "the search page for 要 opens 要 to its stroke order, metrics,
  meanings, readings, and words", and the same on the word page. KD doesn't record JLPT.

**Share and actions.** Beside the metrics, Share and a ••• menu, as the app's Kanji Detail has
them. Share sends the kanji, its readings, and its meanings, as the app's does, with the link to
the kanji's search page, the only URL a kanji has (ADR 0010). Without a share sheet it copies that
link. The menu is a word page's: Mark as Known, Add to List…, Add Note, Add Photo, Open in App,
and Copy Link, which copies the kanji's search page, not the page the details are on. The learner
actions and Open in App open the get-the-app prompt. Each button is named for its kanji ("Share
要", "More actions for 要"), since a word page can show several kanji's details.

- Source: App docs, Dictionary and kanji details (Share and the ••• menu); `KanjiDetailView.swift`
  (`ShareLink(item: shareText)`, `SavedItemMenu`); `SavedItemActions.swift`; #462 (the menu
  items and the get-the-app prompt).
- Check: the share text: `packages/dictionary-core/src/detail/kanji.test.ts`, "要"; Share:
  `src/components/dictionary/saved-item-actions.interaction.test.tsx` ("a kanji's Share"), "sends
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
  kanji's stroke order" (the dialog opens). Playing and stepping: No automated check yet (#511).

**Readings.** On, Kun, and Name readings, each with up to three of the kanji's words whose reading
starts with it, as "headword · summary". A row with words opens its first word's page, with a
chevron, as the app's row does; screen readers hear the app's label for it ("Kun reading い.る,
要る, to be needed, …"). A row without words opens nothing. The words aren't links of their own,
as in the app.

- Source: `KanjiReadingsSection` and `KanjiReadingRow` in `KanjiDetailSections.swift`; #462 (the
  row layout).
- Check: KD `readings`; `packages/dictionary-core/src/detail/kanji.test.ts`, "lists up to three
  words whose reading starts with the reading’s stem"; the rows:
  `src/components/dictionary/kanji-readings.test.tsx` ("the rendered kanji Readings rows match the
  app"), which draws every KD case's readings through the component and reads back each row's
  link, spoken label, and text. It reads the suite from the repository, so `pnpm test` runs it;
  `apps/web/e2e/kanji.spec.ts`, "a reading row opens its first word, named as the app's row
  is".

**Components and Elements.** Elements list each element with its role (Meaning / structure, Sound,
or Sound pattern) and up to three meanings, or its linked on-readings when it has none. Components
appear only for a kanji without elements. An element or component that is a kanji links to that
kanji's search, which leads with its row and details. The app also opens an element detail
screen; see [Required, not built yet](#required-not-built-yet-511).

- Source: `KanjiElementsSection` in `KanjiDetailSections.swift`; `KanjiElementLookupClient.swift`.
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
summary, opening its word page.

- Source: `entries(containingKanji:)` in `LookupClient.swift`; `KanjiDetailView.swift`;
  `KanjiWordsSection` in `KanjiDetailSections.swift`.
- Check: KD `words`; `packages/dictionary-core/src/detail/kanji.test.ts`, "lists the app’s 24 words
  for 要, in its order"; the conformance test checks every listed word links to its page.

**々 and other characters without a kanji screen.** 々 has no kanji details, as it has no Kanji
Detail in the app, so its row doesn't open.

- Source: #499.
- Check: KD case 々 (`opensDetail: false`).

## Header, footer, and site-wide

**Header.** The 全 mark links home, with the site name beside it on wide screens. A header search
field appears on wide screens, and a search button on phones, except on the dictionary home and
search pages, which have their own box. The nav links Dictionary, About, and Support on wide
screens.

- Source: #462 design; #484.
- Check: smoke "the header links to the dictionary and has search". The layout: No automated check
  yet (#511).

**Current section.** The nav marks the section the page is in, as the #462 design marks
Dictionary: in the foreground color and medium weight, where the others are muted. Every page
under `/dictionary/` (search results and word pages) is in Dictionary; `/about/` and `/support/`
are their own. Home, the legal pages, and the other pages are in none. Screen readers hear the
link as the current page on the section's own page (`aria-current="page"`) and as current on the
pages under it (`aria-current="true"`).

- Source: #462 design; `components/site-nav.tsx`.
- Check: `src/components/site-header.test.tsx`, "the header nav marks the current section, as the
  #462 design does", which renders the header for dictionary, About, Support, and other paths;
  smoke "the header marks Dictionary current on the dictionary home".

**Get the app.** The button leads with a phone icon (lucide `Smartphone`), then "Get the app". It
leads to the home page until the App Store link is known. The #462 mockup draws the Apple logo;
lucide has no brand icons, and #511 asked for a phone.

- Source: #462 design; #511 (the phone icon).
- Check: `src/components/site-header.test.tsx`, "the Get the app button leads with a phone icon".

**Footer.** The footer links Dictionary, About and Support (on phones only), Contact, Legal
(`/legal/`), Privacy Policy, Terms of Use, DMCA Copyright Policy, Affiliate Disclosure, Sources,
and Sitemap, then the copyright line. Legal follows Contact, as in the #462 design. The #462
mockup's footer lists only Contact, Legal, Privacy, Terms, Sources, and Sitemap. Whether the
footer drops the other links is waiting on the owner's and Devin's decision (#511); until then it
keeps them.

- Source: #462 design (Contact, Legal, Privacy, Terms, Sources, Sitemap).
- Check: the Legal link: `src/components/site-footer.test.tsx`, "the footer links Legal after
  Contact, before the legal pages, as the #462 design does"; smoke "the footer links Legal". The
  other links: No automated check yet (#511).

**Reading Aids.** The website has no Reading Aids settings yet. It shows what the app shows with
its defaults: headwords and linked example words have furigana, examples show their translation,
and there is no romaji and no word meanings under example words. The settings are required; see
[Required, not built yet](#required-not-built-yet-511).

- Source: App docs index, Account (Reading Aids); `ReadingAidPreferences.swift` (the defaults).
- Check: No automated check yet (#511).

**App links.** The shipped iOS app and its App Store metadata link to `/privacy` and `/support`, so
both keep working. `/privacy` redirects (308) to `/legal/privacy/` in one hop, with its query, as
does `/privacy/`; `/support` redirects to `/support/`, as every page without its slash does.

- Source: the shipped app's links; the one hop found by the browser tests.
- Check: `src/lib/moved-pages.test.ts`; `apps/web/e2e/urls.spec.ts`, "/privacy redirects to the
  privacy policy in one hop" (on the production build) and "/support redirects to /support/ in one
  hop"; smoke `308 /privacy -> /legal/privacy/`.

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
replacement in one hop when the dictionary holds the replacement. No entry is recorded as retired
until #463 records retired entries in the app's data.

- Source: ADR 0007; #465.
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

**Locales.** The site displays in English, the only locale built. Another locale will put its
language identifier in front of `/dictionary/`, as `/{lang}/dictionary/…`; English has none. Every
result is Japanese, whatever language the search is in.

- Source: ADR 0007; ADR 0010; the owner's decision on #544.
- Check: not applicable until a second locale is built.

**Search URLs.** A search lives at `/dictionary/search/<query>/`. The query is NFKC-normalized,
lowercased, and has whitespace runs collapsed; any other form redirects (308) to it. Dots are
encoded, so a query never looks like a file. `.` and `..` can't be paths, so they stay on
`/dictionary/search/` as finding nothing.

- Source: #466.
- Check: `src/lib/dictionary/urls.test.ts`, "search URLs"; the redirect:
  `apps/web/e2e/urls.spec.ts`, "/dictionary/search/IRU/ redirects to /dictionary/search/iru/ in one
  hop".

**Titles and descriptions.** A word page is titled "要る (いる) meaning" and a results page
"«query» in Japanese", each followed by "| Zenbu Japanese". Each page is its own canonical URL.

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
`noindex`. Only production is indexed at all; staging sends `X-Robots-Tag: noindex` and disallows
crawling (see [`docs/agents/web.md`](../../../../docs/agents/web.md)).

- Source: #465; #466; the owner's decision of 2026-09-29 (a new dictionary page is indexed unless
  the SEO review takes it out); ADR 0010 (a kanji's details keep the rule the kanji page had).
- Check: smoke "a search that finds nothing is noindex, and a kanji's search is indexable", and in
  production, no `X-Robots-Tag` on 見る's page, 見's search, or eat's search; the JSON routes'
  `route.test.ts` files (`X-Robots-Tag: noindex`), including
  `src/app/dictionary/conjugations/[file]/route.test.ts` and
  `src/app/dictionary/service.json/route.test.ts`; search pages:
  `src/lib/dictionary/results/links.test.ts`, "isIndexable".

**Sitemaps.** The pages sitemap lists the dictionary home. The sitemap index also lists the word
sitemaps, with every word page's canonical URL. Those are the only dictionary sitemaps (ADR 0010).
Search pages aren't in any sitemap yet.

- Source: ADR 0007; #465; ADR 0010.
- Check: `src/lib/dictionary/sitemaps.test.ts`, "the index lists every word sitemap, and nothing
  else"; smoke "$index lists the pages and word sitemaps, and no kanji or conjugations sitemap"
  (for `/sitemap-index.xml` and `/sitemap.xml`), "word sitemap lists 1 to 50,000 canonical URLs",
  and `404 /sitemaps/kanji.xml`.

**Structured data.** Each dictionary page carries `BreadcrumbList` structured data for its trail.

- Source: #484.
- Check: No automated check yet (#511).

**Opening a link in the app.** On an iPhone with the Zenbu app installed, a search or word URL,
or a removed kanji URL, opens in the app (the [app's product docs](../../../ios/docs/product/dictionary.md#links-from-zenbujapanesecom)
say where), and without it, on the website, which redirects a kanji URL to the kanji's search.
`/.well-known/apple-app-site-association` says so: it names the app,
`<team ID>.com.zenbujapanese.app`, and claims `/dictionary/search/?*`,
`/dictionary/kanji/?*`, and `/dictionary/*-*`, after excluding `/dictionary/*.json`, the JSON
routes that load more of a page. The pattern can't say that a word URL ends in digits, so any
other dictionary path with a dash, which the website answers 404, opens the app's Search screen.
The dictionary home and the site's other pages stay on the website. The file answers 200 as
`application/json` at that exact path, without a redirect, and 404 until the site has the Apple
team ID (`APPLE_TEAM_ID`, set by a person), so nothing claims the site's links before then.

- Source: #568, part of #563 (Tomodachi's "Open in Zenbu").
- Check: `src/lib/app-links.test.ts`, "appleAppSiteAssociationResponse"; `apps/web/e2e/urls.spec.ts`,
  "/.well-known/apple-app-site-association is JSON where Apple asks, claiming dictionary links for
  the app", on the production build. That iOS then opens the app is checked on a device.

## Required, not built yet (#511)

These are the #511 inventory's rows marked differs or missing, and the app features the owner's
decision on #511 makes required. Each is written as the behavior the website must have, with the
app source it must match and the check it will get. When one is built, its entry moves into the
page's section above, with its check, in the same PR.

### Search results

**Handwriting and radical input.** The search box offers handwriting and radical selection, as the
app does.

- App source: App docs, Search; `HandwritingInputView.swift`, `OfflineHandwritingRecognizer.swift`,
  `RadicalInputView.swift`, `RadicalLookupClient.swift`.
- Check it will get: an app-recorded suite of radical selections and their candidate kanji, and
  handwriting samples and their candidates, replayed against the website.

**Radical searches keep the strongest matches.** A search started from radical input lists only
its leading group of equally strong matches, as the app limits it (`rankedEntryLimit`).

- App source: `SearchResultsView` and its `rankedEntryLimit` in `SearchResultsView.swift`.
- Check it will get: radical-origin cases in the planned search results suite, recording the rows
  the app lists.

### Kanji details

**Kanji element detail.** An element opens its element detail screen, as in the app.

- App source: `KanjiElementDetailView.swift`; `KanjiElementLookupClient.swift`.
- Check it will get: an app-recorded element-detail suite, and a rendered-page check.

### Site-wide

**Reading Aids.** The website offers the app's Reading Aids settings and applies them wherever the
app does:

- **Furigana** over headwords and linked words. With it off, a word page shows the reading under
  the headword instead, as in the app.
- **Romaji** alongside the Japanese on word pages, kanji details, and example sentences.
- **Word Meanings:** a short meaning under each linked word the learner hasn't marked known.
- **Sentence Translations:** whether examples show their English.
- **Hide Furigana on Known Words:** known words in examples lose their furigana.

The defaults are the app's: Furigana and Sentence Translations on, Romaji, Word Meanings, and Hide
Furigana on Known Words off. The app keeps the settings on the device; the website keeps them in
the browser until accounts exist.

Hide Furigana on Known Words depends on which words the learner knows, so it needs accounts (#468)
and ships with them. Furigana, Romaji, Word Meanings, and Sentence Translations can ship before
then: without an account every word counts as unknown, as it does in the app until the learner
marks it, so Word Meanings shows under every linked word.

- App source: App docs index, Account (Reading Aids); App docs, Dictionary and kanji details
  (furigana off, Word Meanings, Sentence Translations); `ReadingAidPreferences.swift`,
  `ReadingAidPresentation.swift`.
- Check it will get: a unit test pinning the defaults to `ReadingAidPreferences.swift`'s, and a
  rendered-page check of a word page (such as 見る) under each setting: ruby present or absent, the
  reading under the headword, romaji, meanings under example words, and translations. Hide Furigana
  on Known Words gets its check with #468.

### URLs and SEO

**Search sitemaps.** Child sitemaps list the canonical search URLs of a chosen query set (ADR
0007), and the sitemap index lists them.

- Source: #466, whose last open item this was; the route audit (#544) now decides which search
  pages stay indexable at all, and so whether any belong in a sitemap. #463 no longer supplies the
  query set (it dropped the precomputed search-sitemap queries with ADR 0009).
- Check it will get: a `sitemaps.test.ts` case and a smoke check.

**Structured data.** Word pages carry structured data beyond `BreadcrumbList`.

- Source: #465 (metadata and structured data).
- Check it will get: a rendered-HTML check of each page's JSON-LD.
