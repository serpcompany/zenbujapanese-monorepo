# Example Sentence Retrieval discovery and Language Technology evaluation

Issue: #147. Corpus and provenance authority: #140. Frozen discrepancy evidence: #148. This report is research-only: it does not implement retrieval, select a corpus, write an ADR, or identify Nihongo's private implementation.

## Executive finding

The completed discovery evidence supports an app-owned retrieval seam with three established platform/library components:

1. Apple Natural Language for English word boundaries and retained surface ranges.
2. Snowball English Porter2 3.1.1 for a deterministic English stem tier broad enough to relate `education`, `educate`, `educating`, and `educated` without substring leakage.
3. Lindera 5.1.0 with an exactly pinned Japanese dictionary for Japanese surfaces, base forms, and readings, provided an implementation spike closes the remaining on-device dictionary-load, memory, license-manifest, and packaging checks.

This is a compatibility recommendation, not a claim that Nihongo uses any of these technologies. Public Nihongo materials and the inspected Settings surface did not identify its tokenizer, lemmatizer, morphological analyzer, index, or database query.

All twenty discovery contexts now have valid reference evidence. The recommendation and contract in this report are frozen for blind evaluation; they must not be tuned after a separate custodian reveals results for the ten replacement holdouts. The original ten planned holdouts were retired after candidate-only tokenization contaminated their seal and are not acceptance evidence.

## Evidence boundary

The planned matrix is [`fixtures/example-sentence-retrieval-issue-147-contexts.tsv`](fixtures/example-sentence-retrieval-issue-147-contexts.tsv). Its pre-observation SHA-256 was `fe2103c65c2283c64f8c73c654f31068c2f9fbdc1af4bf1863a7cb8e3b64b931`. The original H-prefixed rows are retained for audit history but are retired from acceptance.

The frozen public observation fixture SHA-256 is `0502089d95e6a60c4c003267d1deed3691399b67b52863415193475730edab91`; the frozen candidate-output fixture SHA-256 is `8fa3caee4d4ee00187aaee91074cb6341288d277893c266fd3584fafb566da3b`.

The public-safe observations are in [`fixtures/example-sentence-retrieval-issue-147-observations.tsv`](fixtures/example-sentence-retrieval-issue-147-observations.tsv):

- D01-D05 reuse #140's 35 traced Tatoeba pairs across five dictionary-entry contexts.
- D06-D11 reuse the merged #148 discrepancy fixture and all seven traced unique Nihongo pairs.
- D12 records `scatter` count 21 and the traced top six rows.
- D13-D19 record exact reference counts plus bounded, ordered, traced top sequences. A displayed `50+` is a cap, not an inferred exact total; these rows are explicitly non-exhaustive.
- D20 records all nine ordered `ねこ` rows and public Tatoeba pair IDs.

Across D12-D20, 80 captured ordered rows were transcribed and resolved to 80 Tatoeba pair IDs in the repo corpus. The screenshots remain private; the public fixture contains only queries, displayed counts, boundedness, and public sentence-pair identifiers.

Nihongo evidence is from the accepted iPhone reference running 1.34.3 (`9792`). The public App Store listing now describes 1.34.4 and documents multi-word search plus fixes involving conjugated and search-only Japanese forms, but it does not disclose the underlying Language Technology.[^nihongo-store]

## What the observations prove

| Hypothesis | Result | Evidence |
|---|---|---|
| Normalized literal substring | Falsified as a compatibility rule | `red you` returns zero in Nihongo but 20 unrelated Zenbu substring rows. |
| Unicode word/phrase boundary | Supported, not sufficient alone | It explains rejection of `red you`; it cannot explain `scared` matching `scare`. |
| English token/stem phrase | Strongly supported | `scared you` includes exact `scared you` first, then three `scare you` rows; `scatter` includes exact, past, and progressive forms; `education` later reaches `educate`, `educating`, and `educated`. |
| Exact surface before stem-equivalent phrase | Strongly supported | The `scared you` and `scare you` orderings change with the exact inflection, and the `education` top sequence places exact-family rows before verb forms. |
| Japanese token/base/written-form/reading | Supported for the captured contrasts | `食べる` and `食べた` both resolve to dictionary headword `食べる` but produce different surface-specific top sequences; `ねこ` resolves to dictionary headword `猫`. This does not identify the reference analyzer. |
| Dictionary-entry headword/reading relation | Supported | #140 shows plural and inflected English examples under singular/base entries; D18-D20 add Japanese base-form and reading-to-written-form behavior. |
| Japanese-indices as an eligibility filter | Falsified as a universal rule | #140 contains visible rows outside Japanese-indices while all 35 are in official general/direct-link data. |
| Sentence length then record ID | Falsified as Nihongo parity | #148 shows different sets and ordering from Zenbu's current length/ID policy. |
| Stable public source order or ID | Unresolved | Available observations do not isolate this factor from lexical tiering. |

The supported English behavior is therefore a contiguous, boundary-aware stem phrase match with a separate exact-surface ranking tier. It is not bag-of-words search and not a substring predicate. D17 `cat!` reproduces D02 `cat`'s same first seven pair IDs, while `great` and `neat` remain distinct from `eat`; punctuation is ignored at token boundaries without enabling internal substrings.

## Candidate benchmark

Raw discovery-only outputs are in [`fixtures/example-sentence-retrieval-issue-147-language-technology.tsv`](fixtures/example-sentence-retrieval-issue-147-language-technology.tsv).

### Apple Natural Language

Apple documents word tokenization, lexical tagging, and lemmatization in the on-device Natural Language framework.[^apple-nl] Its lemma scheme returns a stem form when known, including Apple's documented `reading` to `read` example.[^apple-lemma]

On this machine, English outputs match the inflectional discovery surfaces: `scared→scare`, `startled→startle`, and punctuation is excluded from `cat!`. The query `startled me` also normalizes `me→I`, while `education` remains `education`; Apple lemma output is therefore neither safe as a surface replacement nor broad enough for all observed eligibility.

On the same runtime, `NLTagger.availableTagSchemes(for: .word, language: .japanese)` exposes Language, Script, and TokenType, but not Lemma or LexicalClass. Apple Natural Language therefore passes English boundary/range analysis and fails as the sole English normalizer or Japanese analyzer. Because it is an Apple platform framework, it adds no separately bundled model in this experiment, but output remains OS-version dependent and must be regression-fixtured on the supported iOS matrix.

### Snowball English Porter2

Snowball is the reference project for generated stemming algorithms; its recommended English algorithm is Porter2 and is designed to map related forms to a common search stem.[^snowball-english] Exact release 3.1.1, commit `cd195b51e948a902a4312f023f4a14392516a543`, is BSD-3-Clause licensed.[^snowball-license]

The pinned C implementation maps the discovery families as required: `education`, `educate`, `educating`, and `educated` all become `educ`; `scared` and `scare` become `scare`; `startled` and `startle` become `startl`; `scatter`, `scattered`, and `scattering` become `scatter`; and `great`, `neat`, and `eat` remain distinct. It preserves `me` rather than Apple's lemma normalization to `I`.

An English-only build of the generated runtime compiled as a 25 KB arm64 iOS 17 static archive. A 10,000-token warm Mac CLI run rounded below 0.01 seconds. This proves deterministic compile/link feasibility, not signed-device runtime. The app should pin the generated English sources and license, expose stems only behind the provider-independent analysis seam, and fixture every supported query; it should not implement or modify stemming rules by hand.

### ICU

ICU BreakIterator provides Unicode word boundaries and automatically uses dictionaries for Japanese word breaking.[^icu-boundary] It does not provide the base-form/readings required by the Japanese contract. The iPhoneOS 26 SDK contains `libicucore.tbd` but no public `unicode/ubrk.h` headers in the SDK. Bundling ICU would duplicate boundary functionality and still require morphology; linking Apple's non-public ICU surface is not acceptable. ICU is eliminated as the app's analyzer, while its Unicode boundary semantics remain useful conceptual evidence.

### MeCab with IPADIC

MeCab 0.996 with IPADIC 2.7.0-20070801 returns the needed Japanese base form and reading (`食べた` as `食べ` + `た`, base `食べる` + `た`).[^mecab] The locally installed engine is about 3.5 MB and IPADIC about 51 MB unpacked; a warm 10,000-line CLI run took about 0.03 seconds on this Mac. It is native C++, but the upstream release line is old and an app integration would inherit a separate wrapper/build system. It remains a behavior-capable fallback, not the lead.

### Sudachi

Sudachi supplies segmentation, part of speech, normalization, dictionary forms, readings, and multiple split modes.[^sudachi] Version 0.8.0 is current in the Java repository; sudachi.rs 0.6.11 is the current Rust release. SudachiDict has small/core/full editions and Apache-2.0 licensing, while its notice chain includes UniDic and other upstream data.[^sudachi-dict]

SudachiPy 0.6.11 with SudachiDict-small 20260723 produced the richest discovery output: `食べた→食べる`, `ねこ→猫`, and readings. A warm 10,000-line CLI run took about 0.07 seconds. The small dictionary is approximately 117 MB unpacked (the release wheel is about 42 MB). No official Swift/iOS integration is documented, and the footprint is the largest candidate. It is the quality comparator, not the current mobile lead.

### Lindera

Lindera is an actively maintained Rust morphological-analysis library; its official README documents 5.x, external prebuilt dictionaries, and an MIT license.[^lindera] Exact release 5.1.0 was published 2026-08-10. The official IPADIC asset is 15,879,934 bytes compressed and 57,902,918 bytes by file sum (55,560 KiB allocated/unpacked). Its release digest and independently verified SHA-256 are both `ed10ce59ff1b1315b780a3984cfd10e31b9e658e58a1706328eb343aaa6927c6`.

Lindera 5.1.0/IPADIC matches MeCab's discovery base forms/readings. A warm 10,000-line CLI run took about 0.01 seconds on this Mac. The official macOS CLI is 4.8 MB unpacked, but that is not an iOS app delta.

## Lindera iOS feasibility spike

The research spike used exact tag `v5.1.0`, commit `1bcb0e28fcd90f34b2bcf12f55a25008d791f62c`, Rust 1.91.1, and target `aarch64-apple-ios`:

- A minimal C-ABI wrapper around `TokenizerBuilder` compiled as a release static library in 18.69 seconds wall time.
- The unstripped static archive is 26 MB and exports `issue147_lindera_token_count`.
- A C caller and a Swift caller through a bridging header both linked against iPhoneOS 26.
- The linked research executable is 7.0 MB, Mach-O arm64, platform iOS, minimum iOS 17.0, SDK 26.0.
- Dynamic dependencies are limited to Security, SystemConfiguration, libSystem, and Swift core.

This proves the compile/link seam only. It does not prove signed-device execution, runtime dictionary loading from an app bundle, peak RSS, first-query latency, concurrency safety, or final stripped IPA delta.

Apple's `nm` reports unknown LLVM-21 attributes for some Rust standard-library objects while still locating the exported symbol; clang and Swift link successfully. This tool-version diagnostic must be reproduced in the actual Xcode build before acceptance.

## License, notices, deterministic data, and SBOM

The engine is MIT at tag 5.1.0.[^lindera-license] The tag's `lindera-ipadic/NOTICE.txt` says the data derives from `mecab-ipadic-2.7.0-20070801` and requires the NAIST/ICOT no-warranty and redistribution provisions to accompany distribution.[^lindera-ipadic-notice] The binary release ZIP itself contains only dictionary data and `metadata.json`; it does not contain the required notice. Any app packaging must therefore bundle both Lindera's MIT license and the full pinned IPADIC notice in its acknowledgements/notices surface.

Do not use Lindera's `embed-ipadic` feature as an unreviewed network build step. At v5.1.0 its build script downloads a dated archive from `Lindera.dev`, checks MD5, rebuilds data, and embeds generated bytes.[^lindera-ipadic-build] That is less auditable than vendoring the exact GitHub release asset by SHA-256. The recommended deterministic path is:

1. Pin engine tag and commit.
2. Pin the official `lindera-ipadic-5.1.0.zip` URL, byte length, and SHA-256.
3. Extract its eight files in a controlled build step and verify each file hash before packaging.
4. Bundle those bytes as app resources, not as a mutable build-time download.
5. Bundle the tag's MIT license and IPADIC notice.
6. Generate a target-specific CycloneDX/SPDX SBOM from the locked Cargo graph plus a separate data component for IPADIC.

The research wrapper's generated Cargo lock contains 110 packages across all targets. That is a feasibility graph, not a production SBOM: the implementation must minimize features, lock the iOS target closure, preserve every transitive license text, and review the one `NOASSERTION` package before adoption.

## Frozen discovery-supported retrieval contract

The app-owned boundary should return provider-independent evidence, not Lindera or Tatoeba schemas:

```text
analyze(text, language) -> ordered tokens {
  surface, normalizedSurface, englishStem?, japaneseBase?, reading?, byteRange
}

match(queryAnalysis, sentenceAnalysis, entryForms?) -> {
  eligible, relation, matchedRanges, exactSurfaceCoverage, normalizedCoverage
}
```

The evidence-supported English policy is:

1. Match only a contiguous token sequence; reject substring-only fragments.
2. Preserve punctuation-insensitive word boundaries through the platform tokenizer.
3. Accept an exact normalized-surface phrase or a same-length contiguous Snowball-stem phrase.
4. Rank exact normalized-surface phrases before stem-equivalent phrases.
5. Never expose provider token tags or database columns to UI/domain callers.

The Japanese extension is an analogous contiguous comparison over surface, base form, and normalized reading, with dictionary-entry written forms/readings supplied as entry evidence. D18-D20 support these evidence fields, but do not prove which internal analyzer or tie-break Nihongo uses.

No evidence yet supports the final tie-break inside a lexical tier. Do not invent a sentence-length, record-ID, or popularity tie-break. Preserve the corpus's stable source sequence until another discovery probe proves a different observable rule, and treat any mismatch as a visible blocker.

## Remaining implementation and acceptance gates

- Have the independent custodian evaluate the already-frozen replacement holdouts without revealing them for tuning; record pass/fail separately from this discovery report.
- Run the Lindera wrapper on the USB iPhone 14 Pro Max with the exact bundled dictionary; measure cold/warm latency, RSS, archive/IPA delta, and concurrency.
- Resolve the `lindera-ipadic` notice/build-script naming mismatch (`20070801` notice versus `20250920` build input) with an upstream-primary provenance statement before adoption.
- Reproduce the Snowball and Lindera compile/link spikes in the app's actual Xcode build, produce the production target-specific SBOM and notices manifest, and then write the ADR in the later implementation phase.

[^apple-nl]: [Apple Natural Language framework documentation](https://developer.apple.com/documentation/naturallanguage)
[^apple-lemma]: [Apple `NLTagScheme.lemma` documentation](https://developer.apple.com/documentation/naturallanguage/nltagscheme/lemma)
[^snowball-english]: [Snowball English Porter2 algorithm](https://snowballstem.org/algorithms/english/stemmer.html)
[^snowball-license]: [Snowball 3.1.1 license](https://github.com/snowballstem/snowball/blob/v3.1.1/COPYING)
[^icu-boundary]: [ICU Boundary Analysis documentation](https://unicode-org.github.io/icu/userguide/boundaryanalysis/)
[^mecab]: [Official MeCab repository](https://github.com/taku910/mecab)
[^sudachi]: [Official Sudachi repository](https://github.com/WorksApplications/Sudachi)
[^sudachi-dict]: [Official SudachiDict repository](https://github.com/WorksApplications/SudachiDict)
[^lindera]: [Official Lindera repository](https://github.com/lindera/lindera/tree/v5.1.0)
[^lindera-license]: [Lindera 5.1.0 MIT license](https://github.com/lindera/lindera/blob/v5.1.0/LICENSE)
[^lindera-ipadic-notice]: [Lindera 5.1.0 IPADIC notice](https://github.com/lindera/lindera/blob/v5.1.0/lindera-ipadic/NOTICE.txt)
[^lindera-ipadic-build]: [Lindera 5.1.0 IPADIC build script](https://github.com/lindera/lindera/blob/v5.1.0/lindera-ipadic/build.rs)
[^nihongo-store]: [Nihongo official App Store listing](https://apps.apple.com/us/app/nihongo-japanese-dictionary/id881697245)
