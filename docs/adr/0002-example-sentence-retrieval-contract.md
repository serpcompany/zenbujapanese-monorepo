---
status: proposed
---

# Keep Example Sentence Retrieval app-owned and use system FTS4 Porter only for English eligibility

Zenbu will implement direct English Example Sentence Retrieval with the SQLite FTS4 module and its built-in `porter` tokenizer supplied by Apple's iOS `libsqlite3`. FTS supplies only an unordered set of English eligibility candidates. An app-owned, provider-independent policy establishes Example Sentence Matches, filters them, and applies Example Sentence Ranking. Japanese direct retrieval and dictionary-entry association remain separate routes. This follows [ADR 0001](0001-language-capability-boundaries.md), the accepted [retrieval research](../research/example-sentence-retrieval-language-technology-2026-08-14.md), and the bounded [Nihongo artifact audit](../research/nihongo-example-retrieval-artifact-audit-2026-08-14.md).

The historical evidence is deliberately narrow: a lawfully accessible Nihongo 1.33.1 artifact proves that build indexed English example targets with FTS4 Porter. It does not prove continuity in Nihongo 1.34.3 or reveal that version's final query, filter, limit, duplicate, or ranking behavior. Zenbu adopts a measured compatibility primitive, not Nihongo's private implementation.

## Boundary and versioned contract

`ExampleSentenceRetrievalPolicy/v1` accepts one of three app-owned requests:

- `directEnglish(SearchQuery)`;
- `directJapanese(SearchQuery)`; or
- `dictionaryEntry(LanguageReferenceID, selectedForm, writtenForms, reading)`.

It returns a result containing an ordered list of at most 100 app-owned `ExampleSentence` records, a count of either `exact(0...50)` or `moreThan50`, whether the ordered result was truncated, and Match/Ranking evidence. The boundary may expose an app-owned sentence ID, route, lexical relation, matched range, exact-surface flag, and deterministic rank inputs. It must not expose a provider table, row ID, source order, FTS score/order, Tatoeba coordinate, or SQL representation. Source identity and record IDs remain retained provenance on the corpus record, not retrieval keys.

The Example Sentence Retrieval policy owns dispatch and validation for these route kinds. Its caller, including the app shell, supplies a typed request and does not select a retrieval implementation by inspecting query text. The policy returns typed `invalidQuery` for an empty direct query, non-ASCII text in `directEnglish`, or missing entry evidence; these are request failures, not empty result sets.

A Match is unique by app-owned example-pair ID. Distinct Japanese-English pairs remain distinct even when they share the same Japanese text, English text, or source translation record. The policy removes only repeated delivery of the same app-owned pair ID; it performs no English-ID, text, punctuation, or fuzzy near-duplicate collapse.

## Direct English eligibility and query safety

The English adapter indexes exactly one English document for every app-owned Example Sentence Corpus pair in an FTS4 virtual table declared with the built-in `porter` tokenizer. Any integer key needed by FTS is an adapter-private mapping to the app-owned pair ID. The index is generated from the app-owned corpus, not queried through a provider schema.

For a valid `directEnglish` request, the policy uses the existing `SearchQuery` normalization: Unicode compatibility precomposition, lowercase, and collapsed whitespace. It returns `invalidQuery` if the normalized value is empty, contains non-ASCII text, contains an ASCII double quote (`"`), or causes FTS4 Porter to emit no term. Version 1 deliberately does not rewrite an embedded quote: doubling it inside a bound FTS4 phrase changes MATCH parsing and silently returns the wrong set, while deriving terms in app code would duplicate tokenizer behavior.

For every other ASCII query, punctuation remains in the normalized value and SQLite Porter interprets it according to its documented token-boundary rules. The adapter places the unchanged value between one leading and one trailing ASCII double quote, binds that complete MATCH expression as a parameter, and uses only static SQL identifiers. Quoting makes adjacency and order part of eligibility and prevents ordinary user text from becoming FTS operators. SQLite Porter—not Zenbu code—owns English token boundaries and stemming. The reproducible [FTS4 query-contract probe](../research/tools/issue150_validate_fts4_query_contract.rb) verifies ordinary punctuation and apostrophes, Porter expansion, bound phrase behavior, typed quote rejection, and the failed legacy quote-doubling behavior.

Every eligible candidate is materialized before Ranking; no default FTS row order or pre-ranking `LIMIT` may select product-visible results. Version 1 has no smaller raw-candidate cap than the finite bundled corpus. It then applies these filters in order:

1. require a live, well-formed app-owned corpus record for the mapped pair ID;
2. reject a phrase occurrence whose adjacent matched terms cross terminal sentence punctuation (`.`, `?`, or `!` followed by whitespace); and
3. require at least one exact-surface candidate in the complete candidate family; otherwise reject the family rather than showing only a Porter expansion.

Exact-surface evidence compares the original query and candidate English text using the FTS4 `simple` token-boundary rules documented by SQLite: contiguous alphanumeric or non-ASCII runs, ASCII case folded, with other characters acting as separators. It requires the query terms to occur adjacently and in order without Porter reduction. This evidence is computed independently from Porter eligibility and remains visible to Ranking. It explains the accepted `scared you` versus `startled you` discovery behavior without treating a stem-equivalent hit as exact.

The live-record check is a structural invariant. The terminal-punctuation and exact-surface-anchor filters are proposed Zenbu v1 approximations motivated by D06-D08: raw Porter crosses a sentence boundary in one extra D06 candidate and produces the unsupported D07 family. Neither filter is claimed as recovered Nihongo logic.

## App-owned Ranking

The complete filtered set is sorted by the following tuple; lower values sort first:

1. lexical relation: exact-surface phrase, then Porter-equivalent phrase;
2. start position of the matched English term sequence;
3. number of English terms in the sentence;
4. number of extended grapheme clusters in the Japanese sentence; and
5. app-owned example-pair ID as the total-order tie-break.

Only after that sort does the adapter return the first 100. The count is computed from the complete filtered set: 0 through 50 are exact, while 51 or more is `moreThan50`. The rank tuple and policy version are test evidence, not learner-facing scores. FTS `rowid`, `matchinfo`, source order, corpus insertion order, and provider IDs are forbidden Ranking inputs.

Discovery supports only the first lexical tier: D06 and D08 move the exact surface ahead of its Porter-relative form. The remaining position, term-count, length, and stable-ID tie-breaks are deliberately simple Zenbu v1 approximations selected to make ordering total, inspectable, and provider-independent; the accepted evidence does not attribute them to Nihongo.

This is a frozen Zenbu v1 proposal to test, not a claim that Nihongo uses these filters or tie-breaks. Discovery already shows that raw FTS order is wrong and that some final reference filtering remains unknown. Any policy change prompted by implementation evidence or the sealed holdout requires a new policy version and an ADR update; it must not be tuned invisibly to holdout rows.

On the accepted discrepancy probes, this policy admits all four observed `scared you` and `scare you` rows, rejects `red you`, and turns the unsupported Porter-only `startled you` family into zero results. It intentionally retains one additional valid corpus pair in each scared/scare family because no accepted evidence justifies source-specific or fuzzy duplicate removal. That bounded difference is an explicit evaluation target, not a hidden claim of parity.

## Separate Japanese and dictionary-entry routes

Direct Japanese retrieval does not use the English FTS table. Version 1 preserves normalized literal Japanese surface containment as eligibility and records the exact matched Japanese range. It ranks an entire-sentence match before a contained match, then the earlier match position, shorter Japanese grapheme count, and app-owned pair ID. No historical `character`-tokenizer fingerprint is promoted into a current Japanese contract.

Dictionary-entry association also bypasses English FTS. It may Match only through app-owned `LanguageReferenceID` and entry-form evidence created during corpus normalization. A form-derived association is retained only when the selected written form plus reading identifies one Language Reference Data entry; ambiguous homographs produce no association. Selected written-form evidence ranks before alternate written-form evidence, which ranks before reading evidence; ties use earlier Japanese match position, shorter Japanese grapheme count, then app-owned pair ID. Provider coordinates cannot join an entry to a sentence. No direct-search candidate is silently substituted when entry association is absent.

These Japanese and entry-route tie-breaks are also explicit Zenbu v1 approximations. The research proves that direct search and entry association are distinct and that the historical character index does not establish a current Japanese contract; it does not recover Nihongo's Japanese or entry Ranking.

## Index lifecycle and failure behavior

The deterministic language-data importer builds the FTS4 index into the bundled SQLite artifact and records the corpus checksum, importer checksum, index row count, schema version, and retrieval-policy version. Generation must fail unless the FTS-to-corpus mapping is one-to-one and complete. Release validation opens the final artifact with the same system SQLite linkage used by the app, checks required metadata, exercises a Porter phrase, verifies `PRAGMA integrity_check`, and replays the committed #147 fixtures.

The shipped database is read-only. A corpus snapshot, schema, normalization rule, or retrieval-policy change rebuilds the complete artifact offline and replaces it atomically in a later app build; there is no migration of the derived index and no first-launch index construction. User-owned data never depends on FTS row IDs.

A missing database, integrity failure, metadata mismatch, unavailable FTS4/Porter module, or query error returns an explicit retrieval-unavailable failure. Direct English retrieval must not silently fall back to literal substring, FTS5, or a different tokenizer because that would change Match semantics. If the base corpus remains valid, a failure isolated to the English index need not disable the separately implemented Japanese and dictionary-entry routes.

## Platform, licensing, notices, and SBOM

The implementation target is the package's current iOS 26 minimum, compiled against the iOS 26 SDK, importing `SQLite3`, and linking `.linkedLibrary("sqlite3")`. The selected component is exactly Apple's platform-supplied SQLite FTS4 module with the built-in `porter` tokenizer; Zenbu will not bundle SQLite, a Porter implementation, an NLP package, or a dictionary for this slice. The accepted signed-device evidence verifies this capability on iOS 26.6. Because Apple owns the system SQLite update cadence, a SQLite semantic version is not an app-pinnable dependency. Runtime/build evidence must record `sqlite3_libversion()` plus the OS build, and every newly supported iOS baseline must pass the capability test before release.

SQLite's deliverable code is [public domain](https://www.sqlite.org/copyright.html), so this platform linkage adds no required bundled license text or in-app acknowledgement. The existing Tatoeba corpus attribution and CC BY 2.0 FR treatment remain unchanged. Release SBOM generation must record `SQLite / Apple iOS system libsqlite3` as a platform-provided runtime dependency, relationship `DEPENDS_ON`, version `NOASSERTION` with the validated OS build and observed runtime version as evidence, and concluded license `LicenseRef-Public-Domain`. It must not record Lindera, Snowball, MeCab, Sudachi, ICU, Apple Natural Language, or a bundled SQLite component for this decision.

## Rejected alternatives

- **FTS5:** not a drop-in substitute for the proven FTS4 fingerprint; changing modules requires a new benchmark and decision.
- **Lindera, MeCab, or Sudachi:** the accepted evidence establishes no Japanese morphology requirement for this slice, so their runtime/dictionary footprint and redistribution work are unjustified.
- **Standalone Snowball:** it duplicates the platform Porter's job without evidence that a separately versioned stemmer improves the contract.
- **Apple Natural Language:** its evaluated lemma behavior did not close the observed English family and it is not needed for FTS eligibility.
- **ICU:** it supplies boundaries, not the selected English stemming behavior, and no direct iOS ICU dependency is required.
- **Literal substring fallback:** it recreates the proven `red you` leakage and misses Porter-related candidates such as `scared you`.
