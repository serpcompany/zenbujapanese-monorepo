# Shared dictionary core working guide

`packages/dictionary-core` (`@zenbu/dictionary-core`) is the one TypeScript dictionary every Zenbu
client runs (ADR 0008, ADR 0009). The website runs it through the dictionary service
([`dictionary-api.md`](dictionary-api.md)), and the app runs it in JavaScriptCore, offline
([Embedded](#embedded)): search, the results screen, examples and linked words, and the word,
kanji, and kanji element pages. The browser extension will run it offline too. A client keeps its
screens and reads the files; what a screen lists, orders, labels, and says is the core's, apart from
the exceptions under [Rules](#rules). It is TypeScript source: each client compiles it (the website
through Next.js's `transpilePackages`, the service through tsx and esbuild, the app from a bundle
esbuild writes), and imports it by path, such as `@zenbu/dictionary-core/search/search`.

Run commands from `packages/dictionary-core`, after `pnpm install` at the repository root.

## What it holds

The app's Swift, in `apps/ios/Modules/Sources/SearchExperience/`, asks `embedded/` for each of
these and decodes the answer; [The app's side](#the-apps-side) says which type asks for what.

| Folder | What it does | Who asks in the app |
| --- | --- | --- |
| `search/` | Search retrieval: query normalization, deinflection, ranking, full-text phrases, and sentence search through a supplied analyzer; which handwriting candidates are kept (`japaneseCandidates`); and the radical panel (`radicals.ts`). | `LookupClient`; `SearchQuery` is `normalizeQuery`'s answer; `RadicalLookupClient`; the handwriting recognizer's adapter |
| `embedded/` | The entry point for a client that runs the core inside a JavaScript engine, as the app does: every answer the app's screens show, as JSON, and the bundle the app loads. | `DictionaryCore`, and the three engines that each own one |
| `results/` | The results screen: the frequency re-sort, Sort By and Filter, rows, chips, what VoiceOver says, and the Example Sentences, reading-refinement, and kanji rows. | `ResultsScreen` |
| `detail/` | Word, kanji, and kanji element pages from their rows: furigana, pitch, Frequency Details, conjugations, kanji, elements, share text, and a linked word's gloss. Also romaji (`romaji.ts`), strokes as points to draw (`strokes.ts`), the one-kanji check, what a link names (`links.ts`), and Image Search's notes (`phrase-note.ts`). | `WordPage`, `KanjiPage`, `KanjiElementPage`, `JapaneseRuby`, `FrequencyRow`, `KanjiCharacter`, `KanjiStrokeOrderClient`, `RomajiReadingAidText` |
| `examples/` | Example linking, inflection grouping, the ranks example retrieval shares, which English words are one word's forms (`english-inflection.ts`), and the tokenizer that splits a sentence into words (`ipadic.ts`, [The tokenizer](#the-tokenizer)). | `DictionaryTextData` |
| `artifact/` | Reads `LanguageReferenceData.sqlite3` and its packs, checks them, and answers search, word, kanji, example, and sitemap requests (`Dictionary`), and the browse pages' (`DictionaryBrowse`). `embedded/` runs the same queries. | Through `embedded/` |
| `cards/` | Word cards (`zenbu.word-cards.v1`, [`language-data/word-cards.md`](../../language-data/word-cards.md)): a word as Word Detail shows it, with the JLPT chip and a chip for each of the eight ranked lists, for apps that don't bundle the language data; the word lists that name them; the suite fields a card is checked against; and a segmented text's tokens (`zenbu.segmentation.v1`). `artifact/word-cards.ts` resolves the words and reads the cards, and `segmentText` in `artifact/word-examples.ts` splits and links a text as the example sentences are. | None: the app bundles the data. A card's chip names are `frequencyShortName`'s, as the app's chips are. |
| `browse/` | What the website's browse pages list: the kana charts, the categories and the labels each matches, the ranked and JLPT lists, the kanji lists, and the service paths the website asks for them. | None: the app has no browse screens. |
| `sources/` | The source credits every client shows (`docs/data-sources.md`). | `CreditsView` |
| `fixtures/` | Rows exported from the app's data for twelve words and the kanji 要, each word and conjugated form with its first 50 examples, for local development and tests, never production. | — |

## Rules

- **No runtime or framework.** Biome refuses `node:*`, Next.js, React, Wrangler, and Hono
  imports in `src` (tests aside), and `pnpm verify dependencies` refuses any Node built-in or
  package the core imports for more than its types. A client passes in what it has: the artifact as
  an `ArtifactDatabase` (synchronous `all(sql, params)`), the kanji files as `KanjiData` (whole, as
  the service holds them) or a `KanjiLookup` that answers one record at a time (as the app does),
  and its capabilities: `tokenize` (the core's own tokenizer) and `morphology` (the app's Sudachi).
  Without `morphology`, sentence search is off and the rest of Search is unchanged (ADR 0008).
- **It logs nothing.** It returns what happened, as a result or an error, and the client logs it
  its own way; Biome refuses `console` in `src` (tests aside).
- **A rule lives here, once.** What a screen lists, the order, a title, a label, and what
  VoiceOver says are answers the core gives every client, so a client decides none itself, apart
  from the rows of the table under Layers in [`ARCHITECTURE.md`](../../ARCHITECTURE.md). Add a
  field to the answer, and have the client show it. What the app keeps native, and why, is in
  [`ios.md`](ios.md), The dictionary core in the app.
- **Rebuild the app's bundle with the core.** The app runs a bundle of the core that is checked in
  ([Embedded](#embedded)). After changing anything the bundle holds, run
  `pnpm bundle:javascriptcore` and commit the file; `embedded/bundle.test.ts` fails until it
  matches.
- **The app records the answers.** When the app's behavior changes, re-record the suites on a Mac
  ([`ios.md`](ios.md)); the service must then pass them. The app's answers are the core's own,
  read through JavaScriptCore, so the suites pin them against a later change, and the service
  replays each suite twice: through its own path, and through `embedded/` as the app asks.
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
- `tokenize` splits a sentence into words with the IPADIC files the app bundles
  (`apps/ios/Modules/Sources/SearchExperience/Resources/Kuromoji`), answering as kuromoji.js's
  `tokenize` does: `word_position` is 1-based, in UTF-16 code units, as the app's `NSRange` reads
  it. Every client's is the core's own ([The tokenizer](#the-tokenizer)): the service builds it
  from the files it read and passes it, and the app hands the embedded host the files.
- `morphology` is an analyzer such as the app's Sudachi, whose dictionary is 217 MB. A
  `MorphologyWord` lists its part-of-speech tags most general first (名詞, 動詞), and its
  `dictionaryForm` is `*` or empty when the analyzer has none. An analysis that throws finds no
  words, as in the app.

## Embedded

`embedded/dictionary.ts` is how a client runs the core inside a JavaScript engine that has no
modules, files, or event loop of its own, which is how the app runs it in JavaScriptCore
([`ios.md`](ios.md), The dictionary core in the app).

- **The host supplies what it has.** Each function on `EmbeddedHost` is optional, and a part that
  needs one the host lacks says so (`The host has no dictionary to read`):
  - `all(sql, parametersJSON)` runs a statement on the artifact and answers an object
    (`HostRows`): `{rows: [...], blobs: [...]}`, each row an object keyed by column, each BLOB as
    lowercase hex with its column named in `blobs`, or `{error: message}`. It is an object, not
    JSON text, so a host can have its engine parse the rows natively and keep no second copy of a
    broad search's tens of megabytes as a string. `hostDatabase` turns the answer into the
    `ArtifactDatabase` the rest of the core reads.
  - `interrupted()` is true once nobody wants a search's answer. An embedded engine can't be
    stopped from outside while it ranks, so ranking asks it every 1,024 rows and comparisons
    (`stopIfInterrupted` in `search/database.ts`) and throws `interruptedSearch`. Without it a
    learner who keeps typing would wait for each abandoned prefix, such as `s`, to finish ranking
    its tens of thousands of candidates. A long loop added to `search/` over a query's candidates
    needs the same check; `countedWords` asks before each line.
  - `tokenizerFile(name)` answers one of the tokenizer's dictionary files, unpacked, as an
    `ArrayBuffer`, or null. The core asks for all eleven the first time it tokenizes
    ([The tokenizer](#the-tokenizer)). A host without the files is asked for a sentence's words
    through the call (below). `tokenize(text)` stands in for the tokenizer in the core's own
    tests, which hand it a sentence's tokens; no client passes it.
  - `kanjiSources()`, `kanjiEntry(character)`, `kanjiStructure(character)`, and
    `kanjiElement(glyph)` answer the kanji files' source identities and one record at a time, as
    the files hold them, or null. The two files parse to 16 MB of objects, which an engine that
    held them would walk on every collection, so the host keeps them and the core asks for the
    few a page reads.
  - `radicals()` answers the radical file (`RadicalReferenceData.json`) whole, once, when the
    radical panel is first asked for.
  - `frequencyLists()` and `frequencyListRows(list, sql, parametersJSON)` answer the learner's
    frequency lists and one list's rows, as `all` does ([`frequency.md`](frequency.md)).
- **Three parts, each built when first asked.** `EmbeddedLookup` (`lookup.ts`) searches and reads
  forms; `EmbeddedText` (`text.ts`) retrieves examples and links a text's words; and
  `EmbeddedPresentation` (`presentation.ts`) builds what a screen shows from what the host already
  read and its frequency lists, and needs no database. A host can give each its own engine, as the
  app does, so a long search never holds up a row's furigana.

  | Method | Argument | Answers |
  | --- | --- | --- |
  | `search` | A query | `EmbeddedSearchResults`: each result as the row the screen lists (Language Reference ID, headword, reading, summaries, `relevance`, `fallbackOrder`, and the `match` label the suites record), the reading refinement, `resolution`, and `primaryEntry` |
  | `entriesMatchingFirstForms` | For each word, the forms to try in order | Every form tried: nothing for a form no entry is written or read as, and for a word's first form that has entries, each as a `LinkEntry` (ID, reading, parts of speech), ranked and deduplicated as search ranks an exact form. An ASCII form is looked up in English. |
  | `entriesContainingKanji` | A kanji | The IDs of its 24 words, in the page's order |
  | `websiteRoute` | A link's host and percent-encoded path, as the host's own URL parser reads them | What the link opens: a word by its Language Reference ID, a kanji, a search, or home. A word link whose entry number the data lacks searches its slug, or opens home without one. |
  | `relatedWord`, `savedWord` | A related word (its target's ID, or how to search for it and how it is written and read); a saved word (its stored ID and how it was written and read) | A related word's entry, or null: with no target, the result written and read the same, else the first. What a saved word opens: its entry, else a result written and read the same, else a search for its headword. |
  | `canonicalEntries`, `tatoebaContributors` | Groups of equivalent entries' IDs; — | Each group's smallest ID, which stands for it (`canonicalEntry`); the Tatoeba contributors, with their counts |
  | `normalizeQuery` | What was typed | The query Search reads |
  | `japaneseCandidates` | What a handwriting recognizer offered | Those written only in Japanese, normalized, each once, in order |
  | `isKanji`, `containsJapaneseText`, `writtenLanguage` | A string | Whether it is one kanji; has kana or kanji as search reads it; `ja`, `en` (only Latin letters), or null |
  | `romaji`, `sentenceRomaji` | A reading; a sentence's words, each with its surface and reading | The reading in romaji, or null for one with kanji in it; the sentence in romaji, words spaced and punctuation kept with its word, or null when a word has no kana reading |
  | `checkExamples` | — | True, or an error saying which example table or pack is missing or wrong |
  | `tokenizerReady` | — | Whether the text part can tokenize. With the host's files it reads them now, so the first sentence doesn't wait for them, and is false when one is missing or wrong. |
  | `exampleCount`, `resultsExampleCount`, `resultsExamples` | A query, or a query with the results' primary entry | The Example Sentences row's count, and its sentences with their count line |
  | `entryExamples`, `formExamples` | An entry's ID; a conjugated form | A word page's sentences with their count, and a form's |
  | `linkedTokens` | A text, the page's query, and its entry | Each word with its place in the text, its entry or candidates, the furigana to draw, whether it is the page's word or matches the query, and which neighbour a punctuation mark stays with on a line (`attaches`) |
  | `countedWords` | A list of lines | The ID of each word that counts toward comprehension, in order, once each time it occurs: one linked to a single entry that is not a function word |
  | `resultsScreen` | A search's answer, the Example Sentences count, and the learner's state (Sort By, Filter, known words, and whether the query was picked in the radical panel) | `LearnerResultsScreen`: sections, rows with chips, the menu with each choice's title and announcement, notices, and what VoiceOver reads. A one-character query from the radical panel lists only its leading words. |
  | `wordRows` | Entries, and which the learner knows | A sheet's candidate rows, with their chips |
  | `ruby` | A surface and its reading | Furigana segments, kanji by kanji where one split fits |
  | `wordPage` | An entry as the host read it | `EmbeddedWordPage`: furigana, part of speech, conjugations with each row's note, pitch with its graph, senses, frequency rows with their details, alternatives, kanji, related words, and share text |
  | `kanjiPage`, `kanjiMeanings`, `candidateMeanings` | A kanji, its words, and the word it was opened from; a kanji; candidates | `EmbeddedKanjiPage`: stats, meanings, readings and words, elements, components, share text, and the reading to save; its meanings; a one-kanji candidate's meaning |
  | `kanjiElementPage` | A glyph | `KanjiElementDetail`, or null for a kanji that is no element |
  | `kanjiStrokes` | A stroke diagram's row as the host read it (viewport, stroke count, and KanjiVG's packed strokes) | `StrokeDiagram`: each stroke as the points to draw through, a move then curves with their two control points; an error for a diagram that is broken |
  | `radicalPanel` | The radicals picked, in order | `RadicalPanel`: the kanji holding all of them, fewest other radicals first, and the radicals still worth offering, grouped under their stroke counts with each group's heading |
  | `gloss`, `phraseNote` | A meaning; a phrase with its entry's meanings and parts of speech | The gloss under a linked word, or null; a set phrase's first three meanings, or null |
  | `sourceCredits` | `app` or `website` | That client's source credits and conversion notice |

- **The host reads the entries it shows.** Answers name entries by Language Reference ID, and the
  host reads each from the artifact itself. A page's method takes the entry the host read.
- **A text's words cost one or two statements.** `linkedTokens` looks every word's forms up in one
  round (`entriesMatchingFirstForms`), then the forms still unmatched, and caches by form, so a
  page mostly asks nothing. `countedWords` looks all its lines up together and keeps 4,000 lines.
- **A call is an object.** `embeddedEndpoint(...).begin(method, argument)` starts a call and returns
  it. Its `outcome()` is a JSON string: `{"value": ...}`, `{"error": message}`, or `{"analyze":
  text}` when a call needs the words of a sentence from a host that gave no `tokenize`. The host
  then analyzes the text with whatever it has, answers `analyzed('{"words": [...]}')` or
  `analyzed('{"error": ...}')`, and reads the outcome again. The host's database is synchronous, so
  a call settles before `begin` or `analyzed` returns to the host and nothing is polled; calls keep
  their outcomes apart, so a second can start while the first waits for its analysis. A method may
  answer null (`kanjiElementPage`, `gloss`): `{"value": null}` is an answer. `value()` is a
  finished call's value alone, as its own JSON text.
- **An answer that needs no waiting can be asked for at once.** `answer(method, argument)` runs
  the method and returns its value, and `answerJSON(method, argument)` returns it as JSON
  (`null` for nothing). Both throw for a method that would wait (`search`, `linkedTokens`, and the
  others that read through the async search database) or that the core doesn't have. A host
  uses them for what a view asks while it is being drawn: one crossing into the engine, no
  promise, and for a string or a flag no JSON either.
- **The bundle.** `embedded/javascriptcore.ts` reads the host from the global `zenbuHost` and sets
  the endpoint as the global `zenbuDictionary`. `pnpm bundle:javascriptcore`
  (`scripts/bundle-javascriptcore.mjs`) bundles it with esbuild into
  `apps/ios/Modules/Sources/SearchExperience/Resources/DictionaryCore/dictionary-core.js`, which
  is checked in so the app builds without Node. `embedded/bundle.test.ts` builds it again and
  fails when the file differs.
- The service replays every app-recorded suite through the endpoint too, on `node:sqlite` with the
  real tokenizer and kanji files (the `embedded*.conformance.test.ts` files in
  `apps/dictionary-api/src/conformance/`), so a change that breaks the app's path fails on a pull
  request before any Swift runs.

## The tokenizer

`examples/ipadic.ts` splits a sentence into words from the dictionary files kuromoji.js builds
from MeCab's IPADIC: the double-array word index (`base`, `check`), each word's ids, cost, and
feature line (`tid`, `tid_map`, `tid_pos`), the cost of one word following another (`cc`), and
the classes and words for text the dictionary doesn't have (`unk`, `unk_map`, `unk_pos`,
`unk_char`, `unk_invoke`). `ipadicTokenizer(read)` asks `read` for each file, unpacked, the first
time it tokenizes. It is the only tokenizer: the app runs it in JavaScriptCore, and the
website's dictionary service runs it in Node (`apps/dictionary-api/src/tokenizer.ts`).

- **It is a port of kuromoji.js 0.1.2** (Apache-2.0, Takuya Asano; the license ships beside the
  dictionary files, `Resources/Kuromoji/LICENSE-2.0.txt`), which both clients ran until
  2026-10-11, and it answers exactly as kuromoji.js did, so no sentence links differently than
  it used to. That includes what kuromoji.js got wrong, because the rest of the core already
  handles it (`kuromojiCandidates` shows a sentence whose tokens don't tile it as one unlinked
  word):
  - a sentence is split after every 、 and 。, and the words of each later part are numbered from
    the last word of the part before, which is off when that word is longer than one character;
  - a word's place counts characters, but a run of unknown characters outside the basic plane is
    measured in UTF-16 units, so the words after it are skipped;
  - a high surrogate without its low surrogate, a NUL, and a character whose class lists no
    words make it throw; and
  - a class's `max_length` is ignored: one unknown word spans the whole run of a grouped class.

  Fixing one of these is a behavior change for every client at once: change it here, and record
  the suite again.
- **Why the core has its own.** In an engine without a JIT, kuromoji.js spent half of each linked
  sentence: it re-encodes the rest of the sentence at every character, decodes each word's
  feature line a byte at a time, and builds an object per lattice node. `ipadic.ts` encodes a
  sentence once, walks the index in place, keeps the lattice in typed arrays, and remembers each
  word's features. In JavaScriptCore without its JIT it tokenizes a sentence in 0.09 ms where
  kuromoji.js took 0.38 ms, and is ready in 0.03 s where kuromoji.js took 0.4 s (it built an
  object for each of the 326,000 word lists; `ipadic.ts` indexes them in place).
- **kuromoji.js's answers are recorded, and kuromoji.js is gone.** Before it was removed, the two
  were compared over all 232,774 example sentences, the 655,146 headwords, readings, and
  summaries, and 1.7 million random texts: every token the same, and the same 118,171 texts
  refused. What pins the port now was recorded from kuromoji.js itself:
  - `apps/ios/LanguageData/Conformance/tokenizer.json` holds its tokens for 747 texts (example
    sentences, words, and odd cases, eleven of them refused) and its digest over 20,000 random
    texts built from the pieces the suite lists.
    `apps/dictionary-api/src/conformance/tokenizer.conformance.test.ts` replays it over the
    bundled dictionary, and `pnpm tokenizer-suite` in `apps/dictionary-api` records it again.
  - `examples/ipadic.test.ts` holds its digest over 30,000 random texts on a small dictionary
    built to reach the odd cases (`examples/ipadic.fixture.ts`), beside cases written out.
- The files are little-endian and are read through typed arrays, so `ipadicTokenizer` refuses to
  start on a big-endian machine instead of misreading them.

## Writing for an engine without a JIT

The app runs the core in JavaScriptCore's interpreter (an app's JavaScriptCore has no JIT), where
what is cheap differs from Node and a browser. Measure there before and after a change to
anything a list row or a linked sentence runs:
`/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc --useJIT=false`
runs the app's bundle on a Mac, and `startSamplingProfiler()` with
`samplingProfilerStackTraces()` says where the time goes.

- **A loop the engine runs natively beats the same loop written out.** A regular expression test
  over a string (`everyUnitIsAGrapheme`, `isASCII`, `isJapaneseOnly`), `split`, `indexOf`,
  `includes`, and `normalize` run in native code. A `for` loop over `charCodeAt` costs about
  0.05 ms per thousand characters, eight times the regular expression.
- **Array helpers that take a function are written in JavaScript in this engine.** `map`,
  `filter`, `some`, `every`, `find`, `Array.from`, a `for...of` over `entries()`, and `replace`
  with a function all interpret a call per element. They are fine once per screen; in what runs
  per character or per word, loop.
- **Remember what repeats.** A kanji's reading forms (`kanji-split.ts`), a form in hiragana and
  katakana (`examples/kana.ts`), a kana word's romaji in pieces (`romaji.ts`), and a word's
  dictionary line (`ipadic.ts`) are each worked out once and kept in a bounded table.
- **A cache hit should cost a lookup.** `LruCache` moves an entry to the front only when half
  the cache is newer than it, so reading a recent entry is one `Map.get`; an entry that is read
  survives at least half the cache's capacity in new entries.

## The app's side

Paths are relative to `apps/ios/Modules/Sources/SearchExperience/`.

| Swift | Asks | For |
| --- | --- | --- |
| `LookupClient.swift` (`LanguageReferenceData`, `TatoebaAttributionClient`) | `search`, `entriesMatchingFirstForms`, `entriesContainingKanji`, `websiteRoute`, `relatedWord`, `savedWord`, `canonicalEntries`, `tatoebaContributors` | Search, a form's entries, a kanji's words, what a link, a related or a saved word opens, which entry stands for equivalents (it reads entries), Tatoeba's contributors |
| `SearchQuery.swift` | `normalizeQuery` | The query every screen holds |
| `DictionaryTextData.swift` (`ExampleSentenceClient`, `JapaneseTextAnalysisClient`) | `checkExamples`, `tokenizerReady`, the example methods, `linkedTokens`, `countedWords` | Example sentences, linked words with each word's line-breaking, and the words `Comprehension` counts. It hands the core the tokenizer's files (`TokenizerDictionary.swift`). |
| `PresentationCore.swift` (`RomajiReadingAidText`, `LinkedJapaneseText`) | `romaji`, `sentenceRomaji` | The Romaji reading aid, for a reading and for a sentence |
| `RadicalLookupClient.swift` (`RadicalInputView`) | `radicalPanel` | The radical panel |
| `KanjiStrokeOrderClient.swift` | `kanjiStrokes` | The strokes Kanji Detail draws |
| `ImageTextFlowModel.swift`, `ImageTextRecognitionClient.swift`, `Translate/TypedTranslationCard.swift` | `containsJapaneseText`, `writtenLanguage` | The lines and words Image Search keeps, and typed text's language |
| `HandwritingRecognitionLiveAdapter.swift` | `japaneseCandidates` | Which of Vision's candidates the handwriting panel offers, when the bundled model (`OfflineHandwritingRecognizer.swift`) gives none. The model's own candidates are offered as they are. |
| `ResultsScreen.swift` (`SearchResultsView`, `SearchResultsMenu`, `ResultRow`, `RecognizedWordSheet`) | `resultsScreen`, `wordRows` | The results screen and a sheet's candidates |
| `JapaneseRuby.swift` | `ruby` | Furigana wherever a word is drawn |
| `WordPage.swift` (`WordDetailView`, `WordDetailSections`, `WordHeadline`, `PitchAccentBadge`, `ConjugationsView`) | `wordPage` | The word page, with its frequency rows, and its conjugations |
| `KanjiLookupClient.swift` (`KanjiDetailView`, `KanjiDetailSections`, `KanjiElementDetailView`, `SearchInputPanel`) | `kanjiPage`, `candidateMeanings`, `kanjiElementPage`, `isKanji` | The kanji page, handwriting candidates' meanings, the element page, and whether a string is one kanji |
| `DictionaryEntry.swift` (`shortMeaning`), `ImageTextExplanationClient.swift` | `gloss`, `phraseNote` | The meaning under a linked word; an Image Search note |
| `SourceCredits.swift` (`CreditsView`) | `sourceCredits` | Credits & Attributions and Licenses |

The core began as a port of the Swift these files replaced: `LookupClient`'s search and ranking,
`SearchResultsView`, `SearchResultFrequencyOrdering`, `WordDetailView`, `JapaneseConjugationClient`,
`KanjiReadingSplitter`, `JapaneseTextAnalysisClient`, and the rest. That Swift is gone (issue 481).
The modules keep its names and its ways of comparing ([Matching the Swift](#matching-the-swift)),
their tests still name the Swift each case came from, and the app-recorded suites
(`apps/ios/LanguageData/Conformance/`) pin what it showed. Before each part's Swift was removed,
the core's answer was compared with it across the whole of the data: every kanji's page and every
element's page (13,139 characters), every entry's first meaning as a gloss (194,430), and every
headword, reading, and summary as a query. The later moves were compared the same way: romaji for
1,028,786 strings (every headword, form, reading, conjugated form, and example-sentence word) and
for every one of the 232,774 example sentences, every stroke diagram (6,430), 5,954 picks of
radicals, the kanji check for every scalar, the handwriting filter over 205,758 strings, and 637
website links, 250 related words, and 360 saved words over real entries.

## Matching the Swift

The core answers as the Swift it replaced did, which the suites pin.

- **Characters.** A Swift `Character` is an extended grapheme cluster, so the core iterates
  `graphemes` wherever the Swift iterated Characters. `graphemes` and `graphemeCount` skip
  segmenting when every UTF-16 unit is a grapheme of its own (printable ASCII, and the CJK, kana,
  and full-width blocks less their combining marks): `Intl.Segmenter` is slow in an engine
  without a JIT, linking asks for every word's graphemes, and example retrieval counts every
  matching sentence. `normalizeQuery` likewise returns a folded query that has no separator as
  it is.
- **Order.** `compareStrings` is Swift's `<`: by Unicode scalar, not UTF-16 unit; ranking compares
  fingerprints with it. SQLite compares a BLOB by its bytes, which lowercase hex keeps, and text by
  code point (`compareCodePoints`); its `instr()` and `length()` count code points, so `kanjiWords`
  measures headwords in code points.
- **Word separators.** `normalizeQuery` separates words at white space and at U+FEFF, and a mark
  right after a separator goes with it (NFKC turns ゛ into a space and a mark). The Swift went by
  grapheme, and kept U+FEFF, a mark after a tab, and a space after a prepended mark (U+0600).
  `normalizeQuery` also normalizes again once lowercased (J and U+030C become ǰ), so its own answer
  normalizes to itself. NFKC composes a halfwidth kana and its voiced mark (ｶﾞ is ガ, where
  Foundation left カ and a combining mark), and a word's final Σ lowercases to ς.
- **Twins.** Swift compares strings by canonical equivalence, so a CJK compatibility ideograph
  equals the kanji it unifies with (U+FA5B and 者); the kanji files hold 74 such pairs, each with
  its own record. `kanji-element.ts` treats a twin as the same kanji where the app did (which one
  stands alone, and leaving it out of the kanji containing the element), and nowhere else. A host
  keys the records by scalar, so a twin never answers for the other.
- **Bound text.** The app's Swift search bound text as C strings (`sqlite3_bind_text` with length
  -1), so SQLite read a parameter up to its first NUL; `DictionarySearch` truncates its parameters
  there, whatever the client binds.
- **Romaji.** The app's romaji was Foundation's `applyingTransform(.toLatin)`, which is ICU's
  Any-Latin. `detail/romaji.ts` is that transform for kana, rule for rule, from the rules and
  filters the system's ICU 78 holds: the text is taken a run of one script at a time; a hiragana
  run is turned to katakana first, and only its kana, its voiced mark, and the long mark are
  touched; a katakana run also turns 、 and 。 into a comma and a full stop; a rule sees the
  text on either side of its run, so っ before a katakana syllable still doubles it. It keeps
  ICU's spellings as they were shown: kon'nichiha, toukyou, hanadji, and a tilde before a small
  kana that forms no syllable (ウィ is u~i). On the bundled data it differs from Foundation for
  no reading and no example sentence; it differs where a string holds another writing system,
  which Foundation also turned to Latin letters (α to a, 한 to han, and 〇 to the Chinese líng)
  and the core leaves as written. `apps/ios/LanguageData/Conformance/romaji.json` holds the
  recorded cases.
- **Links.** `websitePage` in `detail/links.ts` reads a zenbujapanese.com link as the app's
  `WebsiteLink` did, and the website reads a word segment with the same `parseWordSegment`. A
  word link's entry number must be one JavaScript holds exactly; the Swift accepted any that fit
  64 bits and then found no such entry, so such a link searched its slug where it now opens home.
- **Kana.** Each conversion is the one its Swift uses, so they stay separate. `examples/kana.ts` is
  ICU's Hiragana-Katakana transliterator, which Foundation's `applyingTransform` runs: it folds
  halfwidth and circled katakana, spells ヿ and ゟ out, maps the iteration marks, and composes
  (`kana.test.ts` pins cases read from Foundation on macOS). `hiragana` and `katakana` in
  `detail/text.ts` shift scalar by scalar, `kanji-split.ts` shifts only one-scalar Characters, and
  `ruby.ts` turns ヷ–ヺ, which have no precomposed hiragana, into a kana and a combining dakuten,
  still one Character each so the reading's positions don't move.
- **Where the Swift threw**, the core returns an error value (`RetrievalError`,
  `ExampleSearchError`) or null, and the page shows what the app showed then, usually no examples.
  Through `embedded/` it is the call's error, which the app names as before
  (`missingEntryEvidence`).

## Search

- `deinflect` rewrites suffixes, chaining rules by word class: any rule applies to the surface, then
  only a rule whose input classes include the class the previous rule produced, up to six deep. Its
  candidates are hypotheses that lookup filters by part of speech. `romajiDeinflectedCandidates`
  tries the irregular verbs first, since their regular-looking alternatives are words too.
- When a Japanese query deinflects, an exact dictionary form stays first (した lists 下 and 舌
  before する), and the deinflected lemmas follow it, ahead of prefix and contains matches.
- `deduplicated` collapses entries that share a semantic fingerprint into the lowest Language
  Reference ID (`canonicalEntry`) and takes the JMdict entry number from that same entry, so the
  two always name one entry. `rank` orders entries and sets the leading lexical group (the app's
  legacy rank); `presentationRank` is the coarse rank shown, the group's strongest after merging.
- `DictionarySearch` answers a query FTS4's own parser refuses as finding nothing, for every
  client (`isUnreadableQuery`): a bare "syntax error" would hide a real SQL bug as no results.
- An English query's match groups are, strongest first: a strong gloss (the query, or "to" and
  the query, with or without notes in parentheses that end it) in the first sense; one in a later
  sense; a gloss that mentions the query; a romaji-only match, by exact, prefix, then contains.
  The frequency re-sort orders within a group, and `compareEnglishRanks` breaks ties by JMdict
  priority, sense, gloss order, romaji corroboration, headword length, and fingerprint (#701).
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
  cutoffs, and JLPT levels map onto the same scale. `frequency.test.ts` pins each pack's disclosure,
  and `coveredSourceRows` (the rows a rank's percentile divides by), to the catalog. A row's label
  leaves out the app's "Double tap for details." hint, since the website's row opens a dialog.
- **Furigana.** `rubySegments` anchors each kanji run on the first match of the next kana run, as
  the app does. `splitKanjiReading` splits a segment kanji by kanji only when exactly one split
  fits the kanji's KANJIDIC2 on and kun readings, taken without okurigana, with their voiced and
  half-voiced sound changes, and with a final つ, ち, く, or き as a small っ (学 がく → がっ); 々
  reads as the kanji before it.
- **Kanji details.** `kanjiWords` groups the entries written with the kanji by semantic fingerprint
  and orders the groups by a headword starting with the kanji, the shortest headword, any common
  entry, the highest rank score, then the fingerprint; each of the first 24 groups shows as its
  entry with the smallest ID (`canonicalEntry`). `kanjiCandidateRows` picks those 24 groups in
  SQL, in the same order, so a kanji written in thousands of words (日) hands `kanjiWords` a few
  dozen rows; change the two orders together, which the kanji-detail suite checks. Stroke data
  that doesn't decode shows no stroke order rather than failing the page, since clients read
  `KanjiStrokeData.sqlite3` as the app ships it. A character with a variation selector has no
  kanji details, as in the app.
- **Kanji elements** (`kanji-element.ts`). An element's page stands alone the most frequent
  kanji among the element and its alternatives (a ranked kanji before an unranked one, then by
  code point), and lists the kanji containing it without that one. A kanji shows its first three
  meanings and says all of them. The website has no element page yet.
- `partOfSpeechPhrase` leaves out "Unclassified", which tells a learner nothing, and a generic
  "Verb", "Noun", or "Adverb" beside a phrase that already says it.
- `shortGloss` is a meaning's first part, without a note in brackets or a leading "to", cut to
  seventeen characters and an ellipsis: what the app shows under a linked word.
- `wordSlug` is shared so the service and the website build the same word URL (ADR 0007). The
  app builds none: its Share sends text, and it only reads a link (`websitePage`).

## Examples

- **Linking** (`linkedTokens`). A word the page's entry is written with is that entry; any other
  is looked up by its forms, narrowed by part of speech and reading, and links to its one entry or
  lists its candidates. A joined inflection is looked up by its dictionary form, never its surface,
  which can be an unrelated headword (しまった is also "darn it!"); one that resolves to nothing
  falls back to its pieces. A client's `lookup` should cache by form, as `EmbeddedText` does.
- A word is looked up only when it is written in kana and kanji, so linking never asks for an
  ASCII form, and `formLookup` finds nothing for one. `entriesMatchingFirstForms` does look one
  up, in English, for the app's own exact-form lookups.
- A tokenizer's analysis whose tokens don't tile the text is null, and the sentence shows as one
  unlinked word.
- **A word's examples.** A kana headword such as でも also occurs inside other words (いつでも,
  何でも), so its examples come from the sentences Tatoeba's word index (`ExampleWordIndex`) links
  to the entry. A page lists at most 100, and the count is exact up to 50, with 51 meaning more
  (`ExampleSentenceResultCount`).
- **A query's examples.** An English query matches pairs by its English phrase, Porter-stemmed,
  the exact phrase first. Without one, a match needs each word to be the query's in another
  inflection (`sameWordInAnyForm`), and a `*` query lists none (#428, unlike the Swift). Anything
  else matches pairs whose Japanese contains it. FTS4's `offsets()` reports UTF-8 byte offsets,
  which `example-search.ts` maps to UTF-16, then grapheme positions. The results' primary entry is
  highlighted for every search, and its own examples are listed for a romaji or deinflected query.
- **A conjugated form's examples** are the sentences the app's search for the form finds, normalized
  (a full-width Ｈ searches English), that contain it as written and in which the tokenizer reads it
  as one word, so 見たかった and 見た目 aren't examples of 見た. The screen accents the query as normalized.
- An example's `pairId` is the artifact's pair ID in hex; the app's ID prefixes it with `esp1_`.

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
- A query's examples are cached, so the results page's row, its sentences section, and each page of
  more share one retrieval. The caches of sentence lists keep a quarter as many entries, since each
  holds up to 100 sentences.
- `KanjiData` refuses kanji files that aren't the versions the core reads, and a kanji with no
  meanings or readings isn't indexable (#465).

## Browse

`DictionaryBrowse` (`artifact/browse.ts`) answers the browse routes
([`dictionary-api.md`](dictionary-api.md), Routes) with SQL of its own, since the app has no
browse screens. Its kana groups and categories come from one `BrowseIndex`
(`artifact/browse-index.ts`), built in a few passes over the artifact. `warm()` builds it, keeps
the totals, the category counts, the ranked lists' counts, every kanji list, and the sitemap, and
runs each statement a browse page asks once, so the service calls it before a worker reports
ready and a page's first request prepares nothing:

- **Kana.** A word is under the script of its reading's first character: hiragana for
  U+3041–U+309F, katakana for anything else, so every entry is under one of the two. A kana's
  page groups its words by their first two characters; a word read as the kana alone is listed on
  the kana's own page. Groups list their words in kana order (by reading, then JMdict entry
  number), 200 to a page (`browsePageSize`).
- **Categories** (`browse/categories.ts`) match any sense's `partsOfSpeech`, `usage`, `fields`, or
  `dialects` labels ([`apps/ios/Tools/README.md`](../../apps/ios/Tools/README.md),
  `jmdict_labels.py`), or JMdict's common marker. A category's row shows the first sense that has
  its label, so と under Nouns reads "promoted pawn", not "if, when". Most used first, a category
  lists the words TUBELEX ranks whose first sense has the label, then those that have it only on a
  later sense, each by TUBELEX rank, then the words TUBELEX doesn't rank, in kana order. TUBELEX
  ranks a word by all its uses, so ranking a later sense's word among the first would put と at the
  top of Nouns and 行く at the top of Slang. It also lists them in kana order. Labels the website
  leaves out (names, and vulgar, derogatory, sensitive, or X-rated words) have no category.
- **Ranked lists** (`browse/lists.ts`) are TUBELEX, and the Wikipedia and Jiten lists in
  `RankedLists.sqlite3`, each to rank 10,000, in bands of 1,000 ranks (`rankBand`); a band lists
  the words ranked in its range, so ranks a source row maps to no entry leave gaps. Wikipedia's and
  Jiten's lists count spellings (Jiten's with readings) without naming the entry, and the app's
  mapping (`FrequencyPackMappingV2.sql`) ranks a row only when it names one entry, so spellings
  several entries share, such as に and は, have no rank there. The JLPT lists are the level pack's
  words at each level, in kana order.
- **Common words** on the dictionary home (`summary().commonWords`) are the 24 most used common
  words that are content words (`browse/content-words.ts`): not ones whose first sense is a
  particle, auxiliary, conjunction, or copula, nor ones that are only a prefix or suffix.
- **Kanji lists** are KANJIDIC2's school grades 1 to 6, secondary school (grade 8), jinmeiyō (grades
  9 and 10), the JLPT levels N5 to N1 (`wallerJlptLevel`, from Jonathan Waller's kanji lists, not
  KANJIDIC2's `jlpt`), and the jōyō kanji (grades 1 to 6 and 8) by stroke count, each most frequent
  first by KANJIDIC2's newspaper frequency, then by code point. Jinmeiyō holds 57 CJK compatibility
  characters, such as U+FA45 for 海; one KANJIDIC2 gives no meaning shows its base kanji's.
- **Thin lists.** The sitemap answer gives every list's word count, so the website can leave out
  of the browse sitemaps the lists of fewer than `minimumIndexedWords` (10).

## Rows

`detail/rows.ts` is the contract. What its types don't say:

- Every ID is a Language Reference ID in lowercase hex, as the artifact's BLOB IDs read. `entSeq`
  is `source_record_id`, the JMdict entry number in word page URLs (ADR 0007).
- A sense's `restrictions` (JMdict's stagk and stagr) are for Search; the app doesn't show them.
- A pitch's `downstep` is 0 for flat (heiban), otherwise the mora after which pitch falls. `pitch`
  is UniDic's; `compoundPitch` is CompoundPitch's estimate, which shows when UniDic has none
  (`shownPitch`). The app reads both, and its word page chooses.
- No `FrequencyRow` for a pack means it doesn't rank or list the entry.
- An example token's `reading` is the tokenizer's, in hiragana, when the token has kanji, and its
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
- A kanji's `jlpt` is the level Jonathan Waller's kanji lists give it (`wallerJlptLevel` in
  `KanjiReferenceData.json`), shown as `N` and the level, and null for a kanji his lists leave out.
  KANJIDIC2's own pre-2010 `jlpt` is still in the file, and nothing reads it. `structure` is null
  when Kanjium has none, and `words` holds at most 24. `strokes` is KanjiVG's, in a square of
  `viewportSize` (109): each stroke is opcode 0 then a point to move to, or opcode 1 then the three
  points of a cubic curve.

## Check it

`pnpm check` runs Biome, typecheck, and the unit tests, which need no artifact. The
`Dictionary core` workflow runs it on pull requests. The app-recorded suites run through the core
on the real artifact in the service's tests, and the website renders what they answer; the
`Dictionary API` workflow runs both ([`dictionary-api.md`](dictionary-api.md), Check it).
