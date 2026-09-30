# Shared dictionary core working guide

`packages/dictionary-core` (`@zenbu/dictionary-core`) is the one TypeScript dictionary every Zenbu
client runs (ADR 0008, ADR 0009). Today the website runs it through the dictionary service
([`dictionary-api.md`](dictionary-api.md)); the browser extension and the apps will run it
offline, and it will replace the app's Swift. It is TypeScript source: each client compiles it
(the website through Next.js's `transpilePackages`, the service through tsx and esbuild), and
imports it by path, such as `@zenbu/dictionary-core/search/search`.

Run commands from `packages/dictionary-core`, after `pnpm install` at the repository root.

## What it holds

Each file names the Swift it ports. The app's Swift sources are in
`apps/ios/Modules/Sources/SearchExperience/`.

| Folder | What it does | Main Swift sources |
| --- | --- | --- |
| `search/` | Search retrieval: query normalization, deinflection, ranking, full-text phrases, and sentence search through a supplied analyzer. | `LookupClient`, `SearchQuery`, `DictionaryRanking`, `JapaneseDeinflection`, `DictionaryEntry`, `JapaneseTextAnalysisClient` |
| `results/` | The results screen: the frequency re-sort, rows, chips, and the Example Sentences, reading-refinement, and kanji rows. | `SearchView` (`SearchResultsScreen`), `FrequencyPack` |
| `detail/` | Word and kanji pages from their rows: furigana, pitch, Frequency Details, conjugations, kanji, and examples. | `WordDetailView`, `KanjiDetailView`, `JapaneseRubyText`, `KanjiReadingSplitter`, `JapaneseConjugationClient`, `ConjugationsView` |
| `examples/` | Example linking, inflection grouping, and the ranks example retrieval shares. | `JapaneseTextAnalysisClient`, `JapaneseInflectionGrouping`, `KuromojiMorphologyClient`, `ExampleSentenceClient` |
| `artifact/` | Reads `LanguageReferenceData.sqlite3` and its packs with the app's own SQL, checks them, and answers search, word, kanji, example, and sitemap requests (`Dictionary`). | `LookupClient`, `ExampleSentenceClient`, `KanjiLookupClient` |
| `fixtures/` | Generated rows for local development without a service. | — |

## Rules

- **No runtime or framework.** Biome refuses `node:*`, Next.js, React, Wrangler, Hono, and
  Drizzle imports in `src` (tests aside). A client passes in what it has: the artifact as an
  `ArtifactDatabase` (synchronous `all(sql, params)`), the kanji files as `KanjiData`, and its
  capabilities: `tokenize` (the app's Kuromoji) and `morphology` (the app's Sudachi). Without
  `morphology`, sentence search is off and the rest of Search is unchanged (ADR 0008).
- **Change a port and its Swift together.** The `Search parity` workflow fails a pull request that
  changes one side of a pair it lists (`.github/workflows/search-parity.yml`) without the other.
  The `search-parity-reviewed` label says the change applies to one side only.
- **The app records the answers.** When the app's behavior changes, re-record the suites on a Mac
  ([`ios.md`](ios.md)); the port must then pass them.
- **Rows are a contract.** `detail/rows.ts` is what the service answers with and the fixtures
  hold. After changing a row shape, regenerate the fixtures with
  `pnpm --filter zenbujapanese-dictionary-api fixtures`.

## Check it

`pnpm check` runs Biome, typecheck, and the unit tests, which need no artifact. The
`Dictionary core` workflow runs it on pull requests. The app-recorded suites run through the core
on the real artifact in the service's tests, and the website renders what they answer; the
`Dictionary API` workflow runs both ([`dictionary-api.md`](dictionary-api.md), Check it).
