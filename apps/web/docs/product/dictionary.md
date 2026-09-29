# Dictionary

The website's dictionary mirrors the app's [Dictionary](../../../ios/docs/product/dictionary.md).
Each behavior below says what the website does, where that behavior comes from, and the automated
check that enforces it (see [How behavior is verified](index.md#how-behavior-is-verified)).

Abbreviations: **App docs** is `apps/ios/docs/product/dictionary.md`. Swift files are in
`apps/ios/Modules/Sources/SearchExperience/`. Web paths are under `apps/web/`. **SR**, **WD**, and
**KD** are the app-recorded suites `search-retrieval.json`, `word-detail.json`, and
`kanji-detail.json`, with the field they record. SR is replayed by
`src/lib/dictionary/search/conformance.test.ts` ("search conformance on D1"); WD and KD by
`src/lib/dictionary/detail/conformance.test.ts` ("word and kanji detail conformance on D1"). Unit
tests are named by file and test title.

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

**Which words are found.** The website runs a TypeScript port of the app's search retrieval on the
search database. It finds what the app finds for Japanese, kana, romaji, and English queries,
including inflected queries such as `食べた` or `見ない`. It lists at most 60 words, the app's
limit. One known difference remains: the app finds glosses for a long number such as 9999999, and
the website doesn't (see FTS5 in [`docs/agents/web.md`](../../../../docs/agents/web.md)).

- Source: App docs, Search; `LookupClient.swift`; ADR 0006 and ADR 0008.
- Check: SR `results` (the first 10 IDs, in order), `resolution`, and `presentation`, for 30
  queries. The 60-word limit: No automated check yet (#511); SR records only the first 10
  (`resultLimit: 10`).

**No sentence search.** A Japanese sentence finds only direct, inflected, or mixed-script matches.
The website has no Discovered Words list, because it can't analyze text at request time.

- Source: ADR 0008; #466 (comment of 2026-09-29).
- Check: `src/lib/dictionary/search/search.test.ts`, "sentence search is on only with an analyzer,
  and the website has none". SR records no sentence cases (none with the `analyzed`
  resolution).

**Result order.** Words appear in the order the app's retrieval returns them. The app then
re-sorts equally strong matches by the enabled frequency dictionaries; the website doesn't yet, so
it differs from the app and the #462 design, most visibly for いる and `iru`. See
[Required, not built yet](#required-not-built-yet-511).

- Source: App docs, Search; `SearchResultFrequencyOrdering` in `SearchView.swift`; #462 (rows in
  the order the app shows with its default dictionaries).
- Check: SR `results` checks the order before the re-sort only. The re-sorted order: No automated
  check yet (#511).

**Result count.** Above the results, a line reads "N words for «query»" (one word: "1 word"). N is
the number of words listed, at most 60; the kanji card isn't counted. The app shows no count; the
line follows the #462 design's wording.

- Source: #462 design.
- Check: No automated check yet (#511).

**Kanji card.** A one-character query that is a kanji in the dictionary also shows a card above the
word list, labeled "Kanji", with the kanji's KANJIDIC2 meanings. It opens the kanji page. The app
shows it differently; see [Required, not built yet](#required-not-built-yet-511).

- Source: App docs, Search ("a dedicated Kanji result for a single-kanji query"); #466.
- Check: `src/lib/dictionary/data.test.ts`, "search links every word and reads the kanji card from
  the dictionary database" (that the card is read, not how it looks).

**Result rows.** Each row shows the headword with furigana, the word's summary meaning, and its
frequency chips, and opens the word page. The meaning is not clamped to two lines, and English
queries show the summary rather than the meaning that matched; both differ from the app (see
[Required, not built yet](#required-not-built-yet-511)).

- Source: App docs, Search; `ResultRow` in `SearchView.swift`; #462.
- Check: headword furigana: `src/lib/dictionary/detail/ruby.test.ts`, "rubySegments"; the link:
  `src/lib/dictionary/data.test.ts`, "links every word once the dictionary database is loaded".
  The row layout: No automated check yet (#511).

**Frequency chips.** A row has one chip per default dictionary that ranks or lists the word, as the
app picks them: `JLPT N5` when the JLPT list has it, and `YouTube 812` when TUBELEX ranks it. Each
chip has the app's colored dot for how common the word is: green, yellow, orange, red, or gray for
rare. Screen readers hear the tier after a rank, as the app's labels speak it.

- Source: App docs, Search; `SearchFrequencyRankPresentationModel` in `FrequencyPack.swift`;
  `FrequencyRankChip.swift`.
- Check: `src/lib/dictionary/detail/frequency.test.ts`, "shows only dictionaries that rank or list
  the word, since JLPT is a level list" and "tierForRank (FrequencyTier(rank:))";
  `src/lib/dictionary/detail/word.test.ts`, "a search result with its frequency chips";
  `src/lib/dictionary/data.test.ts`, "search results show frequency chips from the dictionary
  database, in one query".

**Frequency is JLPT and YouTube only.** The website uses the app's default frequency dictionaries,
JLPT Levels then YouTube (TUBELEX), and has no way to choose others. The #462 design's Anime chip
is left out.

- Source: #464 (phase 2 plan: frequency is JLPT and TUBELEX only, the app's default packs).
- Check: `src/lib/dictionary/detail/frequency.test.ts`, "lists each default dictionary, JLPT then
  YouTube"; WD `frequency`.

**No results.** When nothing matches, the page shows "No words match “«query»”" with the hint "Try
the dictionary form, kana, romaji, or an English meaning." A query full-text search can't read,
such as one with a NUL, shows the same page. The app says "No Dictionary Matches"; see
[Required, not built yet](#required-not-built-yet-511).

- Source: App docs, Search; `SearchView.swift`; #462 (`Empty` for no results).
- Check: `src/lib/dictionary/data.test.ts`, "shows a query full-text search cannot read as no
  results". The wording: No automated check yet (#511).

**Credits.** A results page that finds something ends with a Sources list: JMdict, KANJIDIC2, JLPT
levels, and TUBELEX, each with its licence.

- Source: #465 (credit every source a page shows, on every page); `src/lib/dictionary/sources.ts`.
- Check: No automated check yet (#511).

**Left out on purpose.** The website has no Recent list, camera button, or Image Search, and no
"View N Example Sentences" row, because examples have no route of their own yet. It also has no
✓ Known capsule and no swipe or long-press to mark a word known, since learner data lives in the
app.

- Source: #462 (Recent list, camera button, and "View 50+ Example Sentences" left out; learner
  actions open a get-the-app prompt).
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
- Check: the share text: `src/lib/dictionary/detail/word.test.ts`, "要る (1546640)". The toolbar,
  menu, and prompt: No automated check yet (#511).

**Header card.** The card shows the headword with furigana, and beside it the pitch accent in a
capsule with a speaker, or a standalone speaker when the word has no pitch. The speaker uses the
browser's Japanese voice. Under a separator, the part-of-speech row names one word class and its
modifiers, such as "Godan verb (intransitive)", and is left out when no class has a name. It
comes from the first sense's parts of speech, falling back to the entry's. The row doesn't open a
conjugation table yet.

- Source: App docs, Dictionary and kanji details; `WordDetailView.swift`;
  `PartOfSpeechFormatter.swift`; `DictionaryEntry.displayPartOfSpeech`; #462.
- Check: WD `furigana`, `partOfSpeech`; `src/lib/dictionary/detail/word.test.ts`, "names one word
  class, then its modifiers" and "shows no part of speech when no class has a name". The speaker:
  No automated check yet (#511).

**Furigana.** Furigana places each kanji run's part of the reading over it, as the app does,
including the app's current split for 黄色い声. Words read as a whole, such as 今日, carry the
reading over the whole word.

- Source: App docs; `JapaneseRubyText.swift`; #499 (keep the app's furigana, including 黄色い声).
- Check: WD `furigana`; `src/lib/dictionary/detail/ruby.test.ts`, "rubySegments".

**Pitch accent.** Pitch comes from UniDic, or for a two-part compound UniDic doesn't list whole,
such as 記者会見, from CompoundPitch; a word with neither shows no pitch. The reading is drawn in
katakana with a line over the high morae and a hook where pitch falls. The app draws a
dot-and-line contour with a mark for the following particle; see
[Required, not built yet](#required-not-built-yet-511).

- Source: App docs, Dictionary and kanji details; `PitchAccentBadge` in `WordDetailView.swift`.
- Check: WD `pitch` (downstep, levels, mora count, particle, source);
  `src/lib/dictionary/detail/pitch.test.ts`; `src/lib/dictionary/detail/word.test.ts`, "shows
  CompoundPitch when UniDic has no pitch, and none when neither has". The drawing: No automated
  check yet (#511).

**Section order.** Below the header card, sections appear in the app's order: Meaning, Frequency,
Alternatives, Kanji, Alternative kanji, Related words, Lists, Notes, and Examples. A section with
nothing to show is left out, except Meaning, Frequency, Lists, Notes, and Examples.

- Source: App docs, Dictionary and kanji details.
- Check: No automated check yet (#511).

**Meaning.** Senses are numbered, each with its notes.

- Source: `WordDetailView.swift`.
- Check: WD `senses`.

**Frequency.** One row per default dictionary, JLPT then YouTube, with its dot and its level or
rank. A dictionary without the word says "Not listed" (JLPT) or "No rank" (YouTube). The rows
don't open anything yet; the app opens Frequency Details. JLPT levels are unofficial estimates, as
the Sources list says.

- Source: App docs, Dictionary and kanji details; `FrequencyPresentationModel` in
  `FrequencyPack.swift`; #464 (JLPT and TUBELEX only).
- Check: WD `frequency`; `src/lib/dictionary/detail/frequency.test.ts`, "lists each default
  dictionary, JLPT then YouTube" and "says what a dictionary lacks".

**Alternatives.** The other written forms on one line, then the other readings on another, with
their labels, leaving out Search only forms and repeats. A form with a kanji links to its first
kanji's page, as the app's form line opens that kanji.

- Source: `DictionaryEntry.alternativeForms`; `AlternativeFormsSection` in `WordDetailView.swift`.
- Check: WD `alternativeForms`; `src/lib/dictionary/detail/word.test.ts`, "leaves out Search only
  forms and repeats from the alternatives". The link: No automated check yet (#511).

**Kanji and Alternative kanji.** Kanji lists each kanji of the headword once; Alternative kanji
lists kanji from the other written forms that the headword lacks. Each row shows the kanji and its
first two meanings, and opens its kanji page when it has one. The app shows the character alone;
the meanings follow the #462 design.

- Source: `DictionaryEntry.primaryKanji` and `alternativeKanji`; #462 design.
- Check: WD `kanji`, `alternativeKanji` (the conformance test also checks the two meanings shown);
  `src/lib/dictionary/detail/word.test.ts`, "primaryKanji (DictionaryEntry.primaryKanji)" and
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
  `src/lib/dictionary/detail/examples.test.ts`, "exampleCountText". The empty message: No
  automated check yet (#511).

**Example words.** Each sentence shows each word underlined, as the app splits it; an inflected
verb or adjective is one word with its endings. A word that resolves to one entry has furigana and
opens its word page. A word the app can't resolve to one entry, such as だ, opens a search for its
dictionary form. The page's own word is marked with a thicker underline; the app accents it in
color. Split compounds such as 一日 have no marked word, as in the app.

- Source: App docs, Dictionary and kanji details; `LinkedJapaneseText.swift`;
  `JapaneseTextAnalysisClient.swift`; #499 (split compounds don't highlight).
- Check: WD `examples.shown[].tokens` (`surface`, `entry`, `candidates`, `pageWord`);
  `src/lib/dictionary/examples/linking.test.ts`; `src/lib/dictionary/detail/examples.test.ts`,
  "links each word, with furigana over linked kanji only". The underline style: No automated check
  yet (#511).

**Example translation, speaker, and credits.** Each example shows its English translation and a
speaker that reads the sentence. Under it, each side of the Tatoeba pair is credited with its
sentence ID, linking to Tatoeba, its contributor, and its licence. The app doesn't credit each
sentence.

- Source: #465 (per-sentence attribution).
- Check: `src/lib/dictionary/detail/examples.test.ts`, "keeps the position, text, translation, and
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
- Check: the share text: `src/lib/dictionary/detail/kanji.test.ts`, "要". The toolbar: No
  automated check yet (#511).

**Header card.** The kanji, then its metrics: strokes ("Stroke" for one), and the grade and JLPT
level when KANJIDIC2 has them. JLPT reads as the app writes it, `N` and KANJIDIC2's level, so 要
shows N2. The meanings follow on one line.

- Source: `KanjiDetailView.swift`; #485 (the website shows JLPT as the app does).
- Check: KD `strokeCount`, `grade`, `meanings`; `src/lib/dictionary/detail/kanji.test.ts`, "要"
  and "a kanji without elements lists its components; one stroke is singular". KD doesn't record
  JLPT.

**Stroke order.** A kanji with a KanjiVG diagram has a stroke-order button under the glyph. It
opens a dialog, or a drawer on phones, that draws the strokes on a dashed grid and plays, pauses,
or steps through them. A kanji without a diagram has no button. The page then credits KanjiVG.

- Source: `KanjiStrokeOrderView.swift`; `components/dictionary/stroke-order.tsx`.
- Check: KD `hasStrokeOrder`, `strokeOrderStrokes`; `src/lib/dictionary/detail/strokes.test.ts`.
  The player: No automated check yet (#511).

**Readings.** On, Kun, and Name readings, each with up to three of the kanji's words whose reading
starts with it. Each word links to its word page. The app's row opens its first word instead; see
[Required, not built yet](#required-not-built-yet-511).

- Source: `KanjiReadingsSection` in `KanjiDetailView.swift`.
- Check: KD `readings`; `src/lib/dictionary/detail/kanji.test.ts`, "lists up to three words whose
  reading starts with the reading’s stem".

**Components and Elements.** Elements list each element with its role (Meaning / structure, Sound,
or Sound pattern) and up to three meanings, or its linked on-readings when it has none. Components
appear only for a kanji without elements. An element or component that is a kanji links to its
kanji page. The app also opens an element detail screen; see
[Required, not built yet](#required-not-built-yet-511).

- Source: `KanjiDetailView.swift`; `KanjiElementLookupClient.swift`.
- Check: KD `elements`, `components`; `src/lib/dictionary/detail/kanji.test.ts`, "kanjiElements
  (KanjiElementReferenceData.elements)" and "a kanji without elements lists its components; one
  stroke is singular".

**Lists and Notes.** Prompts that open the get-the-app prompt, as on a word page.

- Source: #462.
- Check: No automated check yet (#511).

**Words.** The app's 24 words containing the kanji, in the app's order, each with furigana and its
summary, opening its word page.

- Source: `entries(containingKanji:)` in `LookupClient.swift`; `KanjiDetailView.swift`.
- Check: KD `words`; `src/lib/dictionary/detail/kanji.test.ts`, "lists the app’s 24 words for 要,
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

**Footer.** The footer links Dictionary, About and Support (on phones only), Contact, Privacy
Policy, Terms of Use, DMCA Copyright Policy, Affiliate Disclosure, Sources, and Sitemap, then the
copyright line.

- Source: #462 design (Contact, Legal, Privacy, Terms, Sources, Sitemap).
- Check: No automated check yet (#511).

**Reading Aids.** The website has no Reading Aids settings yet. It shows what the app shows with
its defaults: headwords and linked example words have furigana, examples show their translation,
and there is no romaji and no word meanings under example words. The settings are required; see
[Required, not built yet](#required-not-built-yet-511).

- Source: App docs index, Account (Reading Aids); `ReadingAidPreferences.swift` (the defaults).
- Check: No automated check yet (#511).

## URLs, SEO, and indexing

**Word URLs.** A word lives at `/dictionary/<slug>-<ent_seq>/`, where the slug is the headword and
the JMdict entry number decides the word. Any other slug, a bare number, or a padded number
redirects (308) to the canonical URL in one hop. An unknown number returns 404.

- Source: ADR 0007; #465.
- Check: `src/lib/dictionary/urls.test.ts`, "word URLs (ADR 0007)"; smoke `308
  /dictionary/1259290/ -> …` and `404 /dictionary/999999999/`;
  `src/lib/dictionary/detail/conformance.test.ts`, "every word is stored under the slug its URL
  uses".

**Retired word URLs.** A word whose entry was retired returns 410 Gone, or redirects (308) to its
replacement in one hop. No entry is recorded as retired until #463 fills `retired_ids`.

- Source: ADR 0007; #465.
- Check: `src/lib/dictionary/retired.test.ts`, "retiredWordResponse".

**Kanji URLs.** A kanji lives at `/dictionary/kanji/<character>/`, with the exact character, never
Unicode-normalized, so a compatibility ideograph such as U+F928 (廊) has its own page. An unknown
character returns 404.

- Source: ADR 0007; #465.
- Check: KD cases 廊 (U+5ECA and U+F928); `src/lib/dictionary/sitemaps.test.ts`, "the kanji sitemap
  lists the indexable kanji exactly, never normalized". The 404: No automated check yet (#511).

**Search URLs.** A search lives at `/dictionary/search/<query>/`. The query is NFKC-normalized,
lowercased, and has whitespace runs collapsed; any other form redirects (308) to it. Dots are
encoded, so a query never looks like a file. `.` and `..` can't be paths, so they stay on
`/dictionary/search/` as finding nothing.

- Source: #466.
- Check: `src/lib/dictionary/urls.test.ts`, "search URLs". The redirects: No automated check yet
  (#511).

**Titles and descriptions.** A word page is titled "要る (いる) meaning", a kanji page "要 kanji
meaning", and a results page "«query» in Japanese", each followed by "| Zenbu Japanese". Each page
is its own canonical URL.

- Source: #465 (metadata).
- Check: No automated check yet (#511).

**Indexing.** The dictionary home, word pages, kanji pages with meanings or readings, and results
pages that find something are indexable. A kanji with no meanings or readings (about 475 of 13,108,
such as 㐂), a search that finds nothing, `/dictionary/search/` itself, and the examples endpoint are
`noindex`. Only production is indexed at all; staging sends `X-Robots-Tag: noindex` and disallows
crawling (see [`docs/agents/web.md`](../../../../docs/agents/web.md)).

- Source: #465; #466.
- Check: smoke "a kanji without meanings or readings is noindex"; the conformance test checks each
  kanji's `indexable` against its meanings and readings;
  `src/app/dictionary/examples/[file]/route.test.ts`, "returns the next 25 of a word's examples".
  Search pages: No automated check yet (#511).

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

**Frequency re-sort.** Equally strong matches are re-sorted by the default dictionaries, JLPT then
YouTube, as the app sorts them, so いる lists 要る, いる, 炒る, 入る, 射る, 鋳る first, as the #462
design shows.

- App source: App docs, Search; `SearchResultFrequencyOrdering` in `SearchView.swift`.
- Check it will get: the planned app-recorded search results suite (#511), which records the order
  after the re-sort, replayed against the rendered results page; a smoke check for
  `/dictionary/search/iru/`.

**Order for `iru`.** `/dictionary/search/iru/` lists what the app lists, in the app's order. Today
it leads with 上一, 上一段, and 上一段活用 (English matches for "iru"), then the verbs in the pre-sort
order.

- App source: `SearchResultFrequencyOrdering` in `SearchView.swift`; the app's results for `iru`,
  which no suite records yet.
- Check it will get: an `iru` case in the planned search results suite, and a smoke check.

**Paging.** A results page renders about 25 words in its HTML, then loads more, up to the app's 60.
Today it renders all 60.

- Source: #466 (page the results: about 25, then load more, up to 60).
- Check it will get: a rendered-page test of the first page and the load-more request, like the
  examples endpoint's `route.test.ts`.

**Meaning clamp.** A row's meaning is clamped to two lines, as the app clamps it. At the app's
accessibility text sizes the meaning isn't clamped (`ResultRow`'s `lineLimit`); the website needs
the same exception for large text.

- App source: `ResultRow` in `SearchView.swift`.
- Check it will get: a rendered-HTML check of the row.

**Matched meaning for English results.** An English query shows the meaning that matched, not the
word's summary, as the app does. The search core already returns it; the page drops it.

- App source: App docs, Search ("English rows show the meaning that matched");
  `displaySummary` in `DictionaryEntry.swift`.
- Check it will get: a `displaySummary` field in the planned search results suite.

**Kanji row.** The kanji result is the first row of the list, labeled "KANJI", with its primary
entry's summary (要 shows "pivot"), as the app's row presents it.

- App source: `KanjiPrimaryRow` in `SearchView.swift`.
- Check it will get: the kanji row in the planned search results suite, and a rendered-page check.

**"Search for「…」" reading suggestion.** When the app offers a Japanese-reading refinement, the
results page offers "Search for「…」" in its own section above the result rows, which opens that
search. The core already computes it.

- App source: App docs, Search ("a Japanese-reading refinement"); the reading-refinement section of
  `SearchResultsView` in `SearchView.swift` (`search.reading-refinement`).
- Check it will get: SR `readingRefinement` already checks the core's value; a rendered-page check
  that the page shows and links it.

**No results wording.** A search that finds nothing says what the app says, "No Dictionary
Matches", unless a decision keeps the website's wording.

- App source: `SearchView.swift`.
- Check it will get: a rendered-HTML check of the empty page.

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

### Word page

**Conjugation table.** The part-of-speech row opens the conjugation table: the word's class and
rule, a Plain/Polite control, each form with its changed ending highlighted, and each form's screen
with its meaning and examples.

- App source: App docs, Dictionary and kanji details (the conjugation table);
  `ConjugationsView.swift`, `JapaneseConjugationClient.swift`.
- Check it will get: WD `opensConjugations`, which the gate now skips, and an app-recorded
  conjugation suite.

**Frequency details sheet.** Selecting a Frequency row opens that dictionary's details: its name,
domain, description, version, and source, then the word's JLPT level, or its rank and percentile.

- App source: App docs, Dictionary and kanji details; `FrequencyDisclosureView` in
  `WordDetailView.swift`.
- Check it will get: the details' fields in the word-detail suite, and a rendered-page check.

**Per-kanji furigana highlight.** Tapping one kanji in the headword shows which part of the reading
belongs to it, as in the app (学校 is がっ・こう; 大人 has none).

- App source: App docs index, Furigana kanji highlight; `KanjiReadingSplitter.swift`.
- Check it will get: a per-kanji split field in the word-detail suite, and a rendered-page check.

**Pitch graph style.** The pitch accent is drawn as the app draws it: a dot-and-line contour over
the morae, with a hollow dot for the following particle.

- App source: `PitchAccentBadge` in `WordDetailView.swift`; #462 design.
- Check it will get: a rendered-SVG check against WD `pitch` (`levels`, `particle`).

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

**Legal link.** The footer links Legal (`/legal/`), as the #462 design's footer does. Today it
links each legal page but not Legal itself.

- Source: #462 design (footer: Contact, Legal, Privacy, Terms, Sources, Sitemap).
- Check it will get: a rendered-HTML check that the footer links `/legal/`, and a smoke check that
  the home page's footer does.

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

**Search sitemaps.** Child sitemaps list the canonical search URLs of the precomputed query set,
and the sitemap index lists them.

- Source: #466; #463 (the query set).
- Check it will get: a `sitemaps.test.ts` case and a smoke check.

**Structured data.** Word and kanji pages carry structured data beyond `BreadcrumbList`.

- Source: #465 (metadata and structured data).
- Check it will get: a rendered-HTML check of each page's JSON-LD.
