# Prior Zenbu Japanese parser research recovery for issue #250

Research for [#250](https://github.com/serpcompany/zenbujapanese-monorepo/issues/250)
at `3c9a2abe112aac37106a084faded8c3530277ddd`. Consulted 2026-09-03. This
note changes no production code, dependency, data artifact, privacy behavior,
or learner-visible behavior.

## Decision

Prior Zenbu material **does identify a Kuromoji foundation in the captured
Migaku browser extension**, but only for the owner-authorized local derivative
attributed to Migaku 1.30.8. It does not identify Sudachi in Migaku.

The recovered evidence establishes this bounded statement:

- the captured extension's Japanese parser initializes a class named
  `KuromojiParser`;
- it requires eight Kuromoji-named binary resources and fetches Migaku's public
  `parser-new/ja/zip/kuromoji.zip` when they are absent;
- its higher layers separately expose syntax/word/token parsing, enhanced token
  processing, dictionary search, and deconjugation; and
- its deconjugator fetches a separate Japanese conjugation resource.

This is materially more specific than the public-only conclusion in the first
[#250 report](issue-250-japanese-image-text-stack-2026-09-03.md#migaku-what-is-relevant-and-what-is-not).
It still does **not** prove which upstream Kuromoji implementation or dictionary
Migaku used, that the same stack remains in current Migaku, that Migaku's
product quality comes from Kuromoji alone, or that its proprietary code/data is
reusable.

Do not replace the #250 recommendation with an unmeasured Kuromoji adoption.
Add a clean, redistributable Kuromoji configuration to the same independent
benchmark as Sudachi Core. That comparison is now tracked in
[#251](https://github.com/serpcompany/zenbujapanese-monorepo/issues/251).

## Search scope and method

The scope was the complete owner-supplied local Zenbu root, referred to below as
`<zenbu-root>`, including hidden and ignored material, archived copies,
generated/vendor artifacts, package locks, and all Git repositories, refs,
tags, and remotes. All nine applicable `AGENTS.md` files were read before their
subtrees. The machine's username-bearing absolute path is intentionally not
published.

The search first inventoried 23 prototype directories, the `resources`
repository and its six content areas, the browser-extension repository, the
current monorepo, hidden root material, and 28 Git repositories including
nested references/build checkouts. It then combined keyword discovery with
source tracing: imports and runtime calls, lockfile resolution, binary/resource
names, archive contents and hashes, Git blame/log/refs, provenance notes,
licenses/notices, and surviving runtime artifacts. Secrets files were
classified by name and location but not opened or quoted.

Private repository and artifact locations are represented by stable aliases.
Their exact local paths remain in the private audit transcript rather than this
public report. No credential value, proprietary source excerpt, or private
artifact is included.

The relevant search shapes were:

1. Migaku text ingestion -> Japanese parser -> deconjugation -> dictionary
   search;
2. subtitle/DOM/WebVTT acquisition -> word-level interaction, without OCR;
3. established morphology engines already executed by Zenbu prototypes;
4. Yomitan/asbplayer delegation rather than app-owned parsing;
5. OCR region text -> word boundaries -> reading/furigana; and
6. iOS-capable analyzer research, fixtures, and rejected prototypes.

### Sanitized evidence locator

This public locator preserves reproducible identities without publishing
private repository URLs or proprietary paths:

| Evidence ID                    | Immutable identity or coordinate                                                                                                                                                                                                                                                                  | What it supports                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `MIG-LOCAL-RUNTIME`            | private artifact SHA-256 `521b164f68826a98d01bbad01e52265952f589f1a182c060563047139ff2c409`; string byte offsets `JapaneseParser` 912805/4571635, `KuromojiParser` 912955/4569742, initialization 4569730, parser URL 4582664, parse-words type 913114/4586124/4587272, deconjugation URL 4426623 | Exact local call-site coordinates for the captured 1.30.8 derivative. The private audit transcript retains the path and commands. |
| `MIG-PARSER-PACK`              | public URL below; 18,595,184 bytes; SHA-256 `68e4f9f69fc611fe67b505e96336efd88ec04012839293a9fe9fd288d2930979`                                                                                                                                                                                    | Hosted parser pack identity and byte equality with two private archives and the captured runtime resources.                       |
| `MIG-DECONJ-PACK`              | public base URL below; 3,807-byte ZIP SHA-256 `66711eb1ac3c42b046b0f2a76f644705c816f8c86acd7c2e3b659d8f05acab12`; 51,023-byte JSON SHA-256 `de4e41110136a37105f9f75bd67ac5c8ba08662e213ef44207c5450440d5c741`                                                                                     | Separate 925-row deconjugation resource identity.                                                                                 |
| `V1-RESEARCH`                  | commits `553946e2aaed4d740677690da28b36ce580903f4` and equivalent local continuation `fe519a2083904e1b92e355b482b3419b17afa2bc`                                                                                                                                                                   | Tracked parser/deconjugation research and npm Kuromoji adapter.                                                                   |
| `PROVIDER-SANDBOX`             | commits `5dd2d594f3997d3f3facfed0316ced0437422afa` and move `40a2597ec5b60b154e7b869f704606bf2b7a65c6`                                                                                                                                                                                            | Five inflection fixtures and the unimplemented Kuromoji/Sudachi comparison plan.                                                  |
| `ZENBU-KUROMOJI`               | revisions `26a0052d53cd8b12b9af3da50c97743635851089` and `58111fab132f9fe9b1ef97161b712f4afddd07e8`                                                                                                                                                                                               | Executed npm/browser Kuromoji paths.                                                                                              |
| `APP-QUARANTINE`               | tree `9ef66691821942aefbe37ff05d85ebfc7cff3dee`                                                                                                                                                                                                                                                   | Historical deconjugation proof and explicit no-reuse boundary.                                                                    |
| `KANJIMON-REVIEW`              | commit `39d4ffbc7ea2bc2f08624c1f32a2e9d1edf1429d`                                                                                                                                                                                                                                                 | Earlier local implementation comparison.                                                                                          |
| `NIHONGO-AUDIT`                | commit `6ed3f17222ece9062f1023e5802996963eaa060a`                                                                                                                                                                                                                                                 | Historical signed-artifact tokenizer/model classification.                                                                        |
| `SUDACHI-SEED` / `OSS-ORACLES` | commits `061726800bd4f63f6c24188c63197306476bb4e2` and `a1e17d02935e2e54bf24385a17e46fe10d144821`                                                                                                                                                                                                 | Earlier Sudachi iOS/build evidence and GPL differential-oracle research.                                                          |

Private remotes and exact proprietary filenames are intentionally omitted under
the public-disclosure boundary. Public upstreams and data endpoints remain
linked where they are independently reproducible.

## Repository inventory

### Research-relevant repositories and directories

| Alias                                                                                             | Revision / evidence status                                             | Classification and recovered evidence                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migaku-1.30.8-local`                                                                             | Private owner-authorized snapshot; no published history                | Local derivative attributed by its private provenance record to installed Migaku 1.30.8.0. Contains the compiled parser/runtime and matching parser binaries. Proprietary reference evidence, not a reusable dependency.                                                                    |
| `japanese-app-v1`                                                                                 | `c8c8f5f`; relevant evidence also survives on a remote-tracking branch | Committed December 2025/January 2026 research names Migaku's Kuromoji and deconjugation packs. The implemented batch path uses npm `kuromoji@0.1.2`, not Migaku's incompatible binary format. Private ignored archives retain the downloaded packs and generated DBs.                       |
| `japanese-app-v2`                                                                                 | `a8b9da2`; private historical repository                               | Carries archived v1 pack copies and a March 2026 provider-comparison sandbox. The Kuromoji provider is a throwing stub, Sudachi is only a README candidate, and no tokenization report exists. Research scaffold, not benchmark evidence.                                                   |
| `japanese-db`                                                                                     | `26a0052`; historical prototype                                        | One-commit copy whose server and batch ingester actually execute `kuromoji@0.1.2` and consume surface, base form, reading, POS, and offsets. Prototype, not shipped iOS code.                                                                                                               |
| `zenbu-app-archives`                                                                              | `08490e0` / `a81c921`; quarantined tree `9ef6669`                      | Preserve an exact 925-rule Migaku-derived deconjugation resource and lookup proof. Their migration records explicitly prohibit runtime reuse or deriving new runtime rules from it.                                                                                                         |
| `zenbu-browser-extension`                                                                         | `58111fa`; tag `prototype-handoff-2026-08-13`                          | Clean tracked prototype imports bundled `kuromoji.js`, downloads the 0.1.2 dictionary, tokenizes subtitle/page/OCR text in a service worker, and uses base form/reading for local Jitendex lookup. Its private provenance says the larger extension was recovered from Sokutan, not Migaku. |
| `zenbu-video-subtitles` / `sokutan-backup`                                                        | Historical local copies                                                | Earlier copies of the same Sokutan-derived Kuromoji path; corroborating copies rather than independent implementations.                                                                                                                                                                     |
| `migaku-clean-room-experiment`                                                                    | Private local experiment; no Migaku source                             | Deliberately uses `Intl.Segmenter` plus imported literal deinflection rules and labels that behavior as not full morphology. It cannot identify Migaku internals.                                                                                                                           |
| [asbplayer](https://github.com/asbplayer/asbplayer/tree/a123006997654fc44f604418ee5d2e3ac0cbb504) | `a123006`; public upstream                                             | A local abandoned fork preserves upstream code that sends text to Yomitan's action API and supports Yomitan scanning-parser or MeCab outputs. It teaches the adapter boundary but supplies no app-local analyzer.                                                                           |
| `manga-translator-proof`                                                                          | `8afe321`; private GPL-derived proof of concept                        | OCR selection uses `Intl.Segmenter`; optional furigana uses bundled Kuroshiro + its Kuromoji analyzer. Useful browser evidence, not a native iOS or permissive production dependency.                                                                                                       |
| `nihongo-reference-clone`                                                                         | `b99a742`; private reference project                                   | Notes identify embedded first-party-looking `Tokenizer` and `DictionaryFramework` frameworks but do not resolve their implementation. Clone code uses Apple Vision plus custom grouping/deinflection and is not evidence of Nihongo's private parser.                                       |
| `resources/language-technology`                                                                   | resources revision `ce37496`                                           | August 2026 note compares Apple Natural Language, Lindera, Sudachi, MeCab, and ICU for Example Sentence Retrieval. It correctly warns that alternatives are not identified Nihongo dependencies.                                                                                            |
| `kanjimon-prototype-2`                                                                            | `c2b6df8`; private prototype                                           | Its local-parser review rejects `Intl.Segmenter` and the custom Nihongo clone, treats the Sokutan Kuromoji code only as a functional pattern, and proposes MeCab-Swift then Sudachi. It predates the direct Migaku 1.30.8 artifact.                                                         |
| `zenbujapanese-monorepo`                                                                          | research base `3c9a2ab`                                                | Current iOS source, ADRs, #191 research, #250 seed benchmark, and app-owned Language Technology boundaries.                                                                                                                                                                                 |

### Remaining inventory

The remaining prototype directories were searched and yielded no additional
Migaku/parser provenance or production-ready Japanese morphology component:

- `japanese-daft-punk-soundboard`, `jvs-dataset-analysis`,
  `kanjimon-prototype-1`, `learn-japanese`,
  `learn-japanese-manga-app`, `manga-reader-practice`,
  `media-viewer-game-script-experience`, `mini-manga-web`, `zenbu`, and
  `zenbu-japanese-vibecodeapp-3`;
- the resources areas `japanese-frequency-word-lists`,
  `japanese-word-lists-jlpt`, `kanshudo-datasets`, `nijapanese.com`, and
  `product-ideas`; and
- nested Kanji Dojo, swift-fsrs, game-reference, archived playground, and build
  checkout repositories. These are data, unrelated products, historical
  copies, or generated dependency checkouts for this question.

Hidden editor/cache/metadata paths contained no additional parser evidence.
Potential credential stores were not opened because their contents cannot
answer the research question.

## Migaku 1.30.8 evidence

### Provenance boundary

The private provenance record says the source was copied from installed Migaku
version `1.30.8.0` (`version_name` 1.30.8), under owner-represented written
authorization. The local derivative removed Web Store identity and changed
branding/account behavior. The original installed directory is no longer
present, the derivative has no published Git commit, and no
original-versus-derivative diff survives. Attribution to that exact Migaku
release therefore rests on the local provenance record, not a reproducible Web
Store hash.

Within that boundary, the parser evidence is direct:

| Evidence               | Exact observation                                                                                                                                                                                                                   | Strength / limit                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compiled runtime       | Private compiled artifact, SHA-256 `521b164f68826a98d01bbad01e52265952f589f1a182c060563047139ff2c409`, names `JapaneseParser` and `KuromojiParser`; the Japanese parser constructs the Kuromoji parser and logs its initialization. | Direct local source-artifact evidence for the captured derivative. The proprietary/minified file is not copied or linked from this report.            |
| Required parser assets | Runtime requires eight public-pack binary resources covering its FST, connection costs, token information, character definitions, and unknown-word dictionary.                                                                      | Direct resource-loader evidence. Names and shapes are consistent with a Kuromoji Viterbi dictionary, but do not identify an upstream package/version. |
| Parser download        | On missing local assets, the runtime fetches [Migaku's `kuromoji.zip`](https://migaku-public-data.migaku.com/parser-new/ja/zip/kuromoji.zip).                                                                                       | Direct call-site and Migaku-owned endpoint evidence.                                                                                                  |
| Word-processing layers | The same runtime defines distinct parse-syntax, parse-words, parse-tokens, enhanced-token, dictionary-search, and `Deconjugator` paths.                                                                                             | Proves product behavior is more than raw Kuromoji output; exact proprietary policies remain unknown.                                                  |
| Deconjugation download | The deconjugator uses `https://migaku-public-data.migaku.com/deconjugation/` and fetches language-specific conjugation JSON/ZIP data.                                                                                               | Direct call-site evidence for a separate inflection layer.                                                                                            |
| Runtime artifact       | July 2026 `core-probe.json` records Japanese selected, Core ready, parser-ready storage, and installed JMdict/frequency resources. A YouTube bridge artifact records a native auto-caption track but a failed transcript request.   | Confirms initialization/resource behavior; it is not a token-quality benchmark and does not prove successful subtitle parsing in that run.            |

### Independent byte corroboration

Two private ignored archive copies survive in the `japanese-app-v1` and
`japanese-app-v2` historical snapshots. Both are 18,595,184 bytes with SHA-256
`68e4f9f69fc611fe67b505e96336efd88ec04012839293a9fe9fd288d2930979`.
The archive expands to the same eight files (63,923,476 bytes total), and every
expanded file is byte-identical to the corresponding private captured-extension
resource. A fresh fetch from the Migaku endpoint on 2026-09-03 returned the
same size and SHA-256; the response reported
`Last-Modified: Wed, 02 Oct 2024 23:47:30 GMT`.

The parallel Japanese deconjugation ZIP is 3,807 bytes with SHA-256
`66711eb1ac3c42b046b0f2a76f644705c816f8c86acd7c2e3b659d8f05acab12`
in both archives and from a fresh endpoint fetch. It contains 925 mappings with
only `inflected` and `dict` fields. It supplies candidate suffix replacements,
not reasons, ranges, readings, POS, or app-owned identity.

Neither ZIP contains a license or notice. Public reachability is not a
redistribution grant. The captured extension's proprietary source also cannot
be moved into Zenbu's clean production code merely because the owner was
authorized to study or fork it in a separate prototype.

The historical Zenbu app archives independently preserve the same 925-rule
deconjugation payload as a 51,023-byte JSON blob with SHA-256
`de4e41110136a37105f9f75bd67ac5c8ba08662e213ef44207c5450440d5c741`.
Their exact quarantined tree is `9ef66691821942aefbe37ff05d85ebfc7cff3dee`.
The migration and quarantine manifests classify its version/license as
unresolved and forbid production use. It is useful only to corroborate the
resource shape and to supply non-shipping differential test ideas.

### Exact conclusion about Migaku

The defensible conclusion is:

> The owner-authorized local capture attributed to Migaku browser extension
> 1.30.8 uses a Kuromoji-named parser and matching hosted binary pack, with
> separate Migaku parsing, dictionary, enhanced-token, and deconjugation
> layers.

It is **not** defensible to say:

- Migaku uses Sudachi;
- Migaku uses npm `kuromoji@0.1.2` or its 2007 IPADIC;
- Kuromoji alone explains Migaku's word-selection quality;
- current Migaku still uses this exact stack; or
- Migaku's parser binaries/rules can be redistributed.

## Recovered Zenbu implementations and tests

### Executed Kuromoji paths

Two older Zenbu paths execute the established npm
[`kuromoji@0.1.2`](https://github.com/takuyaa/kuromoji.js/tree/d0357c1427acb912815fc8ab59f284dd08bad0fa):

1. `prototypes/japanese-db/server.mjs` and
   `scripts/v2/ingest-samples.mjs` build its tokenizer and consume
   `surface_form`, `basic_form`, `reading`, POS, and offsets.
2. The tracked `zenbu-browser-extension/background.js` imports the bundled
   browser build, downloads its 12 dictionary files, runs tokenization off the
   page thread, and returns those same fields to subtitle/page/OCR consumers.

The lockfile pins the npm tarball and integrity. The package is Apache-2.0; its
notice says the bundled 17 MB compressed dictionary is
`mecab-ipadic-2.7.0-20070801` with separate NAIST/ICOT notices. This makes it a
clean reproducible comparator, but its old dictionary and browser/Node runtime
do not establish the best iPhone integration.

A focused read-only replay against the four #250 anchors produced:

| Anchor           | npm Kuromoji 0.1.2 output relevant to #250   |
| ---------------- | -------------------------------------------- |
| `日本語`         | one token, base `日本語`, reading `ニホンゴ` |
| `今日は静か…`    | `今日` then `は`                             |
| `問題を解いて…`  | `解い` then `て`, base `解く`                |
| `友達と話します` | `話し` then `ます`, base `話す`              |

That is 4/4 on the same bounded boundary/base-form criteria used by #250. It
does not establish population quality, dictionary identity, ambiguity safety,
or iPhone performance. It does show that #250's initial four-candidate matrix
omitted a locally proven challenger and that Sudachi Core was not the only
tested-established engine capable of those four cases.

The retained generated v2 database corroborates correct `今日` + `は` and
common verb base forms across older batch fixtures, but it also contains
non-redistributable media research and unadjudicated outputs. It must not be
copied into the new benchmark or treated as ground truth.

### Earlier analyzer and oracle evidence

The current monorepo already contains stronger earlier measurements than the
prototype plans:

- `docs/research/japanese-example-sentence-signals-2026-08-15.md` records a
  pinned arm64-iOS build of Sudachi.rs 0.6.11 with SudachiDict Small 20260723,
  20/20 dictionary-form cases on one set, 17/20 on a second, and deterministic
  repeated output. That was build-time candidate-generation evidence, not an
  Image Text production selection.
- `docs/research/oss-japanese-example-association-2026-08-16.md` records 10ten
  1.27.2's 242 typed rules with 32/32 tests and Yomitan 26.7.29.0's 54
  transforms/834 rules. Both are GPL and therefore useful as non-shipping
  differential deinflection oracles, not code or data to transplant into the
  iOS product.
- `docs/research/nihongo-example-retrieval-artifact-audit-2026-08-14.md`
  identifies a first-party `com.serpentisei.Tokenizer` framework and bundled
  `JapaneseTagger` Core ML model in the historical signed Nihongo 1.33.1
  artifact. Its metadata indicates token/tag/range outputs,
  dictionary-backed path-cost tokenization, JMdict POS conversion, and
  deconjugation. It contains no Kuromoji, MeCab, Sudachi, or Lindera
  fingerprint. Nihongo therefore remains proprietary reference evidence, not
  a source for a reusable parser.

### Reusable fixtures, not results

- The March 2026 provider-comparison sandbox pre-registers five useful
  inflection strings: `食べました`, `飲んでいる`, `走らなかった`,
  `きれいじゃない`, and `勉強しています`. Its Kuromoji adapter throws
  “not implemented,” its manifest never installed Kuromoji, and there is no
  tokenization report. Reuse the inputs only after human ground-truth
  adjudication.
- The tracked v1 media fixtures contain short purpose-created movie, song,
  game, and SRT-style Japanese samples. Their bytes can seed a development set,
  but their token rows were generated by the candidate and cannot become truth.
- The clean-room Migaku experiment has strong offset-preservation and imported
  deinflection test shapes, but its `Intl.Segmenter` + custom rule results are a
  product experiment, not a morphology oracle.
- The Kuroshiro/Kuromoji and asbplayer/Yomitan prototypes demonstrate adapter
  patterns. The former is GPL-derived and browser-specific; the latter delegates
  to a separately installed Yomitan and was explicitly abandoned as this Zenbu
  prototype.

## Reconciliation with current research

| Current statement                                                                  | Recovered evidence                                                                                                                                                                                       | Reconciliation                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #250: Migaku public material does not disclose its tokenizer or morphology engine. | Owner-authorized local 1.30.8 derivative directly names and initializes `KuromojiParser`.                                                                                                                | The public-only statement was accurate within its stated source set, but incomplete for the owner's local corpus. Amend the project conclusion for captured 1.30.8 only. |
| #250: Sudachi Core leads the four-anchor seed at 4/4.                              | Clean npm Kuromoji 0.1.2 also satisfies the four boundary/base-form anchors.                                                                                                                             | Sudachi remains a valid candidate, not an established winner. Run the larger pre-registered #251 comparison.                                                             |
| #250: subtitle text should bypass OCR.                                             | Migaku runtime and the Zenbu/Migaku/asbplayer experiments separately acquire native caption tracks, subtitle files, page text, or transcription before parsing words.                                    | Confirmed. OCR remains for pixels without a lawful text track, not ordinary caption text.                                                                                |
| #250: preserve app-owned identity and ambiguity abstention.                        | Every recovered engine emits language evidence, while older Zenbu mappings show that reading/POS and deconjugation still require app-owned resolution. Migaku adds proprietary layers beyond its parser. | Confirmed. No provider token or ranked first dictionary row becomes `LanguageReferenceID`.                                                                               |
| #191: the Sudachi Swift binding is the best future native analyzer prototype.      | Local browser products prove Kuromoji quality/footprint but no maintained native Swift path. npm Kuromoji requires an actual iOS host such as JavaScriptCore to be measured.                             | Not contradicted on integration maturity. #251 must compare the real proposed iPhone hosts, not Node versus native timings.                                              |
| August resources note: no official Swift Sudachi path found.                       | September #191/#250 found the new community `sudachi-swift` binding.                                                                                                                                     | Historical, not a contradiction; the older note predates the inspected 2026 binding evidence.                                                                            |
| Prior Nihongo clone note: its `Tokenizer` implementation was unresolved.           | The signed 1.33.1 artifact audit identifies a proprietary first-party framework/model shape, but no reusable OSS engine fingerprint.                                                                     | Sharper classification, not an implementation candidate. Do not substitute clone heuristics for the reference framework.                                                 |

No recovered local evidence makes Migaku's proprietary post-processing
reproducible or licensed. No TinySegmenter or Rikaitan implementation was found.
MeCab, Lindera, Vibrato, Kuroshiro, Yomitan, and Yomichan appear as evaluated
alternatives, delegated tools, format readers, or archived prototypes; none is
already integrated into the current iOS product.

Reachable branches, tags, remote-tracking refs, reflog-only states, and
unreachable Git objects were also searched. Deleted history added earlier path
layouts and duplicate notes for the same Migaku resources, but no distinct
parser, benchmark result, or contradictory Migaku implementation.

## Architecture recommendation

Keep the architecture from ADR 0001 and change only the benchmark candidate
set:

```text
lawful text source (caption/DOM/file) OR Apple Image Text Recognition
  -> app-owned ordered text and source ranges
  -> replaceable Japanese Text Analysis provider
       A: clean Kuromoji engine + licensed pinned dictionary
       B: sudachi.rs + SudachiDict Core
       C: Apple Natural Language control
  -> app-owned candidate mapping and ambiguity abstention
  -> LanguageReferenceID only when evidence identifies it
  -> purpose-specific overlay, lookup, and navigation
```

Adopt from the recovered systems:

- direct subtitle/caption ingestion before OCR;
- a deep parser adapter returning ranges, surface, base form, reading, POS, OOV,
  and version evidence;
- a separate, versioned dictionary resolver and ambiguity state; and
- checksum-pinned downloadable language resources when size requires them.

Reject or defer:

- **reject** copying Migaku binaries, deconjugation data, or proprietary source;
- **reject** treating public URLs as licenses;
- **reject** selecting npm Kuromoji solely because Migaku used a
  Kuromoji-named foundation;
- **defer** Kuroshiro, which adds furigana formatting rather than canonical
  identity and arrives here through GPL-derived browser code; and
- **defer** asbplayer's Yomitan bridge for native iOS, while retaining its
  useful provider-adapter lesson.

## Recommended #250 update

`ready-for-human` is a decision gate, not a claim that every #250 production
outcome is complete. The current research and this recovery answer the immediate
technology question. The remaining work is explicit:

- #251 owns the larger Kuromoji/Sudachi/Apple/current-Zenbu morphology
  benchmark and must stop before production adoption;
- the 48-image OCR/layout corpus and physical-device measurements described in
  the first #250 report remain unexecuted; and
- production `RecognizeDocumentsRequest`, parser-pack, privacy, and UI changes
  require owner selection plus separately scoped implementation tickets.

That is why #250 should remain open at the human decision gate while #251 is
agent-executable. No remaining workstream is being treated as complete or
hidden by the label.

1. Record the corrected historical fact: Migaku browser 1.30.8's captured
   Japanese path was Kuromoji-based with separate proprietary layers.
2. Keep #250 open and `ready-for-human`; the evidence does not authorize a
   production dependency or pack.
3. Execute #251 with pre-registered ground truth. Compare a clean Kuromoji
   configuration, Sudachi Core, Apple Natural Language, and current Zenbu.
4. Give wrong confident dictionary identity more cost than honest abstention;
   preserve the #242 `いる`/longer-form regressions.
5. Measure the actual iPhone integration, binary/download/installed size,
   startup, warm latency, memory, ranges, deterministic output, maintenance,
   and complete engine/dictionary notices.
6. If Kuromoji and Sudachi are tied on held-out quality, prefer the smaller,
   simpler, legally maintainable native integration. If they are not tied,
   present the measured quality/size tradeoff to the owner before production.

## What would change this recommendation

- A current, lawfully accessible Migaku build with verifiable parser artifacts
  could update the historical-version conclusion, but matching output alone
  would not identify internals.
- A complete license/provenance record for Migaku's pack could change only its
  legal-candidate status; it would not replace quality/iPhone measurement.
- A held-out benchmark showing a materially lower severe wrong-link rate for
  one engine should decide over brand similarity.
- A maintained, tested native Kuromoji package could change the current
  integration disadvantage; a JavaScriptCore-only route must include that
  runtime's measured cost.
- Sudachi Core exceeding the approved storage/performance budget would require
  an explicit owner tradeoff, not a silent fallback to Small or new custom
  repair rules.

## Validation

- Read-only inventory and source/history/license tracing completed across the
  requested root.
- Both retained parser/deconjugation archives matched each other and fresh
  Migaku endpoint bytes by SHA-256.
- All eight archived parser resources matched the captured extension resources
  byte-for-byte.
- Reachable refs, relevant live remotes, reflog-only states, and unreachable
  objects produced no contradictory or additional parser implementation.
- Focused npm Kuromoji replay completed for the four #250 anchors.
- No app, UI, Accessibility XXXL, or #227 suite was run for this documentation
  recovery.
