# Japanese dictionary search engine and ranking research

Date: 2026-09-26

## Conclusion

Zenbu should **not trust the current ranking merely because its two reported
examples now pass**. The first implementation mixed retrieval metadata into a
relevance group, and the first regression encoded the resulting wrong order.

There is no mature native iOS package that owns Zenbu's full contract:

1. retrieve Japanese forms and English JMdict glosses;
2. normalize romaji and reverse Japanese inflections;
3. rank the *matching sense*, not just the containing entry; and
4. apply whichever external frequency pack the user selected only after the
   results are equally relevant.

The best available choices are:

- **Use JPDB as a product-behavior reference, not as a dependency.** JPDB
  publicly demonstrates useful handling of `prison` and `任せて`, but it
  publishes neither its search/ranking source nor a reusable search library.
  Its public API is a remote service, not an offline iOS engine.
  [JPDB About](https://jpdb.io/about),
  [JPDB changelog](https://jpdb.io/changelog)
- **Use Yomitan and 10ten as algorithm/test references.** They have extensive,
  maintained Japanese deinflection logic and explicit comparators. Yomitan's
  comparator puts source-match and deinflection quality before its configured
  frequency dictionary. It is nevertheless a GPL browser-extension codebase,
  and its term database does not provide Zenbu's English reverse-gloss search.
  [Yomitan comparator](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/ext/js/language/translator.js#L2177-L2225),
  [Yomitan package and license](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/package.json),
  [10ten comparator](https://github.com/birchill/10ten-ja-reader/blob/main/src/background/word-match-sorting.ts),
  [10ten deinflection tests](https://github.com/birchill/10ten-ja-reader/blob/main/src/background/deinflect.test.ts)
- **Prototype `jmdict-fast` as a retrieval/deinflection replacement.** It is the
  closest technical fit: an MIT Rust engine with indexed exact, prefix, fuzzy,
  romaji and English-gloss lookup plus a bundled Japanese deinflector. It is
  young, its native Swift/SPM distribution is explicitly still "coming soon",
  and it gives all English posting-list matches the same score and all
  deinflected matches the same score. It therefore cannot enforce either
  reported ordering without a final, much smaller Zenbu policy.
  [`jmdict-fast` overview](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/README.md),
  [lookup implementation](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/jmdict-fast/src/dict.rs#L302-L570)

The recommended next step is a time-boxed `jmdict-fast` spike behind Zenbu's
lookup interface, evaluated against a broad frozen corpus. Until that wins on
correctness and iOS integration, retain SQLite retrieval but replace implicit
integer grouping with an explicit, inspectable evidence record and
lexicographic comparison. The app-owned portion should be only:

```text
match quality -> deinflection quality -> selected frequency rank -> stable fallback
```

That small policy still needs tests; no package removes that responsibility.

## The four separate problems

Calling all of this "search ranking" obscures where an engine helps and where
product policy remains:

| Layer | Question | Suitable existing technology | Still Zenbu-specific? |
| --- | --- | --- | --- |
| Candidate retrieval | Which entries or senses contain the query? | SQLite FTS, `jmdict-fast`, Tantivy, Lucene | Schema, indexed fields, and result bounds |
| Japanese morphology | What lemmas can an inflected Japanese input represent? | Yomitan/10ten rules, `bunpo`, Kuromoji/Sudachi | Romaji preprocessing and ambiguity policy |
| Dictionary relevance | Is this a written-form, reading, primary-gloss, later-sense, prefix, or incidental match? | Yomitan/10ten cover Japanese source matching; no reviewed package covers Zenbu's English sense policy | Yes, especially English reverse lookup |
| Corpus frequency | Which equally relevant entry is more frequent in the active user-selected pack? | A keyed rank table | Yes: pack selection, missing ranks, and tie behavior |

SQLite describes BM25 as a function of phrase frequency, document frequency,
document length, and column weights. Those are useful document-retrieval
signals, but they do not represent an external corpus rank or JMdict sense
position. [SQLite FTS5 BM25](https://www.sqlite.org/fts5.html#the_bm25_function)

## JPDB: strong product evidence, no reusable engine disclosed

### What JPDB actually publishes

JPDB's first-party About page says that it uses JMdict/EDICT and that its
backend is written in Rust. It does not name its index, morphological analyzer,
ranking model, or a library that implements them.
[JPDB About](https://jpdb.io/about)

The first-party changelog establishes that JPDB has a morphological analyzer,
verb deconjugator, romaji search preprocessing, global frequency calculation,
and a public parsing API. It also records fixes and behavioral changes to each
of those components, including forced token boundaries,
short-causative/conditional deconjugation, romaji parsing, and global frequency
calculation. It does not publish the ranking formula or say that these
components are third-party packages.
[JPDB changelog](https://jpdb.io/changelog)

The public product also exposes global frequency ranks and lets vocabulary
lists sort by frequency across the whole corpus. This is JPDB's corpus rank,
not a selectable external frequency-pack contract like Zenbu's.
[JPDB frequency-sorted vocabulary list](https://jpdb.io/anime/21/free/vocabulary-list?offset=200&sort_by=by-frequency-local),
[JPDB vocabulary page](https://jpdb.io/vocabulary/1580640/%E4%BA%BA)

### Direct behavior check

The following is first-party live product behavior observed on 2026-09-26. It
is evidence of output, not evidence of the undisclosed implementation:

| Query | Observed JPDB behavior | What it establishes |
| --- | --- | --- |
| [`prison`](https://jpdb.io/search?q=prison&lang=english) | `刑務所` (Top 12,400), `牢獄` (10,300), and `牢` (9,500) appear before the more frequent `別荘` (9,300); the latter displays “holiday house; vacation home; villa” as sense 1 and “prison; jail” as sense 2. | JPDB demonstrably does not sort all English matches by frequency first. Dictionary/sense relevance precedes or modifies global frequency. |
| [`任せて`](https://jpdb.io/search?q=%E4%BB%BB%E3%81%9B%E3%81%A6&lang=english) | `任せる` (Top 800) appears before `任す` (4,300), with conjugation labels shown; the kanji evidence excludes the unrelated `まく` analyses seen for romaji. | Written-form evidence, deconjugation and frequency are composed successfully for this input. |
| [`makasete`](https://jpdb.io/search?q=makasete&lang=english) | Results are `任せる` (Top 800), `巻く` (2,100), `任す` (4,300), `撒く` (8,900), `負かす` (20,500), and `蒔く` (28,300), with different te-form interpretations shown. | JPDB generates ambiguous romaji/deconjugation candidates and, for this result set, orders them by global frequency; importantly, `任す` precedes `負かす`. Its candidate set and fixed corpus still differ from Zenbu's selectable-pack contract. |

### Can Zenbu use JPDB's implementation?

No reusable implementation was found in JPDB's first-party About, FAQ,
Contact, changelog, public pages, or their linked resources. The site links no
official source repository and discloses only “Rust” for its backend.
[JPDB About](https://jpdb.io/about),
[JPDB FAQ](https://jpdb.io/faq),
[JPDB Contact](https://jpdb.io/contact-us)

This is an explicit **unknown**, not a claim that JPDB uses no third-party
components internally. The defensible conclusion is narrower: JPDB does not
publish enough to embed, audit, version, or reproduce its search behavior in
an offline iOS app. Calling its remote API would also replace Zenbu's offline,
deterministic lookup with a network dependency, and the first-party changelog
shows that API and parser behavior change over time.
[JPDB changelog](https://jpdb.io/changelog)

**Decision: do not integrate JPDB as the search engine.** Keep it in a
differential test set as one respected product comparison, with divergences
reviewed rather than automatically treated as Zenbu bugs.

## Candidate evaluation

### Yomitan and 10ten

Yomitan has the clearest established comparator found. It orders term results
by primary-reading match, matched source length, text-processing-chain length,
inflection-chain length, and exact source matches; only then does it apply the
configured frequency dictionary, followed by dictionary order and dictionary
score. Its frequency updater handles rank-style and occurrence-style lists.
[Yomitan comparator](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/ext/js/language/translator.js#L2177-L2225),
[Yomitan frequency update](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/ext/js/language/translator.js#L2340-L2376),
[Yomitan frequency settings](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/ext/settings.html)

Yomitan's Japanese transforms are condition-aware and chained, while its
language-development guide explicitly requires valid and invalid deinflection
tests. That is materially safer than an untyped list of string rewrites.
[Yomitan Japanese transforms](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/ext/js/language/ja/japanese-transforms.js),
[Yomitan language-feature guide](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/docs/development/language-features.md)

10ten likewise explicitly sorts Japanese word matches using deinflection reason
count, headword-versus-reading match, and JMdict priority, and maintains an
extensive deinflection test file. Like Yomitan, it is GPL-3.0-or-later and a
browser-extension TypeScript project rather than a native Swift package.
[10ten match sorting](https://github.com/birchill/10ten-ja-reader/blob/main/src/background/word-match-sorting.ts),
[10ten deinflection tests](https://github.com/birchill/10ten-ja-reader/blob/main/src/background/deinflect.test.ts),
[10ten package and license](https://github.com/birchill/10ten-ja-reader/blob/main/package.json)

Limits:

- Yomitan is JavaScript for a browser extension, stores dictionaries in
  IndexedDB, and is GPL-3.0-or-later; it is not a Swift package.
  [Yomitan README](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/README.md),
  [Yomitan package](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/package.json)
- Its dictionary database indexes term expression and reading; glossary is
  stored data rather than the English reverse-search index Zenbu needs.
  [Yomitan dictionary schema](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/ext/js/dictionary/dictionary-database.js#L80-L150)
- It is mature, not infallible; Yomitan has an open report concerning incorrect
  frequency sorting. [Yomitan issue #1037](https://github.com/yomidevs/yomitan/issues/1037)

**Decision: adapt the staged comparison model and test discipline; do not drop
the browser engine into the app.**

### `jmdict-fast` / `jmdict-fst`

This is the closest package to Zenbu's retrieval boundary. The MIT Rust v0.1.7
engine provides memory-mapped offline data, exact/prefix/fuzzy lookup over
kanji, kana and romaji, English-gloss reverse lookup, JMdict sense data, and
Japanese deinflection through its `bunpo` crate.
[`jmdict-fst` README](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/README.md),
[`bunpo` README](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/bunpo/README.md),
[`jmdict-fast` license](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/LICENSE)

It does **not** replace ranking policy:

- every deinflected result is assigned `0.75`, then equal scores preserve the
  generation/ID order;
- English lookup lowercases ASCII tokens, AND-intersects posting lists, and
  assigns the same computed score to every intersected entry;
- it has no user-selected external-frequency join; and
- romaji lookup and Japanese deinflection are separate paths, so a romanized
  inflection still needs normalization/composition policy.

These facts are visible in the lookup implementation.
[`Dict::deinflect_candidates` and `lookup_gloss`](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/jmdict-fast/src/dict.rs#L339-L570)

Consequences for the reported cases:

- **`prison`:** its token-AND index retrieves entries containing the English
  token, but all hits receive the same score. It cannot itself decide that a
  first-sense prison gloss should beat `別荘`'s later prison sense.
- **`makasete`:** it can provide candidate lemmas after romaji-to-kana
  preprocessing, but equal-scored deinflections do not guarantee rank 8,642
  before rank 39,632. Zenbu must join the active pack and compare those ranks.

The repository provides Rust FFI layers and an iOS-capable Flutter bridge, but
its own root README marks Swift/SPM as “coming soon,” and its FFI README says
the UniFFI Swift wrapper is not yet built.
[`jmdict-fst` platform status](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/README.md),
[`jmdict-fast-ffi` status](https://github.com/theGlenn/jmdict-fst/blob/095279d426d7999c046e0483cff11605987aa49a/jmdict-fast-ffi/README.md)

**Decision: prototype, do not immediately replace production lookup.** The
prototype must build a real arm64 iOS XCFramework, load a pinned index without
network access, and run the same corpus against SQLite and `jmdict-fast`.

### SQLite FTS5 and GRDB

SQLite FTS5 is mature embedded candidate retrieval. It supports phrases,
prefixes, proximity/Boolean queries, per-column BM25 weights, custom tokenizers,
and custom auxiliary functions. It cannot infer JMdict sense semantics or an
external frequency list without application schema/policy. SQLite is in the
public domain.
[SQLite FTS5](https://www.sqlite.org/fts5.html),
[SQLite custom tokenizers and functions](https://www.sqlite.org/fts5.html#extending_fts5),
[SQLite copyright](https://www.sqlite.org/copyright.html)

GRDB is a maintained MIT Swift SQLite toolkit with FTS4/FTS5 creation, relevance
ordering, external-content synchronization and custom FTS5 tokenizers. It
reduces low-level database plumbing; its ranking remains SQLite's ranking.
[GRDB repository](https://github.com/groue/GRDB.swift),
[GRDB full-text search guide](https://github.com/groue/GRDB.swift/blob/0d8cf958b4b66a0473ec6e6986eb9da462171da9/Documentation/FullTextSearch.md),
[GRDB custom tokenizer guide](https://github.com/groue/GRDB.swift/blob/0d8cf958b4b66a0473ec6e6986eb9da462171da9/Documentation/FTS5Tokenizers.md)

**Decision: retain SQLite now.** Evaluate GRDB separately as a database-layer
maintenance improvement, not as a correctness fix.

### Tantivy and TantivySwift

Tantivy is a mature MIT Rust full-text engine with BM25 retrieval. `TantivySwift`
provides an iOS XCFramework and SwiftPM wrapper with field boosts and numeric
sorting. However, the wrapper's analyzers are default, English, raw, lowercase,
whitespace, and English-with-surface—there is no Japanese analyzer. Its numeric
`orderBy` replaces relevance order rather than composing a dictionary
relevance/frequency tuple.
[Tantivy repository](https://github.com/quickwit-oss/tantivy),
[Tantivy license](https://github.com/quickwit-oss/tantivy/blob/main/LICENSE),
[`TantivySwift` README](https://github.com/carbon/TantivySwift/blob/1cafe1437ce916ffe385a1f7ad8b8f86d2eb9177/README.md)

At the reviewed snapshot, `TantivySwift` requires Swift 6.4/Xcode 27 and iOS
18+, is a young wrapper, and its repository does not declare a license in
`Package.swift` or provide a root `LICENSE` file. Those are adoption blockers
independent of ranking quality.
[`TantivySwift` package](https://github.com/carbon/TantivySwift/blob/1cafe1437ce916ffe385a1f7ad8b8f86d2eb9177/Package.swift)

**Decision: do not adopt for this problem.** It would replace a working embedded
index while leaving Japanese analysis, sense relevance and active-pack
frequency composition to Zenbu.

### Lucene Kuromoji

Lucene's Japanese tokenizer performs Viterbi morphological segmentation and
emits base form, part of speech, reading/pronunciation, and inflection
attributes. Lucene also supplies BM25 and customizable similarity/query
composition. These are morphology and document-retrieval capabilities, not a
JMdict reverse-dictionary relevance policy.
[Lucene JapaneseTokenizer](https://lucene.apache.org/core/10_3_0/analysis/kuromoji/org/apache/lucene/analysis/ja/JapaneseTokenizer.html),
[Lucene scoring](https://lucene.apache.org/core/10_3_0/core/org/apache/lucene/search/package-summary.html),
[Lucene license](https://github.com/apache/lucene/blob/main/LICENSE.txt)

Current Lucene is a Java library requiring Java 21 or later, not a native iOS
package. [Lucene system requirements](https://lucene.apache.org/core/10_0_0/SYSTEM_REQUIREMENTS.html)

**Decision: keep Kuromoji/Sudachi for text analysis where already useful; do
not add Lucene as the iOS dictionary search engine.**

### Jamdict and smaller JMdict engines

Jamdict is an MIT Python/SQLite library. Its lookup is exact or SQL `LIKE`
matching over kanji, kana and full gloss text; it does not provide deinflection,
a relevance score, or external-frequency composition. Its latest main-branch
commit at the reviewed snapshot is from 2021.
[Jamdict README](https://github.com/neocl/jamdict/blob/85c66c19064977adda469e3d0facf5ad9c8c6866/README.md),
[Jamdict SQL lookup](https://github.com/neocl/jamdict/blob/85c66c19064977adda469e3d0facf5ad9c8c6866/jamdict/jmdict_sqlite.py#L115-L170)

`tentoku-rs` combines JMdict SQLite lookup, 10ten-derived deinflection, POS
validation, priority sorting, and a C FFI. It is GPL-3.0-or-later, version
0.1.x, and does not provide Zenbu's English sense relevance or selected
frequency-pack integration.
[`tentoku-rs` README](https://github.com/eridgd/tentoku-rs/blob/9b9c111d2d7805ebe751265c1b7eff6eae28e56c/README.md),
[`tentoku-rs` sorting](https://github.com/eridgd/tentoku-rs/blob/9b9c111d2d7805ebe751265c1b7eff6eae28e56c/src/sorting.rs)

**Decision: do not adopt Jamdict or `tentoku-rs`.**

## Safer architecture

Whether retrieval remains SQLite or moves to `jmdict-fast`, the boundary should
return evidence rather than a pre-collapsed integer group:

```text
SearchCandidate
  entryID
  matchedForm                 // written, reading, romaji
  matchedSenseID
  matchedGlossID
  lexicalRelation            // exact phrase, exact token, prefix, substring
  senseIndex
  sourceLength
  preprocessingChain
  deinflectionChain
  selectedFrequencyRank?     // loaded only after retrieval
  stableDictionaryOrder
```

The comparator should be a visible lexicographic list, modeled on Yomitan's
staging rather than a weighted score:

1. language/query lane and lexical relation;
2. matched sense/gloss quality and sense order;
3. source coverage and preprocessing/deinflection cost;
4. selected frequency rank, only when every preceding field is equal;
5. stable dictionary order and ID.

This avoids the previous failure mode: internal source priority or sense breadth
cannot accidentally split entries that the product considers equally relevant.
It also makes a result explainable in a failing test.

## Verification required before trusting either implementation

### Frozen golden corpus

Build a versioned corpus large enough that no single hand-picked example can
define the policy. It should include:

- English: whole gloss, exact token, qualified phrase, first versus later
  sense, same word in unrelated primary sense, plurals, punctuation and romaji;
- Japanese: exact written, exact reading, kana/kanji mismatch, prefix,
  substring, common homophones and form restrictions;
- deinflection: every supported conjugation class, ambiguous chains, invalid
  chains and romanized input;
- frequency: equal relevance with inverted ranks, missing rank, tied rank,
  active-pack switching and a pack update;
- the reported `prison`, `任せて`, and `makasete` cases with exact IDs and ranks.

Yomitan's valid/invalid transform fixtures and 10ten's deinflection suite are
good models for morphology coverage.
[Yomitan test guidance](https://github.com/yomidevs/yomitan/blob/67db60ddc2cbd7b5172d777c117e3201d7ddff0f/docs/development/language-features.md),
[10ten deinflection tests](https://github.com/birchill/10ten-ja-reader/blob/main/src/background/deinflect.test.ts)

### Invariants, not only snapshots

Property tests should prove:

- changing a frequency pack cannot move a result across a relevance boundary;
- within identical relevance evidence, a smaller rank always sorts first;
- absent or tied frequency preserves deterministic dictionary order;
- adding non-relevance metadata cannot change grouping;
- the displayed gloss is the gloss that caused the English match;
- cancellation, relaunch and pack replacement cannot mix evidence versions.

### Differential testing

Run the frozen corpus against:

1. the current SQLite engine;
2. the `jmdict-fast` prototype;
3. current Yomitan for Japanese lookup/deinflection where its data model
   overlaps; and
4. JPDB's public search as a periodically captured product comparison.

Differences must be reviewed; neither external product is automatically the
oracle. Promote each accepted difference into a permanent regression before
changing the comparator.

## Final recommendation

1. Do not replace the current engine with JPDB, Lucene, Tantivy, GRDB, Jamdict,
   or Yomitan on the assumption that “package” means correct end-to-end policy.
2. Open a bounded `jmdict-fast` prototype for retrieval and deinflection only.
3. Keep production SQLite until the prototype passes the frozen corpus and an
   arm64 iOS offline packaging test.
4. Replace opaque relevance-group integers with explicit match evidence and a
   short lexicographic comparator based on the Yomitan/10ten staging.
5. Require corpus, invariant, and differential tests before declaring the
   branch merge-ready again.
