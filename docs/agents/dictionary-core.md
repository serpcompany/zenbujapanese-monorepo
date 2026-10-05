# Shared dictionary core working guide

`packages/dictionary-core` (`@zenbu/dictionary-core`) is the one TypeScript dictionary every Zenbu
client runs (ADR 0008, ADR 0009). Today the website runs it through the dictionary service
([`dictionary-api.md`](dictionary-api.md)); the browser extension and the apps will run it
offline, and it will replace the app's Swift. It is TypeScript source: each client compiles it
(the website through Next.js's `transpilePackages`, the service through tsx and esbuild), and
imports it by path, such as `@zenbu/dictionary-core/search/search`.

Run commands from `packages/dictionary-core`, after `pnpm install` at the repository root.

## What it holds

Each module ports the app's Swift, in `apps/ios/Modules/Sources/SearchExperience/`;
[Swift sources](#swift-sources) says which.

| Folder | What it does | Main Swift sources |
| --- | --- | --- |
| `search/` | Search retrieval: query normalization, deinflection, ranking, full-text phrases, and sentence search through a supplied analyzer. | `LookupClient`, `SearchQuery`, `DictionaryRanking`, `JapaneseDeinflection`, `DictionaryEntry`, `JapaneseTextAnalysisClient` |
| `results/` | The results screen: the frequency re-sort, rows, chips, and the Example Sentences, reading-refinement, and kanji rows. | `SearchResultsView`, `SearchResultsScreen`, `SearchResultFrequencyOrdering`, `FrequencyPack` |
| `detail/` | Word pages and kanji details from their rows: furigana, pitch, Frequency Details, conjugations, kanji, and examples. | `WordDetailView`, `KanjiDetailView`, `JapaneseRubyText`, `KanjiReadingSplitter`, `JapaneseConjugationClient`, `ConjugationsView` |
| `examples/` | Example linking, inflection grouping, and the ranks example retrieval shares. | `JapaneseTextAnalysisClient`, `JapaneseInflectionGrouping`, `KuromojiMorphologyClient`, `ExampleSentenceClient` |
| `artifact/` | Reads `LanguageReferenceData.sqlite3` and its packs with the app's own SQL, checks them, and answers search, word, kanji, example, and sitemap requests (`Dictionary`). | `LookupClient`, `ExampleSentenceClient`, `KanjiLookupClient` |
| `fixtures/` | Rows exported from the app's data for twelve words and the kanji 要, each word and each of its conjugated forms with its first 50 examples, for local development and tests; never production. | — |

## Rules

- **No runtime or framework.** Biome refuses `node:*`, Next.js, React, Wrangler, Hono, and
  Drizzle imports in `src` (tests aside). A client passes in what it has: the artifact as an
  `ArtifactDatabase` (synchronous `all(sql, params)`), the kanji files as `KanjiData`, and its
  capabilities: `tokenize` (the app's Kuromoji) and `morphology` (the app's Sudachi). Without
  `morphology`, sentence search is off and the rest of Search is unchanged (ADR 0008).
- **It logs nothing.** It returns what happened, as a result or an error, and the client logs it
  its own way; Biome refuses `console` in `src` (tests aside).
- **Change a port and its Swift together.** The `Search parity` workflow fails a pull request that
  changes one side of a pair it lists (`.github/workflows/search-parity.yml`) without the other.
  The `search-parity-reviewed` label says the change applies to one side only.
- **The app records the answers.** When the app's behavior changes, re-record the suites on a Mac
  ([`ios.md`](ios.md)); the port must then pass them.
- **Rows are a contract.** `detail/rows.ts` is what the service answers with and the fixtures
  hold. After changing a row shape, regenerate the fixtures with
  `pnpm --filter zenbujapanese-dictionary-api fixtures`.
- **Every response shape has a contract number.** `artifact/contract.ts` names each answer the
  service gives (`DictionaryContract`) and the number of their current shapes
  (`dictionaryContract`), which the service sends and the website compares with its own. The site
  and the service deploy separately, in either order, so a shape change makes them disagree for
  a few minutes. A mismatch is logged, never refused: make a change the older side can still
  read, such as adding a field that the newer side doesn't yet rely on. `artifact/contract.test.ts`
  expands every shape with the TypeScript compiler and fails when one changes without a new
  contract number: raise it by one and record the new shape under it, never changing a recorded
  one.

## What a client passes in

- `ArtifactDatabase` is synchronous, as SQLite's own access is, since every client opens the files
  locally; `searchDatabase` wraps it as the search core's async `SearchDatabase`. Both bind
  `params` to anonymous `?` placeholders in order.
- `tokenize` is kuromoji.js with the IPADIC files the app bundles
  (`apps/ios/Modules/Sources/SearchExperience/Resources/Kuromoji`), answering as kuromoji.js's
  `tokenize` does: `word_position` is 1-based, in UTF-16 code units, as the app's `NSRange` reads
  it.
- `morphology` is an analyzer such as the app's Sudachi, whose dictionary is 217 MB. A
  `MorphologyWord` lists its part-of-speech tags most general first (名詞, 動詞), and its
  `dictionaryForm` is `*` or empty when the analyzer has none. An analysis that throws finds no
  words, as in the app.

## Swift sources

Paths are relative to `apps/ios/Modules/Sources/SearchExperience/`. The TypeScript keeps the
Swift names where it can. Each module's tests take their expected values from the same Swift, and
the app-recorded suites (`apps/ios/LanguageData/Conformance/`) check the port against the app.

| Module | Ports |
| --- | --- |
| `search/search.ts` | `searchUncached`, `searchOnce`, and `japaneseDeinflectedSources` in `LookupClient.swift`: the order in which a query tries its searches, from the reading refinement through deinflection to the analyzed segments. Results come back in dictionary order, before the frequency re-sort, as the suite pins them (ADR 0006). |
| `search/database.ts` | `SearchFormKind`, `decodeEntry`, and `priorityProfile` in `LookupDatabase.swift`, with the entry columns its candidate queries select. `withParametersTruncatedAtNul` reads parameters as the app binds them ([Matching the Swift](#matching-the-swift), Bound text). |
| `search/japanese.ts` | `rankedJapanese` in `LookupJapaneseRanking.swift`, with `japaneseCandidateSQL` and `exactJapaneseCandidateSQL`. |
| `search/english.ts` | `rankedEnglish`, `glossEvidence`, `romajiEvidence`, `glossRelation`, `glossEvidencePrecedes`, `glossTokenPattern`, and `hasSearchTerms` in `LookupEnglishRanking.swift`, with `asciiCandidateSQL` and `exactASCIICandidateSQL`. |
| `search/ranked-entries.ts` | `RankedDictionaryEntry` and `deduplicated` in `LookupRankedEntries.swift`. |
| `search/composition.ts` | `LookupSearchResults` (`composing`, and `empty` as `noResults`) and `LookupSearchResultItem` in `DictionaryEntry.swift`, and `resultItems` in `LookupRankedEntries.swift`. |
| `search/query.ts` | `SearchQuery.swift` |
| `search/rank.ts` | `DictionaryRanking.swift` |
| `search/deinflect.ts` | `JapaneseDeinflection.swift` |
| `search/fts.ts` | `ftsPhrase` and `ftsPrefix` in `LookupJapaneseRanking.swift`, unchanged, since the core queries the same FTS4 indexes; `\p{L}\p{M}\p{N}` stands for `CharacterSet.alphanumerics`. |
| `search/morphology.ts` | `lookupSegments` in `JapaneseTextAnalysisClient.swift`; the analyzer itself is a capability. |
| `results/results.ts` | `SearchResultsView.swift` (`orderedItems` is `SearchResultFrequencyOrdering.ordered`, in `SearchResultFrequencyOrdering.swift`; `primaryItem` is `LookupSearchResults.primaryEntry(for:)`), with `FrequencyPack.swift`. |
| `detail/word.ts` | `WordDetailView.swift` and `DictionaryEntry.swift` |
| `detail/kanji.ts` | `KanjiDetailView.swift`, with its words from `entries(containingKanji:)` in `LookupClient.swift` and its elements from `KanjiElementLookupClient.swift`. |
| `detail/conjugation-table.ts` | `JapaneseConjugator`, `ConjugationTable`, `ConjugationMode`, and `ConjugatedForm` in `JapaneseConjugationClient.swift`. |
| `detail/conjugation.ts` | What `ConjugationsView.swift` shows for a `detail/conjugation-table.ts` table: `ConjugatedForm.Kind.presentation`, `sharedSpellings(of:in:)`, and `rowShowsFurigana`. The suite's `opensConjugations` and `conjugations` check both modules. |
| `detail/frequency.ts` | `FrequencyTier`, `FrequencyPresentationModel`, and `SearchFrequencyRankPresentationModel` in `FrequencyPack.swift`, and `FrequencyDisclosurePresentation` in `WordDetailView.swift`. |
| `detail/pitch.ts` | `String.morae` and `PitchAccent.levels` in `DictionaryEntry.swift`, and `PitchContourLayout` in `WordDetailView.swift`. |
| `detail/ruby.ts` | `JapaneseRubyAnnotation` in `JapaneseTextAnalysisClient.swift`, which `JapaneseRubyText.swift` draws. |
| `detail/kanji-split.ts` | `KanjiReadingSplitter.swift`, and `kanjiReadings` in `JapaneseRubyText.swift`. |
| `detail/examples.ts` | The `.wordDetail` and `.conjugatedForm` presentations in `ExampleSentencesView.swift`, and `LinkedJapaneseText.swift`. |
| `detail/strokes.ts` | `decodeStroke` in `KanjiStrokeOrderClient.swift`, and `KanjiStrokeShape` in `KanjiStrokeOrderView.swift`. |
| `detail/part-of-speech.ts` | `PartOfSpeechFormatter.swift` |
| `detail/text.ts` | `isCJKUnifiedIdeograph` in `DictionaryEntry.swift`, `KanjiCharacter.init` in `KanjiLookupClient.swift`, `hiragana` in `KanjiDetailView.swift`, and `katakana` in `WordDetailView.swift`. |
| `detail/suite.ts` | Test-only: the fields `WordDetailConformanceTests.swift` records, for the service's replay (`apps/dictionary-api/src/conformance/detail.conformance.test.ts`) and the website's `word-page.test.tsx`. |
| `examples/linking.ts` | `JapaneseTextAnalyzer` in `JapaneseTextAnalysisClient.swift`, and `displayReading(for:)` in `LinkedJapaneseText.swift`. |
| `examples/morphology.ts` | The token conversion in `KuromojiMorphologyClient.swift`, and `JapaneseInflectionGrouping.swift`. |
| `examples/forms.ts` | `ConjugatedForm.examples` in `ConjugationsView.swift`, `JapaneseTextAnalysisClient.words`, and `queryScalarRanges` and `matchesQuery` in `LinkedJapaneseText.swift`. |
| `examples/kana.ts` | Foundation's `applyingTransform(.hiraganaToKatakana, reverse:)` |
| `examples/retrieval.ts`, `artifact/example-retrieval.ts` | `ExampleSentenceData.retrieveEntry` and `retrieveIndexedEntry` in `ExampleSentenceEntryRetrieval.swift`, with its queries. |
| `artifact/example-search.ts` | `ExampleSentenceData.retrieveEnglish` and `retrieveJapanese` in `ExampleSentenceSearchRetrieval.swift`, with its queries. |
| `artifact/search-examples.ts` | `SearchResultsScreen.exampleCount` and `directExampleCount` in `SearchResultsScreen.swift`. |
| `artifact/lookup.ts` | `LookupClient.entriesMatchingForm`: `exactJapaneseCandidateSQL`, ranked and deduplicated by the search port. |
| `artifact/words.ts`, `artifact/kanji.ts` | `entry(_:)` in `LookupClient.swift`, and `selectedColumns` and `kanjiCandidateRowsSQL` in `LookupDatabase.swift`. |

## Matching the Swift

- **Characters.** A Swift `Character` is an extended grapheme cluster, so the ports iterate
  `graphemes` wherever the Swift iterates Characters. `graphemeCount` skips segmenting when every
  UTF-16 unit is a grapheme of its own (printable ASCII, and the CJK, kana, and full-width blocks
  less their combining marks), since example retrieval counts every matching sentence.
- **Order.** `compareStrings` is Swift's `<`: by Unicode scalar, not UTF-16 unit; ranking compares
  fingerprints with it. SQLite compares a BLOB by its bytes, which lowercase hex keeps, and text by
  code point (`compareCodePoints`); its `instr()` and `length()` count code points, so `kanjiWords`
  measures headwords in code points.
- **Whitespace.** `normalizeQuery` splits words as Swift's `split(whereSeparator: \.isWhitespace)`
  does: a grapheme whose first scalar is whitespace separates words and is dropped whole (NFKC
  turns ゛ into a space and a combining mark), and U+FEFF, which isn't whitespace, stays.
- **Bound text.** The app binds text as C strings (`sqlite3_bind_text` with length -1), so SQLite
  reads a parameter up to its first NUL; `DictionarySearch` truncates its parameters there too.
- **Kana.** Each conversion is the one its Swift uses, so they stay separate. `examples/kana.ts` is
  ICU's Hiragana-Katakana transliterator, which Foundation's `applyingTransform` runs: it folds
  halfwidth and circled katakana, spells ヿ and ゟ out, maps the iteration marks, and composes
  (`kana.test.ts` pins cases read from Foundation on macOS). `hiragana` and `katakana` in
  `detail/text.ts` shift scalar by scalar, `kanji-split.ts` shifts only one-scalar Characters, and
  `ruby.ts` turns ヷ–ヺ, which have no precomposed hiragana, into a kana and a combining dakuten,
  still one Character each so the reading's positions don't move.
- **Where the app throws**, the port returns an error value (`RetrievalError`,
  `ExampleSearchError`) or null, and the page shows what the app shows then, usually no examples.

## Search

- `deinflect` rewrites suffixes, chaining rules by word class: any rule applies to the surface,
  then only a rule whose input classes include the class the previous rule produced, up to six
  deep. Its candidates are hypotheses that lookup filters by part of speech.
  `romajiDeinflectedCandidates` tries the irregular verbs first, since their regular-looking
  alternatives are words too.
- When a Japanese query deinflects, an exact dictionary form stays first (した lists 下 and 舌
  before する), and the deinflected lemmas follow it, ahead of prefix and contains matches.
- `deduplicated` collapses entries that share a semantic fingerprint into the lowest Language
  Reference ID and takes the JMdict entry number from that same entry, so the two always name one
  entry. `rank` orders entries and sets the leading lexical group (the app's legacy rank);
  `presentationRank` is the coarse rank shown, the group's strongest after merging.
- An English query matches a sense restricted to some written forms or readings (JMdict's stagk
  and stagr) only when the entry is shown with one of them.
- `literalQuery` is the app's literal query policy: `mondai` searches as `monday`.

## Detail

- **Conjugation.** The table is for the first conjugating class among the entry's parts of speech,
  not the first sense's. A row shows furigana only when its ending has kanji (来させる), since the
  header gives the stem's reading. The website shows the table in its word page's Conjugations
  section ([`dictionary.md`](../../apps/web/docs/product/dictionary.md), Word page).
- **Frequency.** The website uses only the app's default dictionaries, the bundled packs in
  `FrequencyPackCatalog.json`'s order: JLPT levels, then TUBELEX (YouTube). Tiers use Migaku's star
  cutoffs, and JLPT levels map onto the same scale. `frequency.test.ts` pins each pack's
  disclosure, and `coveredSourceRows` (the rows a rank's percentile divides by), to the catalog. A
  row's label leaves out the app's "Double tap for details." hint, since the website's row opens a
  dialog.
- **Furigana.** `rubySegments` anchors each kanji run on the first match of the next kana run, as
  the app does. `splitKanjiReading` splits a segment kanji by kanji only when exactly one split
  fits the kanji's KANJIDIC2 on and kun readings, taken without okurigana, with their voiced and
  half-voiced sound changes, and with a final つ, ち, く, or き as a small っ (学 がく → がっ); 々
  reads as the kanji before it.
- **Kanji details.** `kanjiWords` groups the entries written with the kanji by semantic fingerprint
  and orders the groups by a headword starting with the kanji, the shortest headword, any common
  entry, the highest rank score, then the fingerprint; each of the first 24 groups shows as its
  entry with the smallest ID (`normalizedEntry`). Stroke data that doesn't decode shows no stroke
  order rather than failing the page, since clients read `KanjiStrokeData.sqlite3` as the app
  ships it. A character with a variation selector has no kanji details, as in the app.
- `partOfSpeechPhrase` leaves out "Unclassified", which tells a learner nothing, and a generic
  "Verb", "Noun", or "Adverb" beside a phrase that already says it.
- `wordSlug` is shared so every client builds the same word URL as the app's share links (ADR
  0007).

## Examples

- **Linking** (`linkedTokens`). A word the page's entry is written with is that entry; any other
  is looked up by its forms, narrowed by part of speech and reading, and links to its one entry or
  lists its candidates. A joined inflection is looked up by its dictionary form, never its surface,
  which can be an unrelated headword (しまった is also "darn it!"); one that resolves to nothing
  falls back to its pieces. A client's `lookup` should cache by form, as the app's analyzer does.
- `formLookup` finds nothing for an ASCII form. The app looks one up in English, which linking
  doesn't port, so the conformance suites would show a word the app links differently.
- A Kuromoji analysis whose tokens don't tile the text is null (the app's `invalidProviderRange`),
  and the sentence shows as one unlinked word.
- **A word's examples.** A kana headword such as でも also occurs inside other words (いつでも,
  何でも), so its examples come from the sentences Tatoeba's word index (`ExampleWordIndex`) links
  to the entry. A page lists at most 100, and the count is exact up to 50, with 51 meaning more
  (`ExampleSentenceResultCount`).
- **A query's examples.** An English query matches pairs by its English phrase, Porter-stemmed,
  and lists them only when some pair holds the exact phrase; anything else matches pairs whose
  Japanese contains it. FTS4's `offsets()` reports UTF-8 byte offsets, which `example-search.ts`
  maps to UTF-16 and then grapheme positions. The results' primary entry is highlighted for every
  search, and its own examples are listed for a romaji or deinflected query.
- **A conjugated form's examples** are the sentences the app's search for the form finds,
  normalized (a full-width Ｈ searches English), that contain it as written and in which Kuromoji
  reads it as one word, so 見たかった and 見た目 aren't examples of 見た. The screen accents the
  query as normalized.
- An example's `pairId` is the artifact's pair ID in hex; the app's ID for the pair is `esp1_` and
  it.

## Artifact

`Dictionary` (`artifact/dictionary.ts`) answers the service's requests
([`dictionary-api.md`](dictionary-api.md), Routes). Its responses are plain JSON, with maps as
records keyed by JMdict entry number.

- `attachments` names each bundled database opened with the artifact, its file in the app's
  Resources, and the `artifact_schema` (and `pack_id`) its `metadata` table must record. The packs
  map entries by Language Reference ID, so each is built for one `LanguageReferenceData.sqlite3`
  (`language_data_sha256`). `checkArtifact` checks the example index as the app's
  `validateBaseCorpus` and `validateEnglishIndex` do. Reading a new artifact version is a change to
  `supportedTransforms`, reviewed with the re-recorded suites (ADR 0006).
- `isUnreadableQuery` matches only FTS4's own query parser errors: a bare "syntax error" would hide
  a real SQL bug as no results.
- A query's examples are cached, so the results page's row, its sentences section, and each page
  of more share one retrieval. The caches of sentence lists keep a quarter as many entries, since each
  holds up to 100 sentences.
- `KanjiData` refuses kanji files that aren't the versions the core reads, and a kanji with no
  meanings or readings isn't indexable (#465).

## Rows

`detail/rows.ts` is the contract. What its types don't say:

- Every ID is a Language Reference ID in lowercase hex, as the artifact's BLOB IDs read. `entSeq`
  is `source_record_id`, the JMdict entry number in word page URLs (ADR 0007).
- A sense's `restrictions` (JMdict's stagk and stagr) are for Search; the app doesn't show them.
- A pitch's `downstep` is 0 for flat (heiban), otherwise the mora after which pitch falls. `pitch`
  is UniDic's; `compoundPitch` is CompoundPitch's estimate, which shows when UniDic has none.
- No `FrequencyRow` for a pack means it doesn't rank or list the entry.
- An example token's `reading` is Kuromoji's, in hiragana, when the token has kanji, and its
  `dictionaryForm` is set when it differs from the surface: what an ambiguous word searches for.
- An `ExampleLinkRow` with one entry in `entSeqs` is the word-detail suite's `entry`; two or more
  are its `candidates`, a word the app can't resolve to one entry (such as だ). A token with no
  dictionary word has no link. A link's `reading` replaces the token's: the entry's own reading,
  which the app shows over a word written as one of the entry's forms.
- A `WordExampleRow`'s `highlights` are the page word's tokens (the suite's `pageWord`); its
  `tokens` are set only where the page splits the sentence differently, when a joined word the
  page's entry is written as stays whole. A `FormExampleRow` is keyed by the form's spelling alone
  and has no page entry, so its words link as no word page sees them.
- An `ExampleCountRow`'s `listed` is at most 100, its `count` is exact up to 50 (51 means more),
  and `truncated` says more than 100 matched. A word page shows 25 examples and loads the rest as
  it scrolls.
- A Tatoeba pair's two sentences each have their own ID, contributor (null when Tatoeba names
  none), and license.
- A kanji's `jlpt` is KANJIDIC2's level, shown as `N` and the level. `structure` is null when
  Kanjium has none, and `words` holds at most 24. `strokes` is KanjiVG's, in a square of
  `viewportSize` (109): each stroke is opcode 0 then a point to move to, or opcode 1 then the
  three points of a cubic curve.

## Check it

`pnpm check` runs Biome, typecheck, and the unit tests, which need no artifact. The
`Dictionary core` workflow runs it on pull requests. The app-recorded suites run through the core
on the real artifact in the service's tests, and the website renders what they answer; the
`Dictionary API` workflow runs both ([`dictionary-api.md`](dictionary-api.md), Check it).
