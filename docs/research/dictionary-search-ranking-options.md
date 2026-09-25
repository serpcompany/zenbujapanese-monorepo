# Dictionary search ranking options

Date: 2026-09-25

## Answer

There is no reliable package that can replace Zenbu's dictionary-specific relevance policy and then apply the selected corpus-frequency rank inside equally relevant results. General-purpose search engines can retrieve text candidates and produce a generic document-relevance score, but they do not understand JMdict sense order, gloss atoms, written-versus-reading matches, romaji corroboration, form restrictions, or Zenbu's active frequency pack.

The lowest-risk fix is therefore **not** to replace the search stack. Restore the relevance information that Zenbu already calculated before #350, make that the primary sort key, and use active-pack frequency only inside the same relevance group. Also carry the matching gloss/sense into the result presentation so a secondary sense such as `別荘` → “prison; jail” is shown instead of the unrelated primary summary.

In tuple form:

```text
(existing dictionary presentation rank, active frequency rank, existing total-order fallback)
```

This is a small extension of the existing app-owned contract, not a new search engine.

## What Zenbu used before #350

Commit [`477014a`](https://github.com/serpcompany/zenbujapanese-monorepo/commit/477014aae7a3705e331167a91bc20f114458715f) did not introduce a search package or change dictionary ranking. At that point Zenbu already used:

- the system SQLite library through its C API (`import SQLite3`), not GRDB;
- two generated SQLite FTS4 indexes, `dictionary_gloss_fts` and `dictionary_form_fts`, for bounded candidate retrieval (the checked artifact contract still identifies the technology as `sqlite-fts4`);
- app-owned ranking introduced by [`c1d209e`](https://github.com/serpcompany/zenbujapanese-monorepo/commit/c1d209ef049379b5bd683e4d5a3a0089c4e0d269) and hardened by [`b237267`](https://github.com/serpcompany/zenbujapanese-monorepo/commit/b2372672d42320c80f3d7076ff41203f50b165fb) and [`d3f6c83`](https://github.com/serpcompany/zenbujapanese-monorepo/commit/d3f6c8325446e863313c4e8c069140bde8171016).

The English comparator distinguished strong gloss, token-only gloss, and romaji-only lanes; exact/prefix romaji corroboration; canonical sense and gloss order; exact/qualified/infinitive gloss relations; form priority evidence; and stable lexical tie-breaks. The Japanese comparator distinguished exact written, exact reading, written prefix, reading prefix, written substring, and reading substring before its lexical tie-breaks. The leading equal `DictionaryPresentationRank` group became “Best Matches”; lower relevance groups became “Additional Matches.” Frequency evidence was displayed but did not override those relevance groups.

Commit [`e580e4c`](https://github.com/serpcompany/zenbujapanese-monorepo/commit/e580e4cfb1b4c78671d40acd6145260fc87c80e3) implemented #350 by flattening those groups, deleting `presentationRank` from returned candidates, and sorting the whole bounded candidate set by active frequency first. That is the direct cause of a frequent secondary-sense match outranking clearer primary-sense matches.

Relevant current files are [`LookupClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/LookupClient.swift), [`DictionaryRanking.swift`](../../apps/ios/Modules/Sources/SearchExperience/DictionaryRanking.swift), [`SearchView.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchView.swift), and [`DictionaryRankingArtifactContract.json`](../../apps/ios/Modules/Sources/SearchExperience/Resources/DictionaryRankingArtifactContract.json).

## Options

### SQLite FTS5 and BM25

SQLite FTS5 is a strong, maintained embedded retrieval engine. Its built-in `bm25()` ranks documents from query phrase frequency, inverse document frequency, document length, and optional per-column weights; `ORDER BY rank` is the optimized default-BM25 form. FTS5 also supports phrase, prefix, proximity, and Boolean queries, custom tokenizers, and custom auxiliary ranking functions. [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html#the_bm25_function), [ranking documentation](https://www.sqlite.org/fts5.html#sorting_by_auxiliary_function_results), [extension API](https://www.sqlite.org/fts5.html#extending_fts5)

What it can replace: Zenbu's FTS4 candidate retrieval, and some coarse text weighting if gloss fields are split into columns.

What it cannot replace: the dictionary policy. BM25 does not know that an exact primary gloss should beat an exact later sense, that a written-form hit should beat a reading substring, or that frequency-list rank is a secondary product signal rather than within-document term frequency. Encoding those facts as separate columns and weights, joining frequency metadata, or implementing a custom auxiliary function is still custom schema and ranking work. It would also be a migration from a currently validated FTS4 artifact, so FTS5 is not justified merely to fix this ordering bug.

### GRDB.swift with FTS5

GRDB is the credible Swift wrapper in this space: an actively maintained MIT SQLite toolkit with FTS5 table creation, query-interface support for `ORDER BY rank`, external-content synchronization, and Swift APIs for custom FTS5 tokenizers. [GRDB repository](https://github.com/groue/GRDB.swift), [full-text search guide](https://github.com/groue/GRDB.swift/blob/master/Documentation/FullTextSearch.md), [custom tokenizer guide](https://github.com/groue/GRDB.swift/blob/master/Documentation/FTS5Tokenizers.md)

GRDB would reduce low-level SQLite plumbing and improve database ergonomics. It does **not** supply a different relevance model: its FTS5 relevance ordering is SQLite's ranking, and its own documentation directs ranking behavior back to SQLite. Adopting GRDB would add a dependency and require rewriting a working read-only database layer while leaving Zenbu's semantic comparator necessary. It is a reasonable future database-maintenance decision, but not a solution to “relevance first, corpus frequency second.”

### TantivySwift

[`TantivySwift`](https://github.com/carbon/TantivySwift) is a real embedded Swift binding to Tantivy. Its repository documents iOS device/simulator support, an XCFramework distributed through SwiftPM, BM25-scored search, structured queries, field boosts, and numeric field sorting. It is MIT licensed. However, its current public surface is new and lightly adopted (the repository presently shows two stars), requires Swift 6.2 and iOS 18+, and lists only default, English-stemmed, raw, lowercase, and whitespace analyzers—no Japanese morphological analyzer. A numeric `orderBy` replaces BM25 scoring rather than composing a deterministic dictionary relevance/frequency tuple. [Package requirements and analyzers](https://github.com/carbon/TantivySwift#requirements), [search and sorting API](https://github.com/carbon/TantivySwift#search)

Tantivy itself is capable, but this binding is not a lower-risk choice than SQLite for Zenbu. Zenbu would still need to design fields, index sense metadata, integrate Japanese analysis, encode dictionary relevance, combine the active frequency pack, distribute another native binary, and rebuild/validate its bundled index. It is not recommended for this fix.

### Core Spotlight (contrast, not a package recommendation)

Apple describes Core Spotlight as an on-device private index that apps can query, and provides `rankingHint` to distinguish the relative importance of similar items. [Indexing app content](https://developer.apple.com/documentation/corespotlight/adding-your-app-s-content-to-spotlight-indexes), [`rankingHint`](https://developer.apple.com/documentation/corespotlight/cssearchableitemattributeset/rankinghint), [querying indexed content](https://developer.apple.com/documentation/corespotlight/searching-for-information-in-your-app)

It is appropriate when content should participate in system/app search, but its ranking is system-owned and not a versioned, inspectable dictionary comparator. A single ranking hint also cannot express query-dependent sense relevance followed by a user-selected frequency dictionary. It would make deterministic regression fixtures harder, not easier.

Remote services such as Algolia, Typesense, Meilisearch, or Elasticsearch can expose configurable relevance, but would introduce networking, hosting, privacy, offline, index-version, and operating-cost concerns while still requiring Zenbu to define the same domain ranking rules. They are disproportionate for a bundled dictionary and were not evaluated as implementation candidates.

## Recommendation

Keep direct SQLite and the generated index for now. Reuse the already-tested relevance machinery instead of inventing a new scoring formula:

1. Return the existing `DictionaryPresentationRank` (or a smaller stable relevance-group key) with each candidate instead of discarding it at the lookup boundary.
2. Sort first by that relevance group, then by active frequency rank, then by the existing deterministic lexical order and canonical ID fallback.
3. Preserve the selected `GlossEvidence`/sense for English queries and render its matched gloss in the result row.
4. Add regressions for `prison`, polysemous later-sense matches, Japanese exact-versus-reading/prefix cases, missing frequency evidence, and switching active packs.

FTS5 can be assessed separately if Zenbu later needs better retrieval performance or richer query syntax. GRDB can be assessed separately if reducing raw SQLite code becomes a maintenance goal. Neither change should be coupled to correcting #350's comparator.
