# Dictionary

The website's dictionary mirrors the app's [Dictionary](../../../ios/docs/product/dictionary.md).
Each behavior below says what the website does, where that behavior comes from, and the automated
check that enforces it (see [How behavior is verified](index.md#how-behavior-is-verified)).

Abbreviations: **App docs** is `apps/ios/docs/product/dictionary.md`. Swift files are in
`apps/ios/Modules/Sources/SearchExperience/`. Web paths are under `apps/web/`; paths that start
with `packages/` or `apps/` are from the repository root. **SR**, **WD**, and **KD** are the
app-recorded suites `search-retrieval.json`, `word-detail.json`, and `kanji-detail.json`, with the
field they record. The dictionary service replays them on the app's own data: SR by
`apps/dictionary-api/src/conformance/search.conformance.test.ts` ("search conformance"), WD and KD
by `apps/dictionary-api/src/conformance/detail.conformance.test.ts` ("word and kanji detail
conformance"). **SRR** is `search-results.json`, the results screen after the frequency re-sort,
replayed field by field by `apps/dictionary-api/src/conformance/results.conformance.test.ts`
("search results conformance"), and rendered for six of its cases by
`src/components/dictionary/search-results.test.tsx` ("the rendered search results page matches the
app"). **WD rendered** is `src/components/dictionary/word-page.test.tsx` ("the rendered word page
matches the app"), which draws every WD case through the word page's components and reads back
what they draw. The `Dictionary API` workflow runs the suites, then the rendered tests against the
service it builds, on pull requests that change the service, the core, the website's dictionary
components or data code, the app's bundled data, or the suites. Unit tests are named by file and
test title.

## Dictionary home

**Search box.** `/dictionary/` is a centered heading, a one-line description, and the search box,
focused on load. The box is a text field and a Search button; it searches in Japanese, kana,
romaji, or English. Submitting it opens that query's results page.

- Source: #462 (the dictionary page is only a search box); #484 (the hero layout, the description,
  and the `Input` and `Button` form, which replaced #462's `InputGroup`).
- Check: smoke `200 /dictionary/`. The layout: No automated check yet (#511).

**Breadcrumbs.** Every dictionary page starts with a breadcrumb trail under the site header:
Home › Dictionary on this page, then the page's own crumb on the others. The app has none.

- Source: #484.
- Check: No automated check yet (#511).

## Search results

**Searching.** A search runs when the learner submits the box, not as they type. The box submits
to `/dictionary/search/?q=<query>`, which redirects (308) to the query's own results page. The
results page keeps its box under the breadcrumbs, filled with the query; word and kanji pages use
the header's search. The app searches as the learner types; the website searches on Enter so that
each search is its own page.

- Source: #466 (search on Enter, not as you type).
- Check: `src/lib/dictionary/urls.test.ts`, "search URLs", checks only how a query is normalized
  and encoded into its path. Searching on Enter, the redirect from `?q=`, and the prefilled box:
  No automated check yet (#511).

**Which words are found.** The website runs a TypeScript port of the app's search retrieval, with
the app's own queries and full-text indexes, on the app's own data in the dictionary service. It
finds what the app finds for Japanese, kana, romaji, and English queries, including inflected
queries such as `食べた` or `見ない`, and glosses for a long number such as 9999999, which the
app's stemmer shortens. It lists at most 60 words, the app's limit.

- Source: App docs, Search; `LookupClient.swift`; ADR 0006, ADR 0008, and ADR 0009.
- Check: SR `results` (the first 10 IDs, in order), `resolution`, and `presentation`, for 30
  queries; `apps/dictionary-api/src/conformance/full-text.test.ts`, "a long number finds glosses,
  as FTS4 stems it". The 60-word limit: No automated check yet (#511); SR records only the first
  10 (`resultLimit: 10`).

**Sentence search.** A Japanese sentence that isn't a word the dictionary holds, such as
日本語を勉強する, lists its Discovered Words: each word the app's Sudachi finds in it, in order, as
the app does with its Japanese Text Analysis pack. The dictionary service runs the same Sudachi,
with the dictionary the app pins.

- Source: App docs, Search (Discovered Words); `SearchView.swift`; `JapaneseMorphologyClient.swift`;
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

- Source: App docs, Search; `SearchResultFrequencyOrdering` in `SearchView.swift`; #462 (rows in
  the order the app shows with its default dictionaries).
- Check: SRR `results` (every row's ID, in order, with its `match` group and `retrievalOrder`) for
  52 queries, including `iru` and いる; `packages/dictionary-core/src/results/results.test.ts`,
  "orderedItems (SearchResultFrequencyOrdering.ordered)"; smoke "iru shows the refinement and its
  first rows with their chips, as the app does", which reads the rows from SRR's `iru` case.

**Result count.** Above the results, a line reads "N words for «query»" (one word: "1 word"). N is
the number of words listed, at most 60; the kanji row isn't counted. The app shows no count; the
line follows the #462 design's wording.

- Source: #462 design.
- Check: No automated check yet (#511). SRR `voiceOverCount` (the count VoiceOver reads, including
  the kanji row) is checked against the core's `resultCount`, which the page doesn't show.

**Example Sentences row.** When the query has example sentences, the results list starts with
the app's row, "View 3 Example Sentences", or "View 50+ Example Sentences" over 50. It opens the
query's examples page, `/dictionary/search/<query>/examples/`, titled with the query: the
sentences that contain it, or the primary entry's for a romaji or deinflected query, in the app's
order, with each occurrence of the query accented, as the app's are (so a romaji query's
sentences have no accent). The page shows 25 first and loads the rest as it scrolls,
up to the app's 100, and ends with a Sources list: Tatoeba and JMdict. A query with sentences but
no words shows the row alone.

- Source: App docs, Search; the examples section of `SearchResultsView` in `SearchView.swift`;
  `ExampleSentencesView.swift`; `ExampleSentenceClient.swift` (`count`, `search`, and `examples`
  for the primary entry).
- Check: SRR `examples` (title, count, and primary entry) and the `examples` entry of SRR
  `sections`; `search-results.test.tsx`, "leads with the Example Sentences row, linked to the
  search’s examples page", and the row in the SRR cases;
  `src/components/dictionary/search-examples.test.tsx` ("the search examples page matches its
  Example Sentences row"), which holds every SRR row to the page it opens: as many examples as
  its count promises, 25 first, and a Japanese query accented in each of its own sentences;
  `src/app/dictionary/search/[query]/examples.json/route.test.ts`; smoke (eat's row and its page).
  The page's layout: No automated check yet (#511).

**Reading refinement.** When an English-looking query also spells a Japanese reading the app
offers ("Search for「いる」" for `iru`), the page shows that row in its own section above the
results, and it opens that search.

- Source: App docs, Search ("a Japanese-reading refinement"); the reading-refinement section of
  `SearchResultsView` in `SearchView.swift` (`search.reading-refinement`).
- Check: SR and SRR `readingRefinement`, SRR `sections`; `search-results.test.tsx`, "shows the
  reading refinement first, then the rows in order with their chips" (title and link) and the SRR
  cases (title); smoke (the row and its link).

**Kanji row.** A one-kanji query leads the list with a KANJI row: the kanji, the label "KANJI",
and the summary of the entry written as that kanji (the first result if none is), chosen before
the re-sort, or "Kanji detail" without results. It opens the kanji page when the kanji has one;
otherwise it shows without a link.

- Source: App docs, Search ("a dedicated Kanji result for a single-kanji query");
  `KanjiPrimaryRow` and `primaryEntry(for:)` in `SearchView.swift` and `DictionaryEntry.swift`.
- Check: SRR `kanji` (character, label, summary, and entry) for 8 kanji; `search-results.test.tsx`,
  "leads a one-kanji query with the KANJI row and its primary entry’s meaning" and the 日 case;
  `results.test.ts`, "leads a one-kanji query with the kanji row, from the entry written as the
  kanji"; `src/lib/dictionary/results/links.test.ts`, "links the kanji row only to a kanji page
  that exists".

**Result rows.** Each row shows the headword with furigana, its meaning clamped to two lines, and
its frequency chips, and opens the word page. The meaning is the one that matched for an English
query (`displaySummary`), and the word's summary otherwise.

- Source: App docs, Search ("English rows show the meaning that matched"); `ResultRow` in
  `SearchView.swift`; `displaySummary` in `DictionaryEntry.swift`; #462.
- Check: SRR `results[].headword`, `reading`, and `summary`; `search-results.test.tsx` (each row's
  headword, meaning, and link in the SRR cases, and "clamps each meaning to two lines");
  `results.test.ts`, "shows the meaning an English query matched"; headword furigana:
  `packages/dictionary-core/src/detail/ruby.test.ts`, "rubySegments"; the links: `links.test.ts`.

**Frequency chips.** A row has one chip per default dictionary that ranks or lists the word, as the
app picks them: `JLPT N5` when the JLPT list has it, and `YouTube 812` when TUBELEX ranks it. Each
chip has the app's colored dot for how common the word is: green, yellow, orange, red, or gray for
rare. Screen readers hear the tier after a rank, as the app's labels speak it.

- Source: App docs, Search; `SearchFrequencyRankPresentationModel` in `FrequencyPack.swift`;
  `FrequencyRankChip.swift`.
- Check: SRR `results[].chips` (dictionary, text, and tier) for every row of 52 queries;
  `search-results.test.tsx` (the chips as rendered in the SRR cases); smoke (iru's chips);
  `packages/dictionary-core/src/detail/frequency.test.ts`, "shows only dictionaries that rank or list the
  word, since JLPT is a level list" and "tierForRank (FrequencyTier(rank:))".

**Frequency is JLPT and YouTube only.** The website uses the app's default frequency dictionaries,
JLPT Levels then YouTube (TUBELEX), and has no way to choose others. The #462 design's Anime chip
is left out.

- Source: #464 (phase 2 plan: frequency is JLPT and TUBELEX only, the app's default packs).
- Check: `packages/dictionary-core/src/detail/frequency.test.ts`, "lists each default dictionary, JLPT then
  YouTube"; WD `frequency`.

**No results.** When nothing matches and the query isn't one kanji, the page shows the app's "No
Dictionary Matches" with its hint, "Try another Japanese or English Search query." A query of
punctuation full-text search treats specially, such as a stray double quote (`eat"`), shows the
same page rather than an error. So does a query over 200 characters, without searching: that is
the dictionary service's limit, and the app has none.

- Source: App docs, Search; `SearchView.swift` (`search.no-results`); #462 (`Empty` for no
  results); the 200-character limit: the dictionary service's request limit
  (`maximumQueryLength` in `packages/dictionary-core/src/artifact/dictionary.ts`).
- Check: SRR `state` (`qzxvkj`); `search-results.test.tsx`, "says No Dictionary Matches, as the app
  does, when nothing matches"; `apps/dictionary-api/src/conformance/full-text.test.ts`, "a stray
  double quote finds nothing, rather than failing"; `src/lib/dictionary/data.test.ts`, "finds
  nothing for a query past the service’s 200 characters, without asking it".

**Credits.** A results page that finds something ends with a Sources list: JMdict, KANJIDIC2, JLPT
levels, and TUBELEX, each with its licence.

- Source: #465 (credit every source a page shows, on every page); `src/lib/dictionary/sources.ts`.
- Check: No automated check yet (#511).

**Left out on purpose.** The website has no Recent list, camera button, or Image Search. It also
has no ✓ Known capsule and no swipe or long-press to mark a word known, since learner data lives in
the app.

- Source: #462 (Recent list and camera button left out; learner actions open a get-the-app
  prompt).
- Check: not applicable.

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
- Check: the share text: `packages/dictionary-core/src/detail/word.test.ts`, "要る (1546640)". The toolbar,
  menu, and prompt: No automated check yet (#511).

**Header card.** The card shows the headword with furigana, and beside it the pitch accent in a
capsule that pronounces the word, or a standalone speaker when the word has no pitch. Either uses
the browser's Japanese voice. Under a separator, the part-of-speech row names one word class and
its modifiers, such as "Godan verb (intransitive)", and is left out when no class has a name. It
comes from the first sense's parts of speech, falling back to the entry's. For a word with a
conjugation table the row is a button that opens it (see Conjugation table).

- Source: App docs, Dictionary and kanji details; `WordHeadline` and `PitchAccentBadge` in
  `WordDetailView.swift`; `PartOfSpeechFormatter.swift`; `DictionaryEntry.displayPartOfSpeech`;
  #462.
- Check: WD `furigana`, `partOfSpeech`; `packages/dictionary-core/src/detail/word.test.ts`, "names one word
  class, then its modifiers" and "shows no part of speech when no class has a name";
  `src/components/dictionary/word-page.test.tsx`, "shows a standalone speaker for a word without
  pitch". Speaking: No automated check yet (#511).

**Conjugation table.** For a verb or adjective the app conjugates (ichidan, godan, する, 来る, i-
and na-adjectives, but not いい), the part-of-speech row opens Conjugations: a dialog on wide
screens and a drawer on phones. It starts with the word (furigana with the kanji highlight, and
the pitch accent or speaker), its meaning, its word class, and a one-line rule for how the class
conjugates. A Plain/Polite control switches register when both exist (verbs). Each row names the
form and shows it with the changed ending in the accent color, with furigana only when the ending
has kanji (来させる). Selecting a row opens that form's screen in the same sheet, titled with the
form, with Back to the table: what the form means, "Same spelling as …" when another form in the
register shares its spelling (potential and passive 見られる), and the form with furigana, its
ending highlighted, and a speaker, then its Examples: every example sentence that uses the
complete form, as the app's does (the first 100 sentences containing the form, in the app's
Japanese retrieval order, in which Kuromoji with the app's inflection grouping finds the form as
one word), with the form accented, or "No example sentences use this form yet." They load when
the screen opens. The app pushes these screens instead of opening a sheet.
The website copies the app's forms exactly, including its する rule, which appends できる to the
noun for the potential (愛する gives 愛できる); that is filed as app bug #521, and the website
changes with the app when it is fixed.

- Source: App docs, Dictionary and kanji details (the conjugation table); `PartOfSpeechRow` in
  `WordDetailView.swift`; `ConjugationsView.swift` (`ConjugationsView`, `ConjugatedFormView`,
  `sharedSpellings(of:in:)`, `rowShowsFurigana`); `JapaneseConjugationClient.swift`
  (`JapaneseConjugator`).
- Check: WD `opensConjugations` and `conjugations` (the summary, rule, registers, and each form's
  kind, title, explanation, surface, reading, ending, row furigana, headline furigana, and shared
  spellings), compared by the service's WD replay, and drawn by
  `src/components/dictionary/conjugations.test.tsx` ("the rendered conjugation table matches the
  app") from the service, which reads back each row and each form's screen; the fixed-data tests
  in the same file; the form's examples:
  `apps/dictionary-api/src/conformance/conjugation-examples.test.ts` ("a conjugated form's
  examples") and `src/app/dictionary/conjugations/[file]/route.test.ts`, as WD doesn't record
  them yet;
  `src/components/dictionary/word-page.interaction.test.tsx`, "the part of speech opens it; Polite
  switches register; a row opens its form; Back returns"; smoke "the part of speech opens
  conjugations where the app's does".

**Furigana.** Furigana places each kanji run's part of the reading over it, as the app does,
including the app's current split for 黄色い声. Words read as a whole, such as 今日, carry the
reading over the whole word.

- Source: App docs; `JapaneseRubyText.swift`; #499 (keep the app's furigana, including 黄色い声).
- Check: WD `furigana`, and WD rendered; `packages/dictionary-core/src/detail/ruby.test.ts`,
  "rubySegments".

**Per-kanji furigana highlight.** In the headword, each kanji of a run whose kanji readings split
its furigana exactly one way is a toggle: selecting it colors the kanji and its part of the
furigana in the app's blue accent color, not the site's primary (肉 and にく in 弱肉強食; #511
review). Selecting it again clears the highlight; selecting another kanji moves it. The split uses each kanji's KANJIDIC2 on and kun
readings with the sound changes compounds make (学校 is がっ・こう, 人々 is ひと・びと, 発表 is
はっ・ぴょう). A single kanji and a word read as a whole, such as 大人 or 今日, have no highlight.
Other furigana on the page (related words, examples) links instead, as in the app. Each toggle is a
button labeled with its kanji and reading (学, がっ), reachable by keyboard, and the color change
doesn't animate when the reader prefers reduced motion.

- Source: App docs index, Furigana kanji highlight; `KanjiReadingSplitter.swift`;
  `JapaneseRubyText.kanjiReadings`.
- Check: WD `furigana[].kanjiReadings` (the gate compares the detail core's split, and WD rendered
  compares each toggle and its part of the drawn furigana); `packages/dictionary-core/src/detail/kanji-split.test.ts`; `src/components/dictionary/word-page.interaction.test.tsx`, "selecting a
  kanji highlights it and its kana; again clears it, another moves it"; smoke "学校's kanji each
  highlight their part of the furigana".

**Pitch accent.** Pitch comes from UniDic, or for a two-part compound UniDic doesn't list whole,
such as 記者会見, from CompoundPitch; a word with neither shows no pitch. It is drawn as the app
draws it: the reading in katakana, one mora wide each (one and a half for a combined mora such as
キョ), with a dot per mora at the top when high and the bottom when low, joined by a line, and a
hollow dot for the following particle. The capsule is one button that pronounces the word; screen
readers hear "Pronounce «reading». Pitch accent, downstep N, M mora", as the app's label and value
say it: M is the source's mora count, even where it differs from the morae drawn (#511 review).

- Source: App docs, Dictionary and kanji details; `PitchAccentBadge` and `PitchContourLayout` in
  `WordDetailView.swift`; #462 design.
- Check: WD `pitch` (downstep, levels, mora count, particle, source, and `graph`: the morae and
  each dot's position and level); WD rendered reads each dot's position from the drawn SVG;
  `packages/dictionary-core/src/detail/pitch.test.ts`; `packages/dictionary-core/src/detail/word.test.ts`, "shows
  CompoundPitch when UniDic has no pitch, and none when neither has"; smoke "見る's pitch graph and
  Frequency rows match the app".

**Section order.** Below the header card, sections appear in the app's order: Meaning, Frequency,
Alternatives, Kanji, Alternative kanji, Related words, Lists, Notes, and Examples. A section with
nothing to show is left out, except Meaning, Frequency, Lists, Notes, and Examples.

- Source: App docs, Dictionary and kanji details.
- Check: No automated check yet (#511).

**Meaning.** Senses are numbered, each with its notes.

- Source: `WordDetailView.swift`.
- Check: WD `senses`.

**Frequency.** One row per default dictionary, JLPT then YouTube, with its dot and its level or
rank. A dictionary without the word says "Not listed" (JLPT) or "No rank" (YouTube). JLPT levels
are unofficial estimates, as the Sources list says.

- Source: App docs, Dictionary and kanji details; `FrequencyPresentationModel` in
  `FrequencyPack.swift`; #464 (JLPT and TUBELEX only).
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
  `FrequencyDisclosurePresentation` in `WordDetailView.swift`; `FrequencyPack.swift`; #464 (the
  default dictionaries only).
- Check: WD `frequency[].details` (the gate compares the detail core's, and WD rendered reads them
  back from the drawn details); `packages/dictionary-core/src/detail/frequency.test.ts`,
  "frequencyRowDetails (FrequencyDisclosurePresentation)", including "each pack’s disclosure is
  its manifest in the app’s FrequencyPackCatalog.json";
  `src/components/dictionary/word-page.interaction.test.tsx`, "selecting a row opens Frequency
  Details for that dictionary"; smoke "見る's pitch graph and Frequency rows match the app" (the
  rows open a dialog).

**Alternatives.** The other written forms on one line, then the other readings on another, with
their labels, leaving out Search only forms and repeats. A form with a kanji links to its first
kanji's page, as the app's form line opens that kanji.

- Source: `DictionaryEntry.alternativeForms`; `AlternativeFormsSection` in `WordDetailView.swift`.
- Check: WD `alternativeForms`; `packages/dictionary-core/src/detail/word.test.ts`, "leaves out Search only
  forms and repeats from the alternatives". The link: No automated check yet (#511).

**Kanji and Alternative kanji.** Kanji lists each kanji of the headword once; Alternative kanji
lists kanji from the other written forms that the headword lacks. Each row shows the kanji and its
first two meanings, and opens its kanji page when it has one. The app shows the character alone;
the meanings follow the #462 design.

- Source: `DictionaryEntry.primaryKanji` and `alternativeKanji`; #462 design.
- Check: WD `kanji`, `alternativeKanji` (the conformance test also checks the two meanings shown);
  `packages/dictionary-core/src/detail/word.test.ts`, "primaryKanji (DictionaryEntry.primaryKanji)" and
  "alternativeKanji (DictionaryEntry.alternativeKanji)".

**Related words.** Each related word shows its headword with furigana, the relation, and its
summary, and opens its word page when it has one.

- Source: `RelationshipsSection` in `WordDetailView.swift`.
- Check: WD `relatedWords`; the conformance test checks that every related word links to its page.

**Lists and Notes.** Each section shows a prompt, Add to List or Add Note, that opens the
get-the-app prompt. The app's ✓ Known capsule and encounter photo aren't shown.

- Source: #462 (learner sections as get-the-app prompts until #468).
- Check: No automated check yet (#511).

**Examples.** A word lists the same examples, in the same order, as the app's Word Detail, up to
the app's 100. The page renders the first 25 and loads 25 more at a time as the learner scrolls,
or with the Load more examples button. A line above the list gives the count: "N examples", or
"The first 100 of more than 100 examples" when the app found more than it lists. A word without
examples says "No source-matched examples".

- Source: App docs, Dictionary and kanji details; `ExampleSentenceClient.swift`; #464 (25, then
  load more as you scroll, plus the total); #499 (readings share examples, and headwords that
  change under NFKC, such as Ｔシャツ, have none, as in the app).
- Check: WD `examples` (`listed`, `reportedCount`, `truncated`, and the first 25 in `shown`);
  `src/lib/dictionary/data.test.ts`, "a word page shows its first 25 examples, and the rest load 25
  at a time"; `src/app/dictionary/examples/[file]/route.test.ts`, "returns the next 25 of a word's
  examples" and "is not found for %s" (a position past the app’s 100);
  `packages/dictionary-core/src/detail/examples.test.ts`, "exampleCountText". The empty message: No
  automated check yet (#511).

**Example words.** Each sentence shows each word underlined, as the app splits it; an inflected
verb or adjective is one word with its endings. A word that resolves to one entry has furigana and
opens its word page. A word the app can't resolve to one entry, such as だ, opens a search for its
dictionary form. The page's own word is marked with a thicker underline; the app accents it in
color. Split compounds such as 一日 have no marked word, as in the app.

- Source: App docs, Dictionary and kanji details; `LinkedJapaneseText.swift`;
  `JapaneseTextAnalysisClient.swift`; #499 (split compounds don't highlight).
- Check: WD `examples.shown[].tokens` (`surface`, `entry`, `candidates`, `pageWord`);
  `packages/dictionary-core/src/examples/linking.test.ts`; `packages/dictionary-core/src/detail/examples.test.ts`,
  "links each word, with furigana over linked kanji only". The underline style: No automated check
  yet (#511).

**Example translation, speaker, and credits.** Each example shows its English translation and a
speaker that reads the sentence. Under it, each side of the Tatoeba pair is credited with its
sentence ID, linking to Tatoeba, its contributor, and its licence. The app doesn't credit each
sentence.

- Source: #465 (per-sentence attribution).
- Check: `packages/dictionary-core/src/detail/examples.test.ts`, "keeps the position, text, translation, and
  both sides’ attribution"; the conformance test checks each side's attribution is intact.

**Examples across a deploy.** A page loads later examples only from the dictionary build it was
rendered from. When the dictionary has been updated since, the page says "These examples have been
updated since the page loaded." and offers a reload.

- Source: website design (#464).
- Check: `src/lib/dictionary/data.test.ts`, "a page from another build doesn't load this build's
  examples"; `src/app/dictionary/examples/[file]/route.test.ts`, "is not found for an unknown word
  or another build". The message: No automated check yet (#511).

**Credits.** A word page ends with a Sources list: JMdict, UniDic, KANJIDIC2, JLPT levels, TUBELEX,
and Tatoeba.

- Source: #465; `src/lib/dictionary/sources.ts`.
- Check: No automated check yet (#511).

## Kanji page

**Toolbar.** The title is the kanji, followed by Share and the same ••• menu as a word page. Share
sends the kanji, its readings, and its meanings, as the app's does.

- Source: App docs, Dictionary and kanji details; `KanjiDetailView.swift`; #462.
- Check: the share text: `packages/dictionary-core/src/detail/kanji.test.ts`, "要". The toolbar: No
  automated check yet (#511).

**Header card.** The kanji, then its metrics: strokes ("Stroke" for one), and the grade and JLPT
level when KANJIDIC2 has them. JLPT reads as the app writes it, `N` and KANJIDIC2's level, so 要
shows N2. The meanings follow on one line.

- Source: `KanjiDetailView.swift`; #485 (the website shows JLPT as the app does).
- Check: KD `strokeCount`, `grade`, `meanings`; `packages/dictionary-core/src/detail/kanji.test.ts`, "要"
  and "a kanji without elements lists its components; one stroke is singular". KD doesn't record
  JLPT.

**Stroke order.** A kanji with a KanjiVG diagram has a stroke-order button under the glyph. It
opens a dialog, or a drawer on phones, that draws the strokes on a dashed grid and plays, pauses,
or steps through them. A kanji without a diagram has no button. The page then credits KanjiVG.

- Source: `KanjiStrokeOrderView.swift`; `components/dictionary/stroke-order.tsx`.
- Check: KD `hasStrokeOrder`, `strokeOrderStrokes`; `packages/dictionary-core/src/detail/strokes.test.ts`.
  The player: No automated check yet (#511).

**Readings.** On, Kun, and Name readings, each with up to three of the kanji's words whose reading
starts with it. Each word links to its word page. The app's row opens its first word instead; see
[Required, not built yet](#required-not-built-yet-511).

- Source: `KanjiReadingsSection` in `KanjiDetailView.swift`.
- Check: KD `readings`; `packages/dictionary-core/src/detail/kanji.test.ts`, "lists up to three words whose
  reading starts with the reading’s stem".

**Components and Elements.** Elements list each element with its role (Meaning / structure, Sound,
or Sound pattern) and up to three meanings, or its linked on-readings when it has none. Components
appear only for a kanji without elements. An element or component that is a kanji links to its
kanji page. The app also opens an element detail screen; see
[Required, not built yet](#required-not-built-yet-511).

- Source: `KanjiDetailView.swift`; `KanjiElementLookupClient.swift`.
- Check: KD `elements`, `components`; `packages/dictionary-core/src/detail/kanji.test.ts`, "kanjiElements
  (KanjiElementReferenceData.elements)" and "a kanji without elements lists its components; one
  stroke is singular".

**Lists and Notes.** Prompts that open the get-the-app prompt, as on a word page.

- Source: #462.
- Check: No automated check yet (#511).

**Words.** The app's 24 words containing the kanji, in the app's order, each with furigana and its
summary, opening its word page.

- Source: `entries(containingKanji:)` in `LookupClient.swift`; `KanjiDetailView.swift`.
- Check: KD `words`; `packages/dictionary-core/src/detail/kanji.test.ts`, "lists the app’s 24 words for 要,
  in its order"; the conformance test checks every listed word links to its page.

**々 and other characters without a kanji screen.** 々 has no kanji page, as it has no Kanji Detail
in the app.

- Source: #499.
- Check: KD case 々 (`opensDetail: false`).

**Credits.** A kanji page ends with a Sources list: KANJIDIC2, RADKFILE, KanjiVG when it shows
stroke order, Kanjium, and JMdict.

- Source: #465; `src/lib/dictionary/sources.ts`.
- Check: No automated check yet (#511).

## Header, footer, and site-wide

**Header.** The 全 mark links home, with the site name beside it on wide screens. A header search
field appears on wide screens, and a search button on phones, except on the dictionary home and
search pages, which have their own box. The nav links Dictionary, About, and Support on wide
screens, with no current-page state. "Get the app" leads to the home page until the App Store link
is known, and has no icon.

- Source: #462 design; #484.
- Check: smoke "the header links to the dictionary and has search". The rest: No automated check
  yet (#511).

**Footer.** The footer links Dictionary, About and Support (on phones only), Contact, Legal
(`/legal/`), Privacy Policy, Terms of Use, DMCA Copyright Policy, Affiliate Disclosure, Sources,
and Sitemap, then the copyright line. Legal follows Contact, as in the #462 design.

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

## URLs, SEO, and indexing

**Word URLs.** A word lives at `/dictionary/<slug>-<ent_seq>/`, where the slug is the headword and
the JMdict entry number decides the word. Any other slug, a bare number, or a padded number
redirects (308) to the canonical URL in one hop. An unknown number returns 404, as do 0 and a
number past any JMdict entry.

- Source: ADR 0007; #465.
- Check: `src/lib/dictionary/urls.test.ts`, "word URLs (ADR 0007)"; smoke `308
  /dictionary/1259290/ -> …` and `404 /dictionary/999999999/`; `apps/dictionary-api/src/app.test.ts`,
  "404s %s, which names nothing, as for an unknown one" (word 0, and a number past any entry).
  The service names each word's slug
  with the same `wordSlug` when it answers, so a page and its links always agree.

**Retired word URLs.** A word whose entry was retired returns 410 Gone, or redirects (308) to its
replacement in one hop. No entry is recorded as retired until #463 records retired entries in
the app's data.

- Source: ADR 0007; #465.
- Check: `src/lib/dictionary/retired.test.ts`, "retiredWordResponse".

**Kanji URLs.** A kanji lives at `/dictionary/kanji/<character>/`, with the exact character, never
Unicode-normalized, so a compatibility ideograph such as U+F928 (廊) has its own page. An unknown
character, or more than one, returns 404.

- Source: ADR 0007; #465.
- Check: KD cases 廊 (U+5ECA and U+F928); `src/lib/dictionary/sitemaps.test.ts`, "the kanji sitemap
  lists the indexable kanji exactly, never normalized"; the 404 for more than one character:
  `apps/dictionary-api/src/app.test.ts`, "404s %s, which names nothing, as for an unknown one".
  The 404 for an unknown kanji: No automated check yet (#511).

**Search URLs.** A search lives at `/dictionary/search/<query>/`. The query is NFKC-normalized,
lowercased, and has whitespace runs collapsed; any other form redirects (308) to it. Dots are
encoded, so a query never looks like a file. `.` and `..` can't be paths, so they stay on
`/dictionary/search/` as finding nothing.

- Source: #466.
- Check: `src/lib/dictionary/urls.test.ts`, "search URLs". The redirects: No automated check yet
  (#511).

**Titles and descriptions.** A word page is titled "要る (いる) meaning", a kanji page "要 kanji
meaning", a results page "«query» in Japanese", and a search's examples page "«query» in Japanese
example sentences", each followed by "| Zenbu Japanese". Each page
is its own canonical URL.

- Source: #465 (metadata).
- Check: No automated check yet (#511).

**Indexing.** The dictionary home, word pages, kanji pages with meanings or readings, results
pages that list a word, or whose kanji row opens a kanji page, and a search's examples page are
indexable. A kanji with no meanings or readings (about 475 of 13,108, such as 㐂), a search that
finds nothing, `/dictionary/search/` itself, and the endpoints that load examples are `noindex`.
Only production is indexed at all; staging sends `X-Robots-Tag: noindex` and disallows crawling
(see [`docs/agents/web.md`](../../../../docs/agents/web.md)).

- Source: #465; #466; the owner's decision of 2026-09-29 (a new dictionary page is indexed, and the
  SEO review decides what to take out).
- Check: smoke "a kanji without meanings or readings is noindex" and "a search's examples page is
  indexable", and in production, no `X-Robots-Tag` on it; the conformance test checks each
  kanji's `indexable` against its meanings and readings;
  `src/app/dictionary/examples/[file]/route.test.ts`, "returns the next 25 of a word's examples";
  `src/app/dictionary/search/[query]/examples.json/route.test.ts` and
  `src/app/dictionary/conjugations/[file]/route.test.ts`; search pages:
  `src/lib/dictionary/results/links.test.ts`, "isIndexable".

**Sitemaps.** The pages sitemap lists the dictionary home. The sitemap index also lists the word
sitemaps, with every word page's canonical URL, and the kanji sitemap, with every indexable kanji
page. Search pages aren't in any sitemap yet.

- Source: ADR 0007; #465.
- Check: `src/lib/dictionary/sitemaps.test.ts`; smoke "$index lists the dictionary and kanji
  sitemaps" (for `/sitemap-index.xml` and `/sitemap.xml`), "word sitemap lists 1 to 50,000
  canonical URLs", and "kanji sitemap lists indexable kanji only".

**Structured data.** Each dictionary page carries `BreadcrumbList` structured data for its trail.

- Source: #484.
- Check: No automated check yet (#511).

## Required, not built yet (#511)

These are the #511 inventory's rows marked differs or missing, and the app features the owner's
decision on #511 makes required. Each is written as the behavior the website must have, with the
app source it must match and the check it will get. When one is built, its entry moves into the
page's section above, with its check, in the same PR.

### Search results

**Paging.** A results page renders about 25 words in its HTML, then loads more, up to the app's 60.
Today it renders all 60.

- Source: #466 (page the results: about 25, then load more, up to 60).
- Check it will get: a rendered-page test of the first page and the load-more request, like the
  examples endpoint's `route.test.ts`.

**Meaning clamp at large text sizes.** The website clamps a row's meaning to two lines, as the
app does at standard sizes. At the app's accessibility text sizes the meaning isn't clamped
(`ResultRow`'s `lineLimit`); the website needs the same exception for large text.

- App source: `ResultRow` in `SearchView.swift`.
- Check it will get: a rendered-HTML check that the clamp lifts with large text.

**Handwriting and radical input.** The search box offers handwriting and radical selection, as the
app does.

- App source: App docs, Search; `HandwritingInputView.swift`, `OfflineHandwritingRecognizer.swift`,
  `RadicalInputView.swift`, `RadicalLookupClient.swift`.
- Check it will get: an app-recorded suite of radical selections and their candidate kanji, and
  handwriting samples and their candidates, replayed against the website.

**Radical searches keep the strongest matches.** A search started from radical input lists only
its leading group of equally strong matches, as the app limits it (`rankedEntryLimit`).

- App source: `SearchResultsView` and its `rankedEntryLimit` in `SearchView.swift`.
- Check it will get: radical-origin cases in the planned search results suite, recording the rows
  the app lists.

### Kanji page

**Reading rows.** A reading row opens its first word, as the app's row does.

- App source: `KanjiReadingsSection` in `KanjiDetailView.swift`.
- Check it will get: a rendered-page check against KD `readings`.

**Kanji element detail.** An element opens its element detail screen, as in the app.

- App source: `KanjiElementDetailView.swift`; `KanjiElementLookupClient.swift`.
- Check it will get: an app-recorded element-detail suite, and a rendered-page check.

### Header and footer

**Current page in the nav.** The header nav marks the current section, as the #462 design shows
Dictionary as current.

- Source: #462 design.
- Check it will get: a rendered-HTML check.

**"Get the app" icon.** The header's Get the app button has the design's phone icon.

- Source: #462 design.
- Check it will get: a rendered-HTML check.

**Other footer links.** The footer lists what the #462 design lists: Contact, Legal, Privacy,
Terms, Sources, and Sitemap. The website adds Dictionary, DMCA, Affiliate Disclosure, and About and
Support on phones; keeping any of these differences needs a decision on file.

- Source: #462 design.
- Check it will get: a rendered-HTML check of the footer's links.

### Site-wide

**Reading Aids.** The website offers the app's Reading Aids settings and applies them wherever the
app does:

- **Furigana** over headwords and linked words. With it off, a word page shows the reading under
  the headword instead, as in the app.
- **Romaji** alongside the Japanese on word pages, kanji pages, and example sentences.
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

- Source: #466; #463 (the query set).
- Check it will get: a `sitemaps.test.ts` case and a smoke check.

**Structured data.** Word and kanji pages carry structured data beyond `BreadcrumbList`.

- Source: #465 (metadata and structured data).
- Check it will get: a rendered-HTML check of each page's JSON-LD.
