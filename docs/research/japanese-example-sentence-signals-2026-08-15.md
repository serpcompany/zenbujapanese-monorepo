# Japanese Example Sentence signals and Language Technology

Date: 2026-08-15

Issue: [#165](https://github.com/serpcompany/zenbujapanese-monorepo/issues/165)

Fixed product point: `917cbb7153457a79db117b5d536bbf60a7dfe519`

## Decision summary

The evidence supports one Ranking change and one bounded technology experiment, but it does **not** yet support closing #158 or #160:

1. Japanese grapheme length should precede match position in the next proposed policy. All 89 accepted D18-D22 rows are nondecreasing by Japanese length, and length alone restores RH08's five uniquely sized rows. This requires an ADR and policy-version change before implementation.
2. Keep normalized literal containment as direct Japanese Search eligibility. It admits all 49 visible D18-D20 rows, and established morphology does not distinguish RH06's reference winner from its shorter literal competitors.
3. Evaluate pinned **Sudachi.rs `v0.6.11` (`90fd6068…`) plus SudachiDict-small `20260723` (`4813c1cd…`) only as replaceable build-time Language Technology** for corpus normalization. Do not ship the analyzer or dictionary in the iOS app. Its dictionary forms cover all 20 D21 rows, but only 17/20 RH09 rows.
4. Add no inferred link for the three remaining RH09 short commands. The analyzers classify `始め`/`はじめ` there as nouns, and app-owned JMdict evidence contains separate `始め` (sequence `1342540`) and `始める` (`1307550`) entries. Associating them with the verb without explicit evidence would violate the ambiguity boundary in ADR-0002.
5. Retain app-owned pair ID as the safe deterministic total-order fallback, while documenting that exact equal-length parity is not reproducible safely. It reproduces only 28/88 mapped D18-D22 positions. Provider coordinates reproduce the observed ties but remain forbidden Ranking inputs.

Production work stays in #158-#160 after review and an ADR update. No replacement holdout, production code, device state, or release state was used or changed.

## Questions and evidence boundary

This report asks three separate questions:

- **Direct Japanese Search Match:** which corpus records match the user's surface query?
- **Dictionary-entry association:** which records have evidence linking them to one app-owned Language Reference Data entry?
- **Example Sentence Ranking:** how are already-eligible records ordered?

Neither analyzer output nor source membership is Ranking. A lemma does not by itself prove one dictionary entry when the surface is a homograph. Provider IDs, source order, and hidden contexts are excluded.

The public evidence is D18-D22 plus the revealed [RH06](https://github.com/serpcompany/zenbujapanese-monorepo/issues/158#issuecomment-5299499903), [RH08](https://github.com/serpcompany/zenbujapanese-monorepo/issues/159#issuecomment-5299500026), and [RH09](https://github.com/serpcompany/zenbujapanese-monorepo/issues/160#issuecomment-5299500127) diagnostics. D22 rank 1 is absent from the pinned corpus, so provider-independent pair-ID comparisons cover 88/89 rows. Private capture contents and replacement holdouts were not consulted.

## Behavior results

### Direct Search and entry association

| Context | Route | Accepted rows | Literal surface | Sudachi dictionary-form/reading evidence | Finding |
|---|---|---:|---:|---:|---|
| D18 `食べる` | direct | 20 | 20/20 | not needed | Literal eligibility already covers the observed rows. |
| D19 `食べた` | direct | 20 | 20/20 | not needed | Literal containment deliberately includes `食べたい`; silently lemmatizing would change this Search contract. |
| D20 `ねこ` | direct | 9 | 9/9 | not needed | Literal eligibility already covers the observed orthography. |
| RH06 `飲んだ` | direct | `50+` | reference and candidate rank 1 both literal | both analyze to `飲む` | Morphology cannot select the reference; eight current literal candidates are shorter. |
| RH08 fixed phrase | direct | 5 | 5/5 | not needed | Eligible set is already exact; this is Ranking only. |
| D21 `食べる` entry | entry | top 20 | 6/20 current literal form | 20/20 dictionary form | Established morphology closes the visible form-family gap. |
| D22 `猫` entry | entry | top 20 | 20/20 written/reading-form containment | 19/20 exact token reading | Existing entry-form evidence covers the visible set; analyzer output alone is insufficient for compound `ねこっかぶり`. |
| RH09 `始める` entry | entry | top 20 | 1/20 current literal form | 17/20 dictionary form | `始め！`, `よし始め。`, and `演技はじめ！` remain ambiguous noun/stem evidence. |

Lindera/IPADIC, Lindera/UniDic, and SudachiDict-small agree on the decisive RH09 distinction: ordinary inflections such as `始めました` resolve to `始める`, while the three short commands resolve to noun `始め`/`はじめ`. This is useful negative evidence: switching dictionaries does not make an ambiguous association safe.

Official Tatoeba `jpn_indices` is supporting provenance, not a complete association rule. It contains 49/89 D18-D22 rows, 0/20 D21 rows, 5/20 D22 rows, and 10/20 RH09 rows. A universal filter would discard 40 accepted discovery rows. Tatoeba itself documents Japanese indices as B-line-style annotations associated with sentence pairs, separately from its sentences, links, detailed ownership, tags, language skills, and experimental reviews.[^tatoeba-downloads]

### Ranking and the equal-length problem

Length is the only fully supported primary signal: all 89 D18-D22 reference rows and RH08/RH09 are nondecreasing by Japanese grapheme count. It does not resolve equal-length groups. Six provider-independent total-order experiments produced:

| Tie signal after Japanese length | Exact reference positions | Within-length pair agreement |
|---|---:|---:|
| app-owned pair ID | 28/88 | 90/180 |
| Japanese Unicode lexical order | 40/88 | 96/180 |
| English grapheme length | 34/88 | 102/180 |
| English Unicode lexical order | 38/88 | 85/180 |
| app-owned content SHA-256 | 32/88 | 102/180 |
| IPADIC analyzer token count | 33/88 | 122/180 |

By context, length plus app-owned ID gives D18 `10/20`, D19 `6/20`, D20 `9/9`, D21 `1/20`, and D22 `2/19` exact positions. Token count is the best tested pairwise signal but still disagrees on 58/180 tied pairs. Punctuation, imperative status, match location, and `jpn_indices` membership also fail as general primary explanations in #158-#160.

Therefore:

- **Safe deterministic product order:** Japanese length, followed by declared Match evidence if a later ADR supports it, then app-owned pair ID.
- **Exact reference-parity order:** unavailable without provider/source order. That order is not adoptable because it is provenance, not a learner-facing Ranking fact.
- **RH06:** remains an eligibility/selection research blocker. The official Tatoeba exports expose potential quality facts—ownership, user skill, tags, original/translation base, and experimental reviews—but none is yet pinned and validated as the missing general signal.[^tatoeba-downloads]

## Language Technology evaluation

| Candidate | Exact evaluated version | Offline iOS feasibility | Runtime size/RSS/latency evidence | Determinism and disposition |
|---|---|---|---|---|
| Apple Natural Language | macOS 26.5.2 / Xcode 26.0 platform framework | system supplied | no bundled bytes; 2,000-tokenization host probe 0.72–1.17 s and 13.2–13.5 MB max RSS | Japanese lemma unavailable; reject. |
| Lindera + IPADIC/UniDic | 5.1.0 / bundled 5.1.0 dictionaries | compiled and linked arm64 iOS smoke | measured below; no signed-device runtime | probe output hash stable 3/3; capable but not selected. |
| Sudachi.rs + small | 0.6.11 / 20260723 | arm64 iOS library compiled; no Swift bridge | measured below; selected boundary ships neither component | probe output hash stable 3/3; select for build-time experiment. |
| Vibrato + IPADIC | 0.5.2 / last asset at 0.5.0 | arm64 iOS library compiled | engine `rlib` and archive size only; no runtime benchmark | behavior not qualified; reject for this decision. |
| MeCab + IPADIC | 0.996 / 2.7.0 | C/C++ API exists; no current iOS build performed | no comparable runtime measurement | old upstream release and wrapper burden; reject. |

Missing runtime measurements in rejected rows are explicit rather than inferred. None of the compile checks is a signed-device claim, and a smaller intermediate archive is not treated as a smaller installed app.

### Apple Natural Language

Apple documents `NLTagger`, language-specific available schemes, tokenization, and optional lemma tags.[^apple-nl][^apple-schemes] On macOS 26.5.2 / Xcode 26.0, `availableTagSchemes(for: .word, language: .japanese)` returned only `Language`, `Script`, and `TokenType`; lemma enumeration returned `nil` for the Japanese probes. It adds no bundled dependency but cannot supply the required dictionary-form contract on the tested platform. Not selected.

### Lindera 5.1.0

Lindera is an MIT-licensed Rust morphological analyzer with separately downloaded dictionaries.[^lindera] The exact evaluated tag is `v5.1.0` (`1bcb0e28…`); upstream published `v5.2.0` on 2026-08-14, establishing current maintenance but not behavioral equivalence.[^lindera-release]

An existing C-ABI research wrapper compiled and linked for `aarch64-apple-ios`: unstripped static archive 27,085,752 bytes (SHA-256 `137607b7…`), linked smoke executable 7,349,504 bytes (`3b747ab7…`). Its generated runtime inventory contains 96 Rust packages and must be regenerated as a release SBOM if ever selected.

| Dictionary | Release bytes | Extracted file sum | Host 2,000-sentence wall time | Host maximum RSS |
|---|---:|---:|---:|---:|
| Lindera IPADIC 5.1.0 | 15,879,934 (`ed10ce59…`) | 57,902,918 | 0.05 s (3/3) | 43,728,896–43,745,280 B |
| Lindera UniDic 5.1.0 | 54,469,218 (`321f9c9d…`) | 213,887,364 | 0.05–0.06 s | 150,781,952–150,847,488 B |

These are optimized arm64 macOS CLI comparisons, not iOS installed-size or signed-device claims. The four-sentence morphology probe produced the same SHA-256 `f495eeee…` in three fresh processes. IPADIC redistribution must retain the NAIST/ICOT terms; Lindera's UniDic package identifies UniDic 2.1.2 and requires its three-clause notice.[^lindera-ipadic-notice][^lindera-unidic-notice] Behavior is adequate for ordinary inflection but not the ambiguous RH09 commands. Not selected because Sudachi's official Rust implementation, current first-party dictionary release, and normalized-form API make the build-time replacement boundary more direct; this is not a runtime-performance conclusion.

### Sudachi.rs 0.6.11 plus SudachiDict-small 20260723 — selected for build-time evaluation

Sudachi.rs is the official Rust implementation of Sudachi, exposes dictionary form, normalized form, reading, POS, multiple segmentation modes, and requires a separate dictionary.[^sudachi] Exact `v0.6.11` (`90fd6068…`, released 2026-04-13) compiled as an `aarch64-apple-ios` Rust library without source changes; the resulting `rlib` was 4,145,200 bytes. This proves compile feasibility, not a final Swift bridge or signed runtime.

The exact SudachiDict-small release is `v20260723` (`4813c1cd…`, released 2026-07-24). Its official wheel is 41,770,618 bytes with release SHA-256 `c10c7541…`; the extracted `system.dic` measured 122,953,610 bytes (`f872a878…`).[^sudachi-dict-release] A local Python binding comparison processed the same 2,000 sentences in 0.03 s (3/3) with 38,764,544–39,059,456 bytes maximum RSS. The four-sentence morphology output SHA-256 was `dc517cc7…` in three fresh processes. These are host comparisons, not iOS claims.

The analyzer and dictionary are Apache-2.0; SudachiDict's `LEGAL` additionally carries the UniDic notice and, for core/full data, NEologd/source notices.[^sudachi-license][^sudachi-dict-legal] Small is sufficient for these probes. The proposed boundary is build-time only:

```text
Pinned JMdict + Example Sentence Corpus
        │
        ├─ Sudachi Language Technology (CI/importer only)
        │      produces token, dictionary-form, reading, POS evidence
        │
        └─ deterministic association builder
               ├─ unambiguous analyzer-derived association
               ├─ explicit reviewed app-owned association
               └─ no association when ambiguous
                         ↓
              compact app-owned SQLite association rows
```

Only normalized association evidence ships. Consequently the intended iOS runtime dictionary/library size, RSS, and analysis latency deltas are all **zero**; retrieval reads the derived SQLite rows. Import latency and build-host RSS remain CI concerns. The importer must record analyzer tag/commit, dictionary tag/hash, input corpus/JMdict hashes, configuration, output hash, ambiguity counts, and a deterministic replay hash.

### Vibrato 0.5.2 and upstream MeCab 0.996

Vibrato is an Apache-2.0 Rust Viterbi tokenizer compatible with MeCab dictionaries; its own documentation warns that default output can differ from MeCab and says compressed models must be decompressed outside its API.[^vibrato] Exact `v0.5.2` (`7462fa07…`) compiled for `aarch64-apple-ios`; the `rlib` was 1,824,432 bytes. The latest release has no dictionary assets; the last official IPADIC asset is the 7,704,680-byte `v0.5.0` archive.[^vibrato-models] It was not behavior-qualified separately, so its smaller engine/archive numbers do not justify selection.

MeCab's official latest release is 0.996 from 2013. It supplies C/C++ APIs, requires a separate dictionary, and permits GPL, LGPL, or BSD use.[^mecab] IPADIC behavior is represented by the Lindera comparator, while the old upstream release and additional native-wrapper ownership make MeCab a weaker maintained choice. Not selected.

## App-owned evidence and replacement boundary

Zenbu already pins official JMdict and UniDic sources and retains their licenses. JMdict `ent_seq`, written forms, and readings become app-owned Language Reference Data; the existing UniDic adapter only imports exact pitch facts and is not a sentence analyzer. EDRDG documents `ent_seq` as entry identity and licenses derived dictionary data under CC BY-SA 4.0 with attribution/update obligations while explicitly permitting software around it to remain under another license.[^jmdict][^edrdg-license]

The later association builder should emit, for each pair/entry relation:

- app-owned pair ID and Language Reference ID;
- evidence kind (`selected-form`, `alternate-form`, `reading`, `analyzer-dictionary-form`, or `reviewed-explicit`);
- normalized occurrence range;
- analyzer/dictionary version and deterministic evidence digest for derived rows;
- review record/version for explicit ambiguous associations.

It must not store a provider coordinate as a join or Ranking key. Analyzer replacement rebuilds the complete derived table; runtime fails closed on metadata/hash mismatch. Human-reviewed associations are versioned language facts, not query-specific runtime exceptions. RH09's three ambiguous rows need such evidence (or remain absent); morphology must not invent it.

## SBOM, notices, and acceptance gates

If the selected build-time experiment proceeds:

1. CI SBOM records `sudachi 0.6.11` and its locked Rust dependency graph as `BUILD_DEPENDENCY_OF`, not `DEPENDS_ON` the iOS binary.
2. Source/data inventory records SudachiDict-small `20260723`, the wheel and extracted dictionary hashes, Apache-2.0, and the UniDic notice as build inputs and generated-data provenance.
3. The iOS archive scan must confirm no Sudachi/Lindera/Vibrato/MeCab code, dictionary, provider coordinate, or dynamic library is packaged.
4. A deterministic clean rebuild must reproduce association counts and output SHA-256.
5. The ADR must version direct Search, entry association, length-first Ranking, ambiguity handling, rebuild/failure behavior, and the acknowledged non-parity tie-break before #158-#160 implementation.
6. Replay all D18-D22 rows and the revealed RH regressions. Do not evaluate a replacement blind set until the contract is frozen and independently reviewed.

## Conclusion

RH08 has a general evidence-backed policy fix: Japanese length before match position. RH09 has a viable established build-time analyzer for ordinary inflections, but exact entry association still needs explicit app-owned evidence for ambiguous short forms. RH06 remains unexplained by morphology, membership, length, or available public quality metadata and must stay blocked rather than receive a surface-specific rule.

No provider-independent feature tested reproduces equal-length reference order. The honest product choice is a declared app-owned total order with measured parity differences, not laundering Tatoeba coordinates or source order into Ranking.

[^apple-nl]: [Apple Natural Language framework](https://developer.apple.com/documentation/naturallanguage)
[^apple-schemes]: [Apple `NLTagger`](https://developer.apple.com/documentation/naturallanguage/nltagger)
[^lindera]: [Lindera repository and MIT license](https://github.com/lindera/lindera/tree/v5.1.0)
[^lindera-release]: [Lindera v5.2.0 release](https://github.com/lindera/lindera/releases/tag/v5.2.0)
[^lindera-ipadic-notice]: [Lindera IPADIC notice](https://github.com/lindera/lindera/blob/v5.1.0/lindera-ipadic/NOTICE.txt)
[^lindera-unidic-notice]: [Lindera UniDic notice](https://github.com/lindera/lindera/blob/v5.1.0/lindera-unidic/NOTICE.txt)
[^sudachi]: [Sudachi.rs v0.6.11](https://github.com/WorksApplications/sudachi.rs/tree/v0.6.11)
[^sudachi-dict-release]: [SudachiDict v20260723 release](https://github.com/WorksApplications/SudachiDict/releases/tag/v20260723)
[^sudachi-license]: [Sudachi.rs Apache-2.0 license](https://github.com/WorksApplications/sudachi.rs/blob/v0.6.11/LICENSE)
[^sudachi-dict-legal]: [SudachiDict legal notices](https://github.com/WorksApplications/SudachiDict/blob/v20260723/LEGAL)
[^vibrato]: [Vibrato v0.5.2 source and documentation](https://github.com/daac-tools/vibrato/tree/v0.5.2)
[^vibrato-models]: [Vibrato v0.5.0 dictionary assets](https://github.com/daac-tools/vibrato/releases/tag/v0.5.0)
[^mecab]: [Official MeCab project, release, API, and licensing](https://taku910.github.io/mecab/)
[^tatoeba-downloads]: [Official Tatoeba downloads and field definitions](https://tatoeba.org/en/downloads)
[^jmdict]: [Official JMdict project and format](https://www.edrdg.org/jmdict/j_jmdict.html)
[^edrdg-license]: [EDRDG dictionary license](https://www.edrdg.org/edrdg/licence.html)
