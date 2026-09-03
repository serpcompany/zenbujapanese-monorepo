# Kuromoji versus Sudachi benchmark for issue #251

Research for [#251](https://github.com/serpcompany/zenbujapanese-monorepo/issues/251)
on `refactor/native-swiftui-components`, beginning at
`19eba4847266ee631e2601cc77909d2b765bfa30`. Consulted and executed
2026-09-03. This ticket changes no production Swift, package dependency,
dictionary pack, Image Text behavior, Dictionary Ranking, or learner UI.

## Decision

**Advance Sudachi.rs 0.6.11 with SudachiDict Core 20260723 to the owner gate.**
Do not adopt a Kuromoji configuration, Apple Natural Language, or the current
Zenbu analyzer as the production Japanese Text Analysis provider from the
available evidence.

Sudachi won for two independent reasons:

1. It was materially more accurate than the clean, maintained
   `@faanau/kuromoji` candidate on a 512-sentence / 12,237-token confirmation
   holdout selected from previously unscored GSD train rows after the complete
   protocol and exact truth were committed. Every paired sentence-bootstrap
   95% interval favored Sudachi mode A for boundaries, exact spans, lemmas,
   readings, and coarse POS.
2. Its iPhone integration is a direct typed Swift/UniFFI boundary over an
   established current engine. The JavaScriptCore Kuromoji path needs a native
   resource loader, decompression, JS lifecycle, range conversion, and JSON
   bridge and used about 149 MB more steady Simulator RSS. A newly discovered
   pure-Swift Kuromoji port is smaller and technically promising, but it has
   only two same-day commits, no tag or release, no adoption history, and an
   unpinned dictionary download. It is not yet a dependable production
   dependency.

The production prototype should retain Sudachi's own hierarchy: a mode C
learner candidate such as `日本語` with its mode A child spans. Do not recreate a
merge heuristic in Zenbu. The population benchmark reports A/B/C separately;
mode A best matches the corpus's short-unit-word truth, while B/C preserve the
whole `日本語` app-owned candidate in the hard-case suite.

This is a recommendation, not production authorization. The owner must still
approve the approximately 72.3 MB download / 217.5 MB installed Core pack and
the new community Swift binding before an implementation ticket is created.

## System frame

The selected component is replaceable **Language Technology** behind app-owned
**Japanese Text Analysis**. It emits source ranges, surface, lemma, reading,
POS, OOV, and provider-version evidence. It does not own
`LanguageReferenceID`, Dictionary Ranking, Image Text geometry, recognition,
overlay selection, navigation, or Encounter Media. This follows
[ADR 0001](../adr/0001-language-capability-boundaries.md).

Migaku is not a candidate. The captured historical Migaku 1.30.8 runtime proves
a Kuromoji-named foundation plus separate proprietary parsing and deconjugation;
it does not license its assets or establish that stock Kuromoji reproduces the
product. See the reviewed [cross-repository recovery](issue-250-prior-zenbu-research-recovery-2026-09-03.md).

## Preregistered evaluation

The initial public seams, source/split selection, scoring intent, hard gates,
tie-breakers, bootstrap seed, and resource protocol were published in
[#251 comment 5519522906](https://github.com/serpcompany/zenbujapanese-monorepo/issues/251#issuecomment-5519522906)
before broad provider output was generated. The first adversarial review
correctly found that this was not a complete auditable preregistration: the
actual hard-case truth and scorer first appeared in the same commit as the
first results. Those original GSD dev/test and PUD numbers are therefore
**exploratory corroboration only**, not decision evidence.

The repaired scorer, exact provider versions/checksums, complete truth,
adjudication/uncertainty, alternate boundaries, and deterministic selection
algorithm were committed at
`6e51f8008f2a7cefe50f81314f95c28c7dc91ba5`. Only then did the four frozen
providers run once over the 512-record confirmation set, selected as the lowest
SHA-256 domain-separated IDs from the never-scored 7,050-record GSD train
split. The committed selected-ID digest is
`54ec9f1368d9d20b140dd7e13574a25448c1dc6a0eca7bea2d918839d0326964`.

The primary independent gold is
[UD Japanese GSD 2.18](https://github.com/UniversalDependencies/UD_Japanese-GSD/tree/r2.18)
at `33e7310b58308e85fd2b33a2fc3ef3e434f821c7`. Its specification identifies
manual SUW/LUW/bunsetsu tokenization and native XPOS; lemmas and UPOS are
converted from manual annotation. It has 8,100 sentences / 193,654 tokens and
is CC BY-SA 4.0. The immutable source manifest pins all split hashes. The
complete train split remained development-only, dev was the repeatable
evaluation split, and test was executed once after policies were frozen.

[UD Japanese PUD 2.18](https://github.com/UniversalDependencies/UD_Japanese-PUD/tree/r2.18)
at `4abd575c57bfa125dd4bc564f2ceb8973bbbf422` supplies a CC BY-SA 3.0 external
domain check. Ten separately authored Zenbu cases (69 tokens) cover disclosed
regressions, inflection, auxiliaries, particles, compounds, counters,
Latin/numbers, OOV, OCR noise, exact candidates, and mandatory abstentions.
They are transparent product-risk tests, not a statistically representative
Japanese corpus. Before production, a fluent Japanese reviewer should approve
their annotation; no candidate output was used as truth.

The corpus retains both UniDic lexeme reading and surface-pronunciation
literals. A provider reading agrees with either independently retained literal,
preventing orthographic `オウ` and phonetic `オー` notation from becoming a
false analyzer error. Lemma, reading, and POS failures include boundary misses;
exact-span coverage is also reported. This policy was fixed before holdout.

## Quality results

The complete machine-readable summary, source hashes, output hashes, and
operational evidence are in
[issue251-morphology-results-v1.json](fixtures/issue251-morphology-results-v1.json).

### Decisive confirmation holdout — 512 sentences / 12,237 tokens

| Candidate                              | Boundary F1 | Exact-span F1 |       Lemma |     Reading |         POS | All-correct sentences |
| -------------------------------------- | ----------: | ------------: | ----------: | ----------: | ----------: | --------------------: |
| Sudachi Core A                         | **.990240** |   **.976436** | **.851026** | **.949699** | **.899077** |            **29/512** |
| Sudachi Core B                         |     .978930 |       .944359 |     .807224 |     .899032 |     .855765 |                23/512 |
| Sudachi Core C                         |     .975597 |       .937474 |     .797336 |     .888077 |     .845796 |                23/512 |
| `@faanau/kuromoji` 0.2.1 + IPADIC 2007 |     .967051 |       .920382 |     .739397 |     .835585 |     .775108 |                 9/512 |

Paired 10,000-replicate sentence bootstrap, Sudachi A minus Kuromoji:

| Metric           | Observed difference |         95% interval |
| ---------------- | ------------------: | -------------------: |
| Boundary F1      |            +.024245 | +.020665 to +.028109 |
| Exact-span F1    |            +.057076 | +.049196 to +.065326 |
| Lemma accuracy   |            +.110525 | +.101410 to +.119912 |
| Reading accuracy |            +.113047 | +.102712 to +.123901 |
| POS accuracy     |            +.122299 | +.112137 to +.132765 |

The complete truth and all four raw normalized JSONL outputs are committed, not
represented only by summary hashes. Public validation requires the exact
provider contract and can also require the committed normalized-output hash.
Their [derived-data attribution and CC BY-SA terms](fixtures/issue251-DERIVED-DATA-ATTRIBUTION.md)
are retained beside them.

The confirmation set is entirely OCR-perfect UD news/blog text. Deterministic
script strata preserve the same winner:

| Stratum               | Records | Sudachi A boundary / lemma / reading / POS | Kuromoji boundary / lemma / reading / POS |
| --------------------- | ------: | -----------------------------------------: | ----------------------------------------: |
| Mixed Latin or number |     163 |      .985825 / .865507 / .918753 / .891481 |     .970180 / .722650 / .784732 / .793088 |
| Kanji and kana        |     345 |      .992841 / .843073 / .967907 / .903339 |     .965056 / .749804 / .865354 / .764545 |
| Kana or symbol only   |       4 |              1.0 / .678571 / 1.0 / .964286 |         1.0 / .607143 / .960000 / .750000 |

The separate product-risk set supplies the OCR-clean/noisy comparison. On its
three clean records, Sudachi A/B and Kuromoji boundary F1 were .971429 / 1.0 /
1.0. On the deliberately noisy record they were .947368 / .947368 / .888889.
The one-row noisy stratum is a regression probe, not a confidence estimate.
The exact script classifier and aggregation are retained in
[`issue251_stratified_report.py`](tools/issue251_stratified_report.py), with its
[normalized result](fixtures/issue251-confirmation-strata.json).

### Exploratory GSD test — 543 sentences / 13,034 tokens

| Candidate                              | Boundary F1 | Exact-span F1 |       Lemma |     Reading |         POS | All-correct sentences |
| -------------------------------------- | ----------: | ------------: | ----------: | ----------: | ----------: | --------------------: |
| Sudachi Core A                         | **.992439** |   **.980485** | **.838269** | **.959393** | **.900951** |            **28/543** |
| Sudachi Core B                         |     .982754 |       .953321 |     .799294 |     .914675 |     .864355 |                22/543 |
| Sudachi Core C                         |     .979809 |       .946437 |     .789781 |     .904052 |     .854995 |                21/543 |
| `@faanau/kuromoji` 0.2.1 + IPADIC 2007 |     .968868 |       .922405 |     .734157 |     .858048 |     .769909 |                14/543 |

Paired 10,000-replicate sentence bootstrap, Sudachi A minus Kuromoji:

| Metric           | Observed difference |         95% interval |
| ---------------- | ------------------: | -------------------: |
| Boundary F1      |            +.023510 | +.020414 to +.026686 |
| Exact-span F1    |            +.057619 | +.050457 to +.064967 |
| Lemma accuracy   |            +.104305 | +.096064 to +.112628 |
| Reading accuracy |            +.098791 | +.089102 to +.108536 |
| POS accuracy     |            +.136975 | +.126470 to +.147579 |

All intervals exclude zero and independently agree with the decisive
confirmation. These numbers are not called preregistered.

### External PUD check — 1,000 sentences / 28,788 tokens

| Candidate          | Boundary F1 | Exact-span F1 |       Lemma |     Reading |         POS |
| ------------------ | ----------: | ------------: | ----------: | ----------: | ----------: |
| Sudachi Core A     | **.993724** |   **.984951** | **.850240** | **.960558** | **.891760** |
| `@faanau/kuromoji` |     .971589 |       .932775 |     .756409 |     .858151 |     .764207 |

The paired PUD intervals also exclude zero in all five metrics. This reduces,
but does not remove, the risk that GSD's UniDic lineage favors SudachiDict.
An independent JUMAN-family corpus would further test dictionary-family bias;
the inspected Kyoto Wikipedia corpus needs provenance confirmation before it is
promoted to primary human gold.

### Zenbu product-risk cases

Both providers preserved all 6/6 required abstentions and produced zero severe
wrong IDs through the bounded research-only candidate-family resolver.
Sudachi B/C retained both exact app-owned candidates; mode A retained one of two
because it split `日本語`. Kuromoji retained both. Sudachi B led this small set
on boundary, lemma, reading, and POS. The resolver admits only an exact single
app-owned family and never chooses a ranked first homograph; it is benchmark
evidence, not a proposed production identity policy.

The repaired scorer additionally reports provider-neutral allowed-boundary F1,
OOV precision/recall/F1, exact-link precision/recall/F1, severe wrong-link rate,
and every authored category separately. On the small risk set, Kuromoji OOV F1
was .750 (precision 1.0, recall .6); Sudachi A/B/C OOV F1 was .333 (precision
1.0, recall .2). All exact-link precisions were 1.0, all 6 abstentions were
correct, and severe wrong-link rate was zero. This OOV weakness is visible and
must be expanded before production; it is not hidden by the population corpus,
whose OOV truth is unspecified.

The new native Swift Kuromoji port was intentionally not added after the sealed
holdout reveal. On the pre-holdout dev set it scored .966632 boundary F1,
.918794 exact-span F1, .741169 lemma, .838540 reading, and .773175 POS—effectively
the same IPADIC quality as the JavaScript provider and materially behind
Sudachi A. On the Zenbu hard cases it matched Kuromoji.js, including 6/6
abstentions and zero severe wrong IDs. Its smaller native host therefore does
not reverse the language-quality result.

The required #242 behavior remained explicit: `がいる` never became `外 + る`,
contextual/bare `いる` abstained rather than selecting `要る`, bare `静` and
`読本` abstained, and `用いる` remained whole and linked to the exact recorded
app-owned candidate.

### Other controls

- **Apache Lucene Kuromoji 10.5.1** SEARCH scored .970511 boundary, .927152
  exact span, .799935 lemma, .847505 reading, and .790429 POS on GSD dev. It
  slightly beat other IPADIC Kuromoji configurations but remained behind
  Sudachi A. Its public TokenStream omits the internal `isUnknown` state, so it
  fails the explicit-OOV gate; a JVM is also not a credible iOS runtime. See
  [official API](https://lucene.apache.org/core/10_5_1/analysis/kuromoji/org/apache/lucene/analysis/ja/JapaneseTokenizer.html)
  and [release](https://github.com/apache/lucene/releases/tag/releases%2Flucene%2F10.5.1).
- **Apple `NLTokenizer`/`NLTagger`** remains the zero-download control. The
  already executed iOS seed supplied 3/4 boundaries but no required readings or
  dependable lemmas, so it fails the evidence-field hard gate without custom
  morphology. See [Apple Natural Language](https://developer.apple.com/documentation/naturallanguage).
- **Current Zenbu** supplied only 1/4 disclosed anchors in #250, including
  confident wrong greeting/noun links. Its greedy scan and three handwritten
  deinflection rules violate this ticket's established-technology requirement.

These two controls were screened through their public iOS seams and excluded at
the mandatory capability gate before the new confirmation holdout. They were
not given fabricated reading/POS/OOV fields merely to fit the JSON schema, and
were not run over 512 rows after exclusion: more rows cannot repair a public
interface that omits required evidence or a baseline that violates the explicit
no-custom-parser constraint. Their four disclosed anchors remain a limitation,
not population-quality evidence.

## iPhone integration and resources

All figures below are release `-Os` **Simulator** measurements on the same
iPhone 17 Pro / iOS 26.0.1 runtime, Xcode 26.0 (`17A324`), Apple M3 Max host.
Both prototypes also compiled for generic arm64 iOS with signing disabled. No
physical-iPhone timing or energy claim is made; warm differences below one tenth
of a millisecond are not decision-relevant beside OCR and UI latency.

The repaired retained run used 30 fresh processes per provider. Each process
performed 20 warmups, 200 measured calls, 10 determinism repeats, and 100
concurrent calls. All 90 fresh launches completed without a process failure;
each provider produced one deterministic hash. All resources were bundled and
the harness contains no network client. The selected Sudachi path also ran a
second 30-process validation pass: the real 217.5 MB dictionary checksum passed
30/30, a deliberately corrupt payload was rejected 30/30, and a missing bundle
resource follows an explicit error path.

| Path                                                                                                                   | App / installed evidence                                         | Cold init p50 / p95 |   Warm p50 / p95 | Steady RSS p50 / p95 | Integration                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------: | ---------------: | -------------------: | ------------------------------------------------------------------------------------------------------------------ |
| [sudachi-swift 0.1.1](https://github.com/iasnezhkov/sudachi-swift/tree/v0.1.1) + Core                                  | 220.1 MB app; 72.3 MB dictionary download; 217.5 MB dictionary   |      7.19 / 7.71 ms | .0550 / .0663 ms |     311.3 / 311.9 MB | Direct SPM/UniFFI, typed fields, mmap dictionary, explicit locking                                                 |
| [`@faanau/kuromoji` 0.2.1](https://github.com/faanau/kuromoji-js/tree/380a8da1072691006b1a8c300885a04d582e80a1) in JSC | 100.5 MB app; 17.8 MB compressed or 100.3 MB expanded dictionary |      33.4 / 34.4 ms | .0341 / .0720 ms |     483.2 / 484.4 MB | iOS JSC lacks `fetch` and `DecompressionStream`; native loader, decompression, VM, JSON, and range bridge required |
| [`kuromoji-ios`](https://github.com/thuongvb/kuromoji-ios/tree/c601b3bf912babf0aa94c209a5dc74a46bd225db)               | 36.5 MB app; 35.9 MB generated IPADIC                            |      16.0 / 17.3 ms | .0249 / .0327 ms |     331.5 / 332.1 MB | Pure Swift and promising, but two commits, no release, no adoption history, unpinned dictionary fetch              |

Thirty fresh processes and ten repeated calls per process produced one
normalized hash for each measured path. Concurrent stress completed 100/100 in
every process with one hash for each. Sudachi uses a mutex-protected tokenizer; same-VM JavaScriptCore calls
serialize, while separate VMs duplicate costly state. Simulator RSS includes
the SwiftUI/process baseline and must not be read as dictionary bytes.

Mean warm throughput on the fixed four-sentence micro-corpus was approximately
20,831 sentences/s for Sudachi, 25,739 for JavaScriptCore Kuromoji, and 43,170
for native Swift Kuromoji. These sub-millisecond microbenchmarks are all fast
enough relative to OCR/UI work and do not outweigh the correctness result.

The three exact Xcode projects, Swift sources, JavaScriptCore loader adapter,
resource instructions, commands, and all 90 per-process scalar result rows plus
the 30 selected-provider checksum-validation rows are
retained under
[`docs/research/tools/issue251-ios/`](tools/issue251-ios/README.md) and
[the iOS sample artifact](fixtures/issue251-ios-measurement-samples-v1.json).

The Sudachi binding pins official
[sudachi.rs 0.6.11](https://github.com/WorksApplications/sudachi.rs/tree/v0.6.11),
which explicitly added Apple embedded-platform support. Its release archive is
29,519,209 bytes, SHA-256
`5f17105e7ec602413fc8c72e6a44d273758b36fa8da17edc3f6b0cc43983984e`.
Core's installed `system.dic` is 217,466,039 bytes, SHA-256
`53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f`.

## Licensing, provenance, and maintenance

| Candidate                                                                                            | Rights and provenance                                                                                                                                                                              | Status                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Sudachi.rs / sudachi-swift                                                                           | Apache-2.0; pin engine, binding, dictionary, and lockfile.                                                                                                                                         | Passes engine/binding gate.                                                                                        |
| [SudachiDict Core 20260723](https://github.com/WorksApplications/SudachiDict/releases/tag/v20260723) | Apache-2.0 distribution with retained UniDic and other third-party notices in `LEGAL`.                                                                                                             | Passes if the complete notices ship with the optional pack and SBOM.                                               |
| `@faanau/kuromoji`                                                                                   | Apache-2.0 code; bundled `mecab-ipadic-2.7.0-20070801` requires its NAIST/ICOT notices. Npm tarball: 15,492,854 bytes, SHA-256 `979d6d5ef7464a0b9e1461ee9f4d9ffe712874f57a7afb556e4465ed966f6b20`. | Redistributable, but old dictionary and indirect iOS host.                                                         |
| Lucene Kuromoji                                                                                      | Apache-2.0 plus complete bundled IPADIC notice.                                                                                                                                                    | Legal, but OOV/API and iOS-host gates fail.                                                                        |
| Native Swift Kuromoji                                                                                | Apache-2.0 code/NOTICE; source IPADIC archive has its separate redistribution terms.                                                                                                               | Legal path appears possible, but current build script is not checksum-pinned and project maturity is insufficient. |
| Migaku                                                                                               | No recovered redistribution grant for parser/deconjugation packs.                                                                                                                                  | Excluded.                                                                                                          |

The benchmark data remains in the isolated research directory with its
CC BY-SA attribution. Neither UD data nor its generated result rows enter the
shipping app or Language Reference Data.

The native Swift port's current built app also contained no Apache license,
port/Atilika notice, or full IPADIC `COPYING` text. Its root notice only links
to the required NAIST/ICOT terms. Zenbu would have to package those notices
explicitly; the dependency does not currently make a compliant consumer bundle
by itself.

## TDD and reproducibility

The retained scorer tests proved red before green for:

- a wrong boundary;
- wrong lemma, reading, and POS independently;
- a guessed homograph counted as a severe wrong link;
- a non-round-tripping source range;
- scalar-range mapping through retained Apple character boxes, including one
  multi-scalar Swift `Character`, with incomplete geometry rejected;
- engine/dictionary metadata drift;
- duplicate/order sensitivity; and
- deterministic paired bootstrap output.

The first real Kuromoji dev run exposed a genuine `word_position` drift after
mixed ASCII punctuation. The adapter now derives Unicode-scalar ranges by
sequential exact surface round-trip and fails closed if any surface is absent;
it does not hide or clamp the provider offset.

Reproduction uses the exact-version provider scripts and source manifest:

```sh
python3 docs/research/tools/test_issue251_morphology_benchmark.py

python3 docs/research/tools/issue251_sudachi_provider.py \
  docs/research/fixtures/issue251-morphology-confirmation-holdout-v1.json \
  --mode A \
  --provider-contract docs/research/fixtures/issue251-morphology-provider-contract-v1.json \
  --provider sudachi-a --output /tmp/sudachi.jsonl

NODE_PATH=/path/to/node_modules node \
  docs/research/tools/issue251_kuromoji_provider.mjs \
  --truth docs/research/fixtures/issue251-morphology-confirmation-holdout-v1.json \
  --dictionary /path/to/node_modules/@faanau/kuromoji/dict \
  --module @faanau/kuromoji \
  --provider-contract docs/research/fixtures/issue251-morphology-provider-contract-v1.json \
  --provider faanau-kuromoji \
  --output /tmp/kuromoji.jsonl

python3 docs/research/tools/issue251_morphology_benchmark.py score \
  docs/research/fixtures/issue251-morphology-confirmation-holdout-v1.json \
  /tmp/sudachi.jsonl \
  --provider-contract docs/research/fixtures/issue251-morphology-provider-contract-v1.json \
  --provider sudachi-a \
  --expected-output-sha256 d8d2a4a73d1e0d16f44f089bf9908f41970b9e63c14706fc77383de720186fae

python3 docs/research/tools/issue251_compare_providers.py \
  docs/research/fixtures/issue251-morphology-confirmation-holdout-v1.json \
  /tmp/sudachi.jsonl /tmp/kuromoji.jsonl \
  --provider-contract docs/research/fixtures/issue251-morphology-provider-contract-v1.json \
  --provider-a sudachi-a --provider-b faanau-kuromoji
```

Exploratory dev/test/PUD JSONL is rebuildable from pinned sources and hashes.
The decisive confirmation truth and all four normalized provider JSONL files
are committed under `docs/research/fixtures/`.

### Runtime cost

- repaired one-shot confirmation providers, scoring, and bootstrap: 9 seconds;
- final scorer/repository/license/privacy/format verification batch: 62 seconds;
- paired exploratory bootstrap: about 18 seconds;
- disposable iOS setup lane: approximately 20m41s for research, initial builds,
  and exploratory runs; the final 30×200 three-provider matrix took 92 seconds
  and the 30-run Sudachi checksum/corruption matrix took 31 seconds;
- no broad UI, Accessibility XXXL, or #227 43-minute suite was run.

## Recommended production boundary

```text
lawful subtitle/caption text OR Apple Image Text Recognition line text
  -> Sudachi Core provider
       C candidate ranges with provider-native A child ranges
       surface + lemma + reading + POS + OOV + version/checksum
  -> app-owned candidate-family and ambiguity policy
  -> LanguageReferenceID only when evidence identifies it
  -> existing overlay, lookup, ranking, Encounter Media, and navigation
```

The Core pack should be optional and checksum-pinned, downloaded only with
learner consent, atomically installed, excluded from backup, and accompanied by
source/version/license/size disclosure. Without it, the app should expose honest
raw recognized text or measured Apple boundaries; it must not fall back to the
current handwritten morphology.

## What would change this recommendation

- A reviewed, released, sustainably maintained `kuromoji-ios` with a pinned
  dictionary build and a fresh unopened holdout could change the integration
  decision; its current size/performance is attractive.
- An independent JUMAN-annotated human-gold corpus showing that GSD/PUD's UniDic
  lineage materially favored Sudachi could change the quality result.
- Any severe wrong identity on a larger fluent-human-adjudicated Zenbu set
  blocks the candidate regardless of population score.
- Physical iPhone evidence showing unacceptable memory, energy, launch, or
  pack-install behavior blocks Core.
- An owner storage budget below 72.3 MB downloaded / 217.5 MB installed requires
  an explicit tradeoff. Do not silently substitute Sudachi Small or custom
  repair rules.
- A maintained zero-download Apple model that supplies stable ranges, lemmas,
  readings, POS, and OOV on the same evidence would reopen the decision.

## Stop gate

No production provider, package, model, pack, UI, OCR, ranking, or parser change
is authorized by this report. The next step is an owner choice: approve the
optional Sudachi Core pack and community binding for a separately scoped TDD
implementation, or request the additional independent-corpus / native-Kuromoji
maturity evidence above.
