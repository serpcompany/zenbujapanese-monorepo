# Example Sentence Retrieval discovery and Language Technology evaluation

Issue: #147. Corpus and provenance authority: #140. Behavioral discrepancy evidence: #148. Shipped-artifact fingerprint: #149. This report is research-only: it does not implement retrieval, select a final product architecture, write an ADR, or authorize a release.

## Executive finding

SQLite FTS4 with its built-in `porter` tokenizer is now the strongest English eligibility candidate. This is not an inference from similar output: the independently reviewed #149 audit found an FTS4 Porter example-target index in a lawfully accessible shipped Nihongo 1.33.1 artifact. SQLite's primary documentation says this tokenizer uses the Porter stemming algorithm.[^sqlite-fts]

The discovery-only end-to-end benchmark strengthens that candidate without overstating it. Across the 130 accepted visible rows in D06-D17, a quoted FTS4 Porter phrase retrieved all 130. Zenbu's current literal-substring baseline retrieved 106. FTS4 also rejected `red you` and admitted all observed `scared you`/`scare you` rows. However, FTS4 returned one row for the empty `startled you` control, exposed substantially larger candidate sets for common words, and its default row order disagreed with the reference. Eligibility, post-filters, limits, duplicate handling, and ranking therefore remain app-owned work.

The artifact is Nihongo 1.33.1 while the accepted behavioral reference is 1.34.3. The fingerprint does not prove version continuity or reveal final SQL/ranking. It also identifies a historical character tokenizer for parsed Japanese example text, but the available evidence does not establish a current Japanese morphology contract. Lindera remains a mature, license-audited comparator, but is not selected or recommended: the discovery evidence does not justify adding its dictionary footprint to solve an unproven requirement.

The original H-prefixed holdout set was contaminated and permanently retired. A separate custodian owns ten sealed replacements. No replacement query or result was inspected while producing this report.

## Evidence boundary and typed fixtures

The frozen plan is [`fixtures/example-sentence-retrieval-issue-147-contexts.tsv`](fixtures/example-sentence-retrieval-issue-147-contexts.tsv). Public-safe observations are split into typed tables:

- [`fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv`](fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv) records environment, timestamps, private evidence pointers/hashes, count value, count kind, captured-row count, exhaustiveness, and terminal proof.
- [`fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv`](fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv) records every transcribed visible rank with Japanese/English text, public pair IDs, Zenbu pre-change presence/rank, lexical relation, general/Japanese-index membership, and duplicate/one-to-many grouping.
- [`fixtures/example-sentence-retrieval-issue-147-retrieval-benchmark.tsv`](fixtures/example-sentence-retrieval-issue-147-retrieval-benchmark.tsv) records candidate set size, visible-set overlap/recall, shared-pair order agreement, missing IDs, and candidate prefixes.
- [`fixtures/example-sentence-retrieval-issue-147-runtime-probe.tsv`](fixtures/example-sentence-retrieval-issue-147-runtime-probe.tsv) records the signed USB iPhone 14 baseline and three separate system-SQLite FTS4 runs without exposing the device identifier.

There are 279 accepted ranked rows across D01-D20. The corrected manual-evidence rule is applied uniformly: lists displaying at most 20 rows are transcribed completely; larger numeric or `50+` lists record the displayed count/cap and exact ordered top 20. D15 and D20 are exhaustive at 19 and 9 rows; D06-D11 are exhaustive at their displayed counts; D01-D05, D12-D14, and D16-D19 are explicitly non-exhaustive ordered top-20 observations. Retained deeper captures are supporting private evidence only, not additional accepted fixture ranks. Deterministic corpus tooling, rather than unbounded manual scrolling, owns exhaustive candidate comparison.

Private screenshots remain outside git. Each public row points to one private capture and SHA-256. The OCR matcher is candidate-restricted, deterministic, and public-safe. It requires whole normalized English OCR segments rather than accepting candidate substrings anywhere in a frame. Seventeen clipped, header-derived, neighboring-row, or false duplicate-link candidates are recorded as removals in [`fixtures/example-sentence-retrieval-issue-147-ocr-corrections.tsv`](fixtures/example-sentence-retrieval-issue-147-ocr-corrections.tsv). Every selected duplicate-English group was visually audited; links are retained only when their corresponding Japanese rows are separately visible. The lowest remaining segment score, D19 `I ate caviar.`, was visually rechecked in its cited frame.

Nihongo evidence is from the accepted iPhone reference running 1.34.3 (`9792`). #149 separately fingerprints 1.33.1 (`9587`); claims below keep those versions distinct.

## Actual dictionary-entry route probes

Direct Japanese search cannot establish dictionary-entry behavior, so two separate entry routes were captured:

- D21: search `食べた`, open Best Match `食べる` (`たべる`), then traverse the entry's inline `EXAMPLES` section. The route starts after meaning, kanji, related-word, and notes sections; it is not the direct-search `View 50+ Example Sentences` list. Preserved top rows include `食べた。` / “I ate.” and additional conjugated `食べる` examples.
- D22: search `ねこ`, open Best Match `猫` (`ねこ`), then traverse the entry's inline `EXAMPLES` section. Preserved top rows include `猫だ！` / “It's a cat.” and other entry-associated `猫` examples.

These probes prove route separation and entry-associated example behavior. They do not prove that direct-search eligibility, entry association, or final ranking share one implementation. The large D21 and D22 inline lists expose no numeric count. Under the corrected manual-evidence rule, each remains a non-exhaustive ordered top-20 structural probe and is not included in the D01-D20 typed-row count.

The typed top-20 evidence is in [`fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv`](fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv). Thirty-nine of forty rows resolve to the pinned corpus. D22 rank 1 (`猫だ！` / “It's a cat.”) is explicitly marked absent from that snapshot rather than being assigned a guessed public ID.

## Hypothesis map

| Hypothesis | Explaining probes | Falsifying or limiting probes | Status |
|---|---|---|---|
| Normalized literal substring is sufficient | Zenbu baseline and many exact rows | D09 `red you` is 0 in Nihongo/20 in Zenbu; D06 misses three; D17 `cat!` displays `50+` while literal punctuation search finds none of the accepted top 20 | Falsified |
| Quoted FTS4 Porter phrase is an English eligibility primitive | D06/D08 admit all scared/scare rows; D09 rejects internal substring; D12-D17 retrieve every visible row | D07 `startled you` is 0 in UI but 1 in FTS; candidate sets exceed exposed lists; default order differs | Strong candidate, incomplete contract |
| Exact surface is ranked before Porter-equivalent surface | D06 ranks `scared you` first; D08 moves exact `scare you` rows ahead of the scared row | FTS default order does not reproduce either list; no general tie-break is isolated | Supported lexical tier only |
| Japanese direct search is only literal surface matching | D18/D19 preserve different inflected top sequences | D20 `ねこ` resolves to written entry `猫`; D21/D22 entry routes add written-form/entry association; historical character index alone cannot explain all entry resolution | Falsified as complete rule |
| Japanese-indices is a universal eligibility filter | Rows inside Japanese indices remain eligible | #140 visible rows outside Japanese indices are still present in general/direct-link data | Falsified |
| English-ID deduplication removes one-to-many links | A deduplicated product could show one translation | D03 visibly includes Japanese IDs `77970` and `77975` linked to English ID `62636`; D05 includes `81557` and `4971` linked to English ID `1564` | Falsified |
| Source row order, sentence length, or ID is the final tie-break | Some Zenbu baseline lists have high pairwise agreement | D06/D08 reorder the same shared family; FTS row order agreements range from 0.000 to 0.674 in discriminating contexts | Unresolved; do not freeze |

Duplicate groups and full corpus group sizes are explicit in the row fixture. This separates “the reference displayed two linked Japanese rows” from the broader corpus fact that more links may exist.

## End-to-end candidate benchmark

The benchmark builds a temporary FTS4 table over the pinned Zenbu Example Sentence Corpus and executes the full quoted phrase through SQLite. It does not hand-tokenize, stem, lemmatize, or implement a search engine.

| Context | Visible rows | FTS4 Porter recall | Literal-substring recall | Key result |
|---|---:|---:|---:|---|
| D06 `scared you` | 4 | 4/4 | 1/4 | Porter closes the reported eligibility gap |
| D07 `startled you` | 0 | one extra candidate | 0 | proves FTS alone is over-inclusive |
| D08 `scare you` | 4 | 4/4 | 3/4 | Porter set matches visible family; order does not |
| D09 `red you` | 0 | 0 | 20 extra candidates | phrase boundaries remove substring leakage |
| D10-D11 controls | 3 | 3/3 | 3/3 | both candidates retain existing controls |
| D12 `scatter` | top 20 of 21 | 20/20 | 20/20 | accepted set parity; FTS row order agreement 0.495 |
| D13 `education` | top 20 of 50+ | 20/20 | 20/20 | both broad sets require a separate limiter/ranker |
| D14 `great` | top 20 of 50+ | 20/20 | 20/20 | both broad sets require a separate limiter/ranker |
| D15 `neat` | 19 | 19/19 | 19/19 | FTS candidate set is exactly 19, but order agreement is 0.269 |
| D16 `quickly` | top 20 of 50+ | 20/20 | 20/20 | both candidates contain the accepted prefix; neither order matches reference |
| D17 `cat!` | top 20 of 50+ | 20/20 | 0/20 | FTS punctuation handling matches exposed eligibility |

D01-D05 direct-search top-20 observations are also in the raw benchmark: both mechanisms contain all 100 accepted pairs, but neither default order reproduces the reference.

The raw benchmark deliberately labels FTS `rowid` order as a diagnostic. No report statement treats it as a recommended ranking. The candidate prefix is retained so future work can measure a proposed app-owned filter/ranker without rewriting this discovery record.

## Technology evaluation

### SQLite FTS4 Porter

#149 is the primary fingerprint authority. The 1.33.1 store has one English/example target FTS row per target row, uses built-in FTS4 `porter`, and has no persisted final ranking score. Read-only probes show equal `scared you`/`scare you` sets and reject `red you`; the current corpus benchmark reproduces those useful properties. SQLite is already an iOS platform dependency and the candidate adds an index, not a separately bundled NLP runtime.[^sqlite-fts]

Open risks are version continuity, exact query escaping/joining, filters, cap, duplicate policy, index migration/size, and app-owned ranking. FTS5 is not a drop-in claim: the fingerprint is FTS4 and behavioral equivalence must be measured before substituting another module.

The temp-only signed Release probe passed on the designated USB iPhone 14 Pro Max and was uninstalled afterward. Building a complete Porter index over the 287,490,048-byte pinned corpus database took 2,708.45–3,237.49 ms across three fresh runs and produced a 322,945,024-byte database, a 35,454,976-byte runtime index delta. A six-query batch measured 3.681–3.705 ms warm p50 and 3.760–3.777 ms warm p95. RSS was 105.05–105.35 MB versus a 65.09 MB otherwise-identical baseline. Eight concurrent read-only workers produced the same deterministic result SHA-256 in all three runs. Because SQLite is supplied by the platform, the signed executable delta was 40,688 bytes and the bundle file-sum delta was 40,682 bytes; those deltas exclude the separately measured runtime index. This establishes physical-device feasibility, not an accepted startup/index-migration strategy.

### Apple Natural Language and standalone Snowball

Apple Natural Language remains useful for platform word ranges, but its lemma output does not cover the `education` family and its Japanese schemes on the tested runtime do not expose the required lemma/readings contract.[^apple-nl] Standalone Snowball Porter2 remains a deterministic comparator and compiled into a 25 KB arm64 iOS archive, but #149 found no Snowball package fingerprint. Neither remains the lead English retrieval candidate.

### Lindera (evaluated, not selected)

Lindera 5.1.0 is an actively maintained Rust analyzer under MIT and produced Japanese base forms/readings needed for later experiments.[^lindera] The pinned IPADIC asset is 15,879,934 bytes compressed and 57,902,918 bytes by file sum; the release SHA-256 is `ed10ce59ff1b1315b780a3984cfd10e31b9e658e58a1706328eb343aaa6927c6`. Its notice attributes `mecab-ipadic-2.7.0-20070801` and requires the NAIST/ICOT terms to accompany redistribution.[^lindera-notice]

A research C-ABI wrapper at tag `v5.1.0`, commit `1bcb0e28fcd90f34b2bcf12f55a25008d791f62c`, compiled for `aarch64-apple-ios`. The unstripped static archive was 26 MB and the linked research executable 7.0 MB. This proves compile/link feasibility only. The accepted discovery probes do not establish a Japanese morphology requirement that warrants the 57,902,918-byte extracted dictionary, so Lindera is not a recommended component and no signed-device claim is made for it.

### MeCab, Sudachi, and ICU

MeCab/IPADIC and Sudachi remain behavior-capable comparators. MeCab's upstream release line and wrapper burden are less attractive; SudachiDict-small was about 117 MB unpacked and lacks an official Swift/iOS path.[^mecab][^sudachi] ICU provides Unicode boundaries but not the required base forms/readings, and the iOS SDK does not expose public ICU headers for direct app integration.[^icu]

## Candidate contract for the later implementation phase

The discovery evidence supports a provider-independent seam, not a final ranking algorithm:

```text
retrieveCandidates(query, language, entryEvidence?) -> ordered/unordered candidates {
  pairID, lexicalRelation, matchedRanges, sourceSequence, duplicateGroup
}

rank(candidates, observedPolicyVersion) -> ranked candidates + rankEvidence
```

For English direct search, the next implementation experiment should use a quoted SQLite FTS4 Porter phrase for candidate eligibility, preserve exact-surface evidence as a separate rank feature, and apply an explicit app-owned filter/limit. It must not rely on default FTS row order. Japanese direct search and dictionary-entry association remain separate routes until further evidence proves a shared contract.

No final tie-break is frozen. Sentence length, row ID, source sequence, BM25/matchinfo, or popularity must each be proposed and tested explicitly against discovery plus the sealed replacement holdout; none may be inferred into the ADR from this report.

## Reproduction

The correction run used Tesseract 5.5.1, Ruby 2.6.10, and sqlite3 3.51.0. The official Tatoeba `jpn_indices.csv` archive SHA-256 was `375e13617e970ff54b1f1417b48493887ecbef48e6779cbdb8f774224baae84f`.

```sh
tesseract PRIVATE_CAPTURE.jpeg OCR_PREFIX -l jpn+eng --psm 6
ruby docs/research/tools/issue147_match_capture_ocr.rb OCR_DIR CORPUS_DB RAW_MATCHES_TSV CONSOLIDATED_TSV docs/research/fixtures/example-sentence-retrieval-issue-147-ocr-corrections.tsv
ruby docs/research/tools/issue147_build_typed_fixtures.rb ISSUE140_TSV CONSOLIDATED_TSV CORPUS_DB JPN_INDICES_CSV ISSUE147_EVIDENCE_DIR ISSUE148_EVIDENCE_DIR CONTEXTS_TSV ROWS_TSV
ruby docs/research/tools/issue147_build_entry_route_fixture.rb CORPUS_DB ISSUE147_EVIDENCE_DIR ENTRY_ROUTES_TSV
ruby docs/research/tools/issue147_fts4_retrieval_benchmark.rb CONTEXTS_TSV ROWS_TSV CORPUS_DB BENCHMARK_TSV
ruby docs/research/tools/issue147_validate_fixtures.rb CONTEXTS_TSV ROWS_TSV ENTRY_ROUTES_TSV BENCHMARK_TSV RUNTIME_TSV CORPUS_DB ISSUE147_EVIDENCE_DIR ISSUE148_EVIDENCE_DIR JPN_INDICES_CSV
```

The validator reads private evidence only to recompute the public SHA pointers. It emits no screenshot bytes, device identifiers, or private paths into the committed fixtures.

## Remaining gates

- Freeze any proposed filter/ranker before the separate custodian evaluates the ten sealed replacement holdouts. Do not tune after reveal.
- Produce implementation-target notices/SBOM and an ADR only after candidate/runtime acceptance. No production behavior is changed by this research branch.

[^sqlite-fts]: [SQLite FTS3 and FTS4 extension documentation](https://www.sqlite.org/fts3.html)
[^apple-nl]: [Apple Natural Language framework documentation](https://developer.apple.com/documentation/naturallanguage)
[^lindera]: [Lindera v5.1.0 repository](https://github.com/lindera/lindera/tree/v5.1.0)
[^lindera-notice]: [Lindera v5.1.0 IPADIC notice](https://github.com/lindera/lindera/blob/v5.1.0/lindera-ipadic/NOTICE.txt)
[^mecab]: [Official MeCab repository](https://github.com/taku910/mecab)
[^sudachi]: [Official Sudachi repository](https://github.com/WorksApplications/Sudachi)
[^icu]: [ICU Boundary Analysis documentation](https://unicode-org.github.io/icu/userguide/boundaryanalysis/)
