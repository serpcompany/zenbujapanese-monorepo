# Japanese Example Sentence signals and Language Technology

> **Authority status:** The accepted reference rows came from genuine Nihongo
> 1.34.3. Preserve them as historical research, but do not treat their parity
> conclusions as current until #168 completes the 1.34.4 replay. See
> [Nihongo reference authority](../clone-discovery/nihongo/REFERENCE-AUTHORITY.md).

Date: 2026-08-15

Issue: [#165](https://github.com/serpcompany/zenbujapanese-monorepo/issues/165)

Fixed product point: `917cbb7153457a79db117b5d536bbf60a7dfe519`

## Decision summary

The evidence supports one Ranking change and one bounded technology experiment, but it does **not** yet support closing #158 or #160:

1. Japanese grapheme length should precede match position in the next proposed policy. All 89 accepted D18-D22 rows are nondecreasing by Japanese length, and length alone restores RH08's five uniquely sized rows. This requires an ADR and policy-version change before implementation.
2. Keep normalized literal containment as direct Japanese Search eligibility. It admits all 49 visible D18-D20 rows, and established morphology does not distinguish RH06's reference winner from its shorter literal competitors.
3. Evaluate pinned **Sudachi.rs `v0.6.11` (`90fd6068…`) plus SudachiDict-small `20260723` (`4813c1cd…`) only as replaceable build-time Language Technology** for corpus normalization. Do not ship the analyzer or dictionary in the iOS app. Its dictionary forms cover all 20 D21 rows, but only 17/20 RH09 rows.
4. Add no inferred link for the three remaining RH09 short commands. The analyzers classify `始め`/`はじめ` there as nouns, and app-owned JMdict evidence contains separate `始め` (sequence `1342540`) and `始める` (`1307550`) entries. Associating them with the verb without explicit evidence would violate the ambiguity boundary in ADR-0002.
5. Retain app-owned pair ID as the safe deterministic fallback, while documenting that exact equal-length parity is not reproducible safely. Length plus that fallback reproduces only 28/88 mapped D18-D22 positions. Provider coordinates reproduce the observed ties but remain forbidden Ranking inputs.

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

Length is the only fully supported primary signal: all 89 D18-D22 reference rows and RH08/RH09 are nondecreasing by Japanese grapheme count. It does not resolve equal-length groups. Six provider-independent secondary comparisons produced the following results. Exact positions use app-owned pair ID only as an explicit deterministic fallback after the evaluated signal; pair relations classify equal signal values as unresolved ties rather than preserving the input/reference order:

| Secondary comparison after Japanese length | Exact positions with app-ID fallback | Concordant | Discordant | Tied/unresolved |
|---|---:|---:|---:|---:|
| app-owned pair ID | 28/88 | 90/180 | 90/180 | 0/180 |
| Japanese Unicode lexical order | 40/88 | 96/180 | 84/180 | 0/180 |
| English grapheme length | 34/88 | 91/180 | 78/180 | 11/180 |
| English Unicode lexical order | 38/88 | 85/180 | 95/180 | 0/180 |
| app-owned content SHA-256 | 32/88 | 102/180 | 78/180 | 0/180 |
| IPADIC analyzer token count | 27/88 | 46/180 | 58/180 | 76/180 |

By context, length plus app-owned ID gives D18 `10/20`, D19 `6/20`, D20 `9/9`, D21 `1/20`, and D22 `2/19` exact positions. Token count is not a useful ordering signal: it strictly agrees on 46 pairs, disagrees on 58, and leaves 76 tied. Content SHA-256 has the highest strict concordance (`102/180`) but is deliberately arbitrary and supplies no learner-facing Ranking evidence. Punctuation, imperative status, match location, and `jpn_indices` membership also fail as general primary explanations in #158-#160.

Therefore:

- **Safe deterministic product order:** Japanese length, followed by declared Match evidence if a later ADR supports it, then app-owned pair ID.
- **Exact reference-parity order:** unavailable without provider/source order. That order is not adoptable because it is provenance, not a learner-facing Ranking fact.
- **RH06:** remains an eligibility/selection research blocker. The official Tatoeba exports expose potential quality facts—ownership, user skill, tags, original/translation base, and experimental reviews—but none is yet pinned and validated as the missing general signal.[^tatoeba-downloads]

## Language Technology evaluation

| Candidate | Exact evaluated version | Offline iOS feasibility | Runtime size/RSS/latency evidence | Determinism and disposition |
|---|---|---|---|---|
| Apple Natural Language | macOS 26.5.2 / Xcode 26.0 platform framework | system supplied | no bundled bytes; 2,000-tokenization host probe 0.72–1.09 s and 13.68–13.84 MB max RSS | Japanese lemma unavailable; reject. |
| Lindera + IPADIC/UniDic | 5.1.0 / bundled 5.1.0 dictionaries | compiled and linked arm64 iOS smoke | measured below; no signed-device runtime | probe output hash stable 3/3; capable but not selected. |
| Sudachi.rs + small | 0.6.11 / 20260723 | arm64 iOS library compiled; no Swift bridge | measured below; selected boundary ships neither component | probe output hash stable 3/3; select for build-time experiment. |
| Vibrato + IPADIC | 0.5.2 / last asset at 0.5.0 | arm64 iOS library compiled | engine `rlib` and archive size only; no runtime benchmark | behavior not qualified; reject for this decision. |
| MeCab + IPADIC | 0.996 / 2.7.0 | C/C++ API exists; no current iOS build performed | no comparable runtime measurement | old upstream release and wrapper burden; reject. |

Missing runtime measurements in rejected rows are explicit rather than inferred. None of the compile checks is a signed-device claim, and a smaller intermediate archive is not treated as a smaller installed app.

### Apple Natural Language

Apple documents `NLTagger`, language-specific available schemes, tokenization, and optional lemma tags.[^apple-nl][^apple-schemes] On macOS 26.5.2 / Xcode 26.0, `availableTagSchemes(for: .word, language: .japanese)` returned only `Language`, `Script`, and `TokenType`; lemma enumeration returned `nil` for the Japanese probes. It adds no bundled dependency but cannot supply the required dictionary-form contract on the tested platform. Not selected.

### Lindera 5.1.0

Lindera is an MIT-licensed Rust morphological analyzer with separately downloaded dictionaries.[^lindera] The exact evaluated tag is `v5.1.0` (`1bcb0e28…`); upstream published `v5.2.0` on 2026-08-14, establishing current maintenance but not behavioral equivalence.[^lindera-release]

The complete C-ABI research wrapper below compiled and linked for `aarch64-apple-ios`: unstripped static archive 27,150,296 bytes (SHA-256 `b57d0fe4…`), linked smoke executable 7,362,448 bytes (`4486507d…`). Its pinned runtime inventory contains 110 Rust packages and must be regenerated as a release SBOM if ever selected.

| Dictionary | Release bytes | Extracted file sum | Host 2,000-sentence wall time | Host maximum RSS |
|---|---:|---:|---:|---:|
| Lindera IPADIC 5.1.0 | 15,879,934 (`ed10ce59…`) | 57,902,918 | 0.04–0.05 s | 43,663,360–43,728,896 B |
| Lindera UniDic 5.1.0 | 54,469,218 (`321f9c9d…`) | 213,887,364 | 0.05 s | 150,732,800–150,798,336 B |

These are optimized arm64 macOS CLI comparisons, not iOS installed-size or signed-device claims. The complete four-sentence morphology probe produced the same SHA-256 `8a34eccf…` in three fresh processes. IPADIC redistribution must retain the NAIST/ICOT terms; Lindera's UniDic package identifies UniDic 2.1.2 and requires its three-clause notice.[^lindera-ipadic-notice][^lindera-unidic-notice] Behavior is adequate for ordinary inflection but not the ambiguous RH09 commands. Not selected because Sudachi's official Rust implementation, current first-party dictionary release, and normalized-form API make the build-time replacement boundary more direct; this is not a runtime-performance conclusion.

### Sudachi.rs 0.6.11 plus SudachiDict-small 20260723 — selected for build-time evaluation

Sudachi.rs is the official Rust implementation of Sudachi, exposes dictionary form, normalized form, reading, POS, multiple segmentation modes, and requires a separate dictionary.[^sudachi] Exact `v0.6.11` (`90fd6068…`, released 2026-04-13) compiled as an `aarch64-apple-ios` Rust library without source changes; the resulting `rlib` was 4,145,200 bytes. This proves compile feasibility, not a final Swift bridge or signed runtime.

The exact SudachiDict-small release is `v20260723` (`4813c1cd…`, released 2026-07-24). Its official wheel is 41,770,618 bytes with release SHA-256 `c10c7541…`; the extracted `system.dic` measured 122,953,610 bytes (`f872a878…`).[^sudachi-dict-release] A local Python binding comparison processed the same 2,000 sentences in 0.04 s with 38,486,016–38,666,240 bytes maximum RSS. The complete four-sentence morphology output SHA-256 was `82243372…` in three fresh processes. These are host comparisons, not iOS claims.

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

Vibrato is an Apache-2.0 Rust Viterbi tokenizer compatible with MeCab dictionaries; its own documentation warns that default output can differ from MeCab and says compressed models must be decompressed outside its API.[^vibrato] Exact `v0.5.2` (`7462fa07…`) compiled for `aarch64-apple-ios`; this checkout's fresh `rlib` was 1,826,136 bytes. Rust archive metadata can vary with checkout path, so the portable result is successful locked target compilation, not cross-checkout byte identity. The latest release has no dictionary assets; the last official IPADIC asset is the 7,704,680-byte `v0.5.0` archive.[^vibrato-models] It was not behavior-qualified separately, so its smaller engine/archive numbers do not justify selection.

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

No provider-independent feature tested reproduces equal-length reference order. The honest product choice is a declared app-owned deterministic fallback with measured parity differences, not laundering Tatoeba coordinates or source order into Ranking.

## Reproduction appendix

This appendix authenticates the empirical claims and gives a clean-room replay from the fixed product point. Commands were run on arm64 macOS 26.5.2 (`25F84`) with Xcode 26.0 (`17A324`), iPhoneOS 26.0 SDK, Swift 6.2, Rust/Cargo 1.91.1, Python 3.10.0, and system Ruby 2.6.10. No signed device was used. Timing is descriptive: repeat counts, input, raw observations, and maximum RSS are fixed below, but wall time and RSS are expected to vary by host.

### Inputs and artifact identity

| Input/artifact | Bytes | SHA-256 / exact revision |
|---|---:|---|
| D01-D20 observation TSV (selection: D18-D20) | 109,630 | `ffbad9f0a93843507058045f0820dec6f242c6041db224b0ec8e79574c5c7dbc` |
| D21-D22 entry-probe TSV (all rows) | 18,273 | `c4db9dadba2720c9d47b72a72f9a085d23a5104235b63d596007d3a938e0ab9e` |
| pinned Language Reference Data SQLite | 342,433,792 | `248f9308662374c00dc597731ef085ee5ed87d9b703ec356be93ee9be8f03d4f` |
| revealed-holdout public matrix (selection: RH06/RH08/RH09 metadata) | 8,445 | `77b6d0705d2d69125163c91fcf6f0e704e91a4abad5677b89e5bfe204d4ddd68` |
| Tatoeba `jpn_indices` 2026-08-08 archive / CSV | 2,859,638 / 17,427,725 | `375e13617e970ff54b1f1417b48493887ecbef48e6779cbdb8f774224baae84f` / `d8cb7180e157e9983639f5733f6d53066a61cc802ef29501bf940aea2865774f` |
| Restorable D18-D22 `jpn_indices` coverage slice | 5,155 (49 lines) | `a1478617d42960059f3ecb18248b3eba168e1ed65c39d3924cf33ef77be32256` |
| Lindera macOS CLI archive / executable | 2,104,174 / 4,992,192 | `cf60c9f6be16d0b620f70f30ce811670ac4a9b44220151ec47750fdd4c295a27` / `d0d10be332cce379d3872b5c25886a047ba18f94d2609016cc780167d54a151a` |
| Lindera IPADIC / UniDic archives | 15,879,934 / 54,469,218 | `ed10ce59ff1b1315b780a3984cfd10e31b9e658e58a1706328eb343aaa6927c6` / `321f9c9d26ae08138d9ee635592cf4eb19f6833d8ed3a959508d89c5229f860f` |
| Lindera source / replay `Cargo.lock` | — | `1bcb0e28fcd90f34b2bcf12f55a25008d791f62c` / `a15aa9fea7bdfb278b0081b7b20a54a654a591344db1facf003cf50529e1463a` |
| Lindera iOS static library / Swift-linked smoke | 27,150,296 / 7,362,448 | `b57d0fe4ca28cdb64ec14a3200439c7310c65240128ddb2c286388e41c8062e4` / `4486507d34fc0d023ee4dee731c1b32851670a93ea4eaa4ba5a7c3085c39cc06` |
| Sudachi.rs source / `Cargo.lock` / iOS `rlib` | 4,145,200 (`rlib`) | `90fd6068c80c2fc3b63e0dbab0e341475bad4d8f` / `f847ceb0e9a6c91f97825b04267f21b6f3294f1ebe92a57a99bb1aebb48331ee` / `b3d8fcc2afbfabd55d116361105cf3ce68accc40efced9ae20cbdb37b5e43dd1` |
| SudachiPy cp310 macOS arm64 analyzer wheel | 1,462,309 | `ec915f0784d4ee1bf2ea58e50ee7193a4336b6cf9ee1103782771684a3967081` |
| SudachiDict-small wheel / extracted `system.dic` | 41,770,618 / 122,953,610 | `c10c7541795c4cf501ddd15f456409d0b75b84339c5961dd045fa922378b687a` / `f872a878c3c5e8a0df4ae8c548e1d7a754f58cdb37eb660ba22f6514457ad8cc` |
| Vibrato source / `Cargo.lock` / iOS `rlib` | 1,826,136 (`rlib`) | `7462fa07a60a176e8d9ef3cb287c7973290a0f9d` / `811a1afa0592ddfae1dc8a858afe78cf5bc873e792c7654fc79675e2eecc4778` / `6022c894e922a1cffbf23c176133b1000f5567869e35356e8f8e5afb4dabf508` |

RH09's full top-20 transcription remains private. Its public matrix, issue #160 evidence hashes, and canonical aggregate line `RH09<TAB>literal=1/20<TAB>dictionary_form=17/20<TAB>misses=3<LF>` (49 bytes, SHA-256 `d374f350984f9f99cf8da9790bbd7bdbc97fcc00cec4d3ebac574a2088fc3470`) authenticate the retained run but deliberately do not republish private screenshot content. Thus D18-D22 are independently replayable from Git; RH09 is independently replayable only by the evidence custodian. No replacement holdout was opened.

The canonical Tatoeba locator is `https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2`. It is a rolling export, so acquisition fails closed unless it returns the pinned archive last modified `2026-08-08T06:26:21Z`, identified above by both archive and extracted-member hashes. To keep the public 49/89 coverage replay restorable after that rolling URL advances, the exact 49 matching source lines are also preserved below as a deterministic gzip (`gzip -n`) payload. This slice contains only public Tatoeba export rows selected by the public D18-D22 provider-coordinate pairs; it contains no RH09 rows.

<details><summary>gzip-compressed D18-D22 `jpn_indices` coverage slice</summary>

```text
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
```

</details>

### Acquisition and compile replay

Run from a clean checkout. `--locked` fixes each Rust dependency graph; the target and release profile are the compiler configuration used.

```bash
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
test "$(git -C "$repo" rev-parse HEAD)" = 917cbb7153457a79db117b5d536bbf60a7dfe519
scratch=$(mktemp -d)

curl -fL -o "$scratch/lindera-cli.zip" https://github.com/lindera/lindera/releases/download/v5.1.0/lindera-aarch64-apple-darwin-v5.1.0.zip
curl -fL -o "$scratch/ipadic.zip" https://github.com/lindera/lindera/releases/download/v5.1.0/lindera-ipadic-5.1.0.zip
curl -fL -o "$scratch/unidic.zip" https://github.com/lindera/lindera/releases/download/v5.1.0/lindera-unidic-5.1.0.zip
curl -fL -o "$scratch/jpn_indices.tar.bz2" https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2
curl -fL -o "$scratch/sudachipy-0.6.11-cp310-cp310-macosx_11_0_arm64.whl" https://files.pythonhosted.org/packages/e5/7a/54b541e6c0a30e3dbca68fac6c2eaf4aa55a970b363f494db0dbed3e5ac6/sudachipy-0.6.11-cp310-cp310-macosx_11_0_arm64.whl
curl -fL -o "$scratch/sudachidict_small-20260723-py3-none-any.whl" https://github.com/WorksApplications/SudachiDict/releases/download/v20260723/sudachidict_small-20260723-py3-none-any.whl
(
  cd "$scratch"
  shasum -a 256 -c - <<'SHA256'
cf60c9f6be16d0b620f70f30ce811670ac4a9b44220151ec47750fdd4c295a27  lindera-cli.zip
ed10ce59ff1b1315b780a3984cfd10e31b9e658e58a1706328eb343aaa6927c6  ipadic.zip
321f9c9d26ae08138d9ee635592cf4eb19f6833d8ed3a959508d89c5229f860f  unidic.zip
375e13617e970ff54b1f1417b48493887ecbef48e6779cbdb8f774224baae84f  jpn_indices.tar.bz2
ec915f0784d4ee1bf2ea58e50ee7193a4336b6cf9ee1103782771684a3967081  sudachipy-0.6.11-cp310-cp310-macosx_11_0_arm64.whl
c10c7541795c4cf501ddd15f456409d0b75b84339c5961dd045fa922378b687a  sudachidict_small-20260723-py3-none-any.whl
SHA256
)
unzip -q "$scratch/lindera-cli.zip" -d "$scratch/lindera-cli"
unzip -q "$scratch/ipadic.zip" -d "$scratch/ipadic"
unzip -q "$scratch/unidic.zip" -d "$scratch/unidic"
tar -xjf "$scratch/jpn_indices.tar.bz2" -C "$scratch"
test "$(shasum -a 256 "$scratch/jpn_indices.csv" | cut -d' ' -f1)" = d8cb7180e157e9983639f5733f6d53066a61cc802ef29501bf940aea2865774f

git clone --filter=blob:none https://github.com/lindera/lindera.git "$scratch/lindera-src"
git -C "$scratch/lindera-src" checkout 1bcb0e28fcd90f34b2bcf12f55a25008d791f62c
git clone --filter=blob:none https://github.com/WorksApplications/sudachi.rs.git "$scratch/sudachi-rs"
git -C "$scratch/sudachi-rs" checkout 90fd6068c80c2fc3b63e0dbab0e341475bad4d8f
cargo build --manifest-path "$scratch/sudachi-rs/Cargo.toml" --locked --release --target aarch64-apple-ios -p sudachi
git clone --filter=blob:none https://github.com/daac-tools/vibrato.git "$scratch/vibrato"
git -C "$scratch/vibrato" checkout 7462fa07a60a176e8d9ef3cb287c7973290a0f9d

python3 -m venv "$scratch/venv"
"$scratch/venv/bin/pip" install \
  --no-index \
  "$scratch/sudachipy-0.6.11-cp310-cp310-macosx_11_0_arm64.whl" \
  "$scratch/sudachidict_small-20260723-py3-none-any.whl"
sudachi_system_dictionary=$("$scratch/venv/bin/python" - <<'PY'
from importlib.resources import files
print(files("sudachidict_small").joinpath("resources/system.dic"))
PY
)
test "$(shasum -a 256 "$sudachi_system_dictionary" | cut -d' ' -f1)" = f872a878c3c5e8a0df4ae8c548e1d7a754f58cdb37eb660ba22f6514457ad8cc
```

The Lindera iOS probe was a `staticlib` crate depending on exact-checkout `lindera-analysis` with `default-features = false`. Save the following blocks as `lindera-ios/Cargo.toml` and `lindera-ios/src/lib.rs` beside `lindera-src`; this is its complete public-safe source:

```toml
[package]
name = "issue147-lindera-ios"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
crate-type = ["staticlib"]

[dependencies]
lindera-analysis = { path = "../lindera-src/lindera-analysis", default-features = false }
```

```rust
use lindera_analysis::tokenizer::TokenizerBuilder;
use std::ffi::{c_char, CStr};

#[no_mangle]
pub unsafe extern "C" fn issue147_lindera_token_count(
    dictionary_path: *const c_char,
    input: *const c_char,
) -> i32 {
    if dictionary_path.is_null() || input.is_null() {
        return -1;
    }
    let Ok(dictionary_path) = CStr::from_ptr(dictionary_path).to_str() else {
        return -2;
    };
    let Ok(input) = CStr::from_ptr(input).to_str() else {
        return -3;
    };
    let Ok(mut builder) = TokenizerBuilder::new() else {
        return -4;
    };
    builder.set_segmenter_dictionary(dictionary_path);
    let Ok(tokenizer) = builder.build() else {
        return -5;
    };
    match tokenizer.tokenize(input) {
        Ok(tokens) => i32::try_from(tokens.len()).unwrap_or(-6),
        Err(_) => -7,
    }
}
```

Save this complete header as `lindera-ios/bridge.h`:

```c
#include <stdint.h>

int32_t issue147_lindera_token_count(
    const char *dictionary_path,
    const char *input
);
```

Save this complete smoke source as `lindera-ios/smoke.swift`:

```swift
let result = "/definitely/missing/dictionary".withCString { dictionaryPath in
    "テスト".withCString { input in
        issue147_lindera_token_count(dictionaryPath, input)
    }
}
precondition(result == -5)
```

The custom probe's exact dependency graph is included here because a lockfile hash alone cannot reconstruct a registry resolution later. Decode it after saving the manifest and Rust source:

<details><summary>gzip-compressed `Cargo.lock` replay payload</summary>

```text
H4sIAAAAAAACA71cXW9cOY59z68IMo/bTkuiPhdYYIF92vd9GzQCiiKT6tiudFU5M55fv0dlO7Hrw066r2cwM7aryo5IkYfnUNT9
29v/+7TavrXVpb7FV77Zra94txK+vLx9+98f9Vo3vNPxtt++/R/efFy/f/O3t/+7mx+9XuPL9U6vB9629ebtFV/f8OVbHavd6vrj
+zdfdbNdra/f/tfb+ObN3//+heUzf9TffntzzVeKV9/xp/WFrDe8Xcnnd48+/s6/9+/juzfb9c1G9p/c6MfVdre5/Y9Pu92X7X/+
+uvH1e7TTX8v66tfNzfb3cUlX3/8VeZSt+9X64sVFvXPd2/kk8rn7c3V/BNjDPLsycVQJJTk67CQc4vEiVzV0cKIPYQskqlZ4mre
uVB99iWS8+/eDP0yjb2WlW7xF//+5u27K72ST5t3v7z57YyF17ef1v84sM29925p64gcJx2uGKeosbggbWSJWLuVCJNNnFrW4GPv
I5fCmvAbrrUWMz7+7vT6+2pnl/xxe2ABvQ8Lr7+rUR0x+UwSzI+hrkUuwwaRiKWWpIXmklSrFm0Its9l695RKb7yufXfXH3hy/WT
5WPxbvH1pxFcqa1mrK4734MFYRXEkUR1wVOPXkkTNgZe96mM3BoredERTPq59d/udP/PPLHAva+LG+CEmYgDwmQIu+jb8ImlBBpm
jsy3lK20Uim0DlN6ssHMSJtBwrWfTI9vy/8wdLP6qkiUt+++7DYfrnTH+x82fA0E2H+7XV2Nm53V89l09Ode2ym1UU1aQ0/D1+BH
CL6p664lNbhKvIWYpVtrrjqjrjGz55rEDQKctJNO+bJZy8UVy2Yd9nb/cbPe3Xlme3v9Nkx48OV5J6w3cMBBTqb3bmHrvQ1nIdXo
Y7ZsQS1WV5NLrtbMYpRgsVkhl7QPz5pbck4Br7lYjs/F9CGgePx36dVribUQ9SJdSqvqI8WOdacQzWHrLHCPCGoNyEfnNcdWBMYW
jiZEZ1Yv9vFiZUeIvjSeNwC6VcCIeTKKKboeowKrgZPJe0RjKqF0YCZRqHgV0ONjyD754OusVqdXv1lvt1356mLoHzfHCVSWhkVf
vbqhpWev3RHjR4oAvzEqwKSztsEJ8VVc6cm7UjSM4mcNEyd6GlW+G6Ff1vJpnzrfX7vZrS6359Pn8JefeqChNizsggCk9xGAilSK
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
KIT/D34D0OuwYwAA
```

</details>

```bash
cd "$scratch"
base64 -D < cargo-lock.txt | gunzip > lindera-ios/Cargo.lock
test "$(shasum -a 256 lindera-ios/Cargo.lock | cut -d' ' -f1)" = a15aa9fea7bdfb278b0081b7b20a54a654a591344db1facf003cf50529e1463a
cargo build --manifest-path lindera-ios/Cargo.toml --locked --release --target aarch64-apple-ios
xcrun --sdk iphoneos swiftc \
  -target arm64-apple-ios26.0 \
  -import-objc-header lindera-ios/bridge.h \
  lindera-ios/smoke.swift \
  lindera-ios/target/aarch64-apple-ios/release/libissue147_lindera_ios.a \
  -o lindera-swift-smoke
file lindera-ios/target/aarch64-apple-ios/release/libissue147_lindera_ios.a lindera-swift-smoke
otool -L lindera-swift-smoke
```

The payload block must be saved without its Markdown fence as `cargo-lock.txt`. Exact source SHA-256 values are `7cc7a4218a0bbee108484915e4804380ee023b50647e37436d4754aac2dc5aed` (manifest), `2f56c282e8f832dda54aff98e0d012fb67f3cebb616c1eb27136245fbc9003aa` (Rust), `275ce1071f4ba3a3b099043afe6ad5ce440d1eb54bac0e3cb729e735d2724bd7` (header), and `d9355b26a29654e7c79a58bf29aac165c679e3dc5e09e84050004b18315e857f` (Swift). The rerun produced the archive and linked-smoke sizes/hashes in the identity table. Mach-O UUID/path metadata can change the linked-file digest on another checkout; successful arm64 linkage and `otool -L` showing only `libSystem` and `libswiftCore` are the portable checks.

Vibrato `v0.5.2` does not commit a workspace lockfile. The exact Cargo 1.91.1-generated lock used by this report is therefore preserved as a second deterministic gzip payload:

<details><summary>gzip-compressed Vibrato `Cargo.lock` replay payload</summary>

```text
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
```

</details>

Save that payload as `vibrato-cargo-lock.txt`, restore it before the Vibrato build, and fail closed on its exact 29,951-byte lockfile:

```bash
base64 -D < vibrato-cargo-lock.txt | gunzip > "$scratch/vibrato/Cargo.lock"
test "$(stat -f '%z' "$scratch/vibrato/Cargo.lock")" = 29951
test "$(shasum -a 256 "$scratch/vibrato/Cargo.lock" | cut -d' ' -f1)" = 811a1afa0592ddfae1dc8a858afe78cf5bc873e792c7654fc79675e2eecc4778
cargo build --manifest-path "$scratch/vibrato/Cargo.toml" --locked --release --target aarch64-apple-ios -p vibrato
```

### Analyzer and Ranking replay

The following public fixture probe produces the five Direct/entry rows below. Save it as `analyzer_probe.py` and run `venv/bin/python analyzer_probe.py "$repo"`.

```python
import csv
import sys
from pathlib import Path

from sudachipy import dictionary

repository_root = Path(sys.argv[1])
tokenizer = dictionary.Dictionary(dict="small").create()

def read_tsv(relative_path):
    with (repository_root / relative_path).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))

observation_rows = read_tsv("docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv")
for context_id, search_query in (("D18", "食べる"), ("D19", "食べた"), ("D20", "ねこ")):
    context_rows = [row for row in observation_rows if row["context_id"] == context_id]
    literal_count = sum(search_query in row["japanese"] for row in context_rows)
    print(f"{context_id}\tliteral={literal_count}/{len(context_rows)}")

entry_probe_rows = read_tsv("docs/research/fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv")
for context_id in ("D21", "D22"):
    context_rows = [row for row in entry_probe_rows if row["probe_id"] == context_id]
    entry_headword = context_rows[0]["entry_headword"]
    entry_reading = context_rows[0]["entry_reading"]
    katakana_reading = "".join(chr(ord(character) + 0x60) if "ぁ" <= character <= "ゖ" else character for character in entry_reading)
    literal_count = sum(any(form in row["japanese"] for form in (entry_headword, entry_reading, katakana_reading)) for row in context_rows)
    if context_id == "D21":
        evidence_label = "dictionary_form"
        evidence_count = sum(any(morpheme.dictionary_form() == entry_headword for morpheme in tokenizer.tokenize(row["japanese"])) for row in context_rows)
    else:
        evidence_label = "exact_token_reading"
        evidence_count = sum(any(morpheme.reading_form() == "ネコ" for morpheme in tokenizer.tokenize(row["japanese"])) for row in context_rows)
    print(f"{context_id}\tliteral_or_reading={literal_count}/{len(context_rows)}\t{evidence_label}={evidence_count}/{len(context_rows)}")
```

Normalized output is `D18 20/20`, `D19 20/20`, `D20 9/9`, `D21 literal 6/20 and dictionary form 20/20`, `D22 literal/reading 20/20 and exact token reading 19/20`; analyzer source SHA-256 is `637dd9cbf16a8a680642a256192ff8ed75c460564451361f66b1c774a89a083a` and canonical TSV SHA-256 is `7e7cbe3b6ff7ae646e2c1fea335f44ab5870a6bff820a56f70de7ff188df5e79`.

Save the earlier `jpn_indices` payload as `jpn-indices-slice.txt`, then restore and authenticate the exact public slice:

```bash
base64 -D < jpn-indices-slice.txt | gunzip > "$scratch/jpn_indices-d18-d22-slice.tsv"
test "$(stat -f '%z' "$scratch/jpn_indices-d18-d22-slice.tsv")" = 5155
test "$(shasum -a 256 "$scratch/jpn_indices-d18-d22-slice.tsv" | cut -d' ' -f1)" = a1478617d42960059f3ecb18248b3eba168e1ed65c39d3924cf33ef77be32256
```

Save this complete public coverage audit as `jpn_indices_coverage.py`:

```python
import csv
import sys
from pathlib import Path

repository_root = Path(sys.argv[1])
indices_path = Path(sys.argv[2])
generated_slice_path = Path(sys.argv[3]) if len(sys.argv) == 4 else None

def read_fixture(relative_path, context_field, context_ids):
    with (repository_root / relative_path).open(newline="", encoding="utf-8") as fixture_file:
        return [row for row in csv.DictReader(fixture_file, delimiter="\t") if row[context_field] in context_ids]

contexts = {
    "D18": read_fixture("docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv", "context_id", {"D18"}),
    "D19": read_fixture("docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv", "context_id", {"D19"}),
    "D20": read_fixture("docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv", "context_id", {"D20"}),
    "D21": read_fixture("docs/research/fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv", "probe_id", {"D21"}),
    "D22": read_fixture("docs/research/fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv", "probe_id", {"D22"}),
}
fixture_pairs = {
    (row["japanese_id"], row["english_id"])
    for context_rows in contexts.values()
    for row in context_rows
    if row["japanese_id"] and row["english_id"]
}

source_lines = indices_path.read_bytes().splitlines(keepends=True)
source_pairs = set()
matching_lines = []
for source_line in source_lines:
    fields = source_line.decode("utf-8").rstrip("\n").split("\t", 2)
    source_pair = (fields[0], fields[1])
    source_pairs.add(source_pair)
    if source_pair in fixture_pairs:
        matching_lines.append(source_line)

if generated_slice_path is not None:
    generated_slice_path.write_bytes(b"".join(matching_lines))

covered_total = 0
row_total = 0
for context_id, context_rows in contexts.items():
    covered_count = sum((row["japanese_id"], row["english_id"]) in source_pairs for row in context_rows)
    covered_total += covered_count
    row_total += len(context_rows)
    print(f"{context_id}\tcovered={covered_count}/{len(context_rows)}")
print(f"ALL\tcovered={covered_total}/{row_total}")
```

Run the audit once against the authenticated full snapshot to regenerate the slice, and once against the embedded slice. Both outputs must be identical:

```bash
python3 jpn_indices_coverage.py "$repo" "$scratch/jpn_indices.csv" "$scratch/generated-jpn-indices-slice.tsv" > full-coverage.tsv
test "$(shasum -a 256 "$scratch/generated-jpn-indices-slice.tsv" | cut -d' ' -f1)" = a1478617d42960059f3ecb18248b3eba168e1ed65c39d3924cf33ef77be32256
python3 jpn_indices_coverage.py "$repo" "$scratch/jpn_indices-d18-d22-slice.tsv" > slice-coverage.tsv
cmp full-coverage.tsv slice-coverage.tsv
test "$(shasum -a 256 full-coverage.tsv | cut -d' ' -f1)" = 01808d86ef6848066fab3c32fb112a1deb2aa101f456115876c41dd25856fbfe
```

The six output rows are D18 `19/20`, D19 `18/20`, D20 `7/9`, D21 `0/20`, D22 `5/20`, and aggregate `49/89`. Coverage-audit source SHA-256 is `eb94d127c9473759b1fdd387c86ce121244658ecfd7d8d0c95e6ee86adfff731`; complete output SHA-256 is `01808d86ef6848066fab3c32fb112a1deb2aa101f456115876c41dd25856fbfe`. RH09's `10/20` remains custodian-only evidence and is intentionally excluded from this public replay.

The Ranking replay selects exactly D18-D20 and D21-D22, resolves app-owned pair IDs from the pinned SQLite database, and sorts by Ruby grapheme count, the declared secondary comparison, then app-owned pair ID. It asserts that reversing the input cannot change the ordered IDs, rejects duplicate output IDs, and reports concordant, discordant, and tied relations separately inside equal-length groups. The executable source is preserved inline to avoid an extra repository artifact:

<details><summary>Ruby Ranking probe</summary>

```ruby
require "csv"
require "digest"
require "json"
require "open3"
require "sqlite3"

repository_root, lindera_cli, ipadic_directory = ARGV
database = SQLite3::Database.new(repository_root + "/apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3")
pair_ids_by_provider_coordinate = {}
database.execute("select p.source_japanese_record_id,p.source_english_record_id,'esp1_'||lower(hex(e.id)) from example_sentences e join example_sentence_provenance p on p.pair_id=e.id") do |japanese_id, english_id, app_pair_id|
  pair_ids_by_provider_coordinate[[japanese_id, english_id]] = app_pair_id
end
rows_by_context = Hash.new { |contexts, context_id| contexts[context_id] = [] }
CSV.foreach(repository_root + "/docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv", headers: true, col_sep: "\t") do |row|
  rows_by_context[row["context_id"]] << row if %w[D18 D19 D20].include?(row["context_id"])
end
CSV.foreach(repository_root + "/docs/research/fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv", headers: true, col_sep: "\t") do |row|
  rows_by_context[row["probe_id"]] << row if %w[D21 D22].include?(row["probe_id"])
end

def relation_counts(reference_rows, &signal)
  counts = { concordant: 0, discordant: 0, tied: 0 }
  reference_rows.combination(2) do |left, right|
    comparison = signal.call(left) <=> signal.call(right)
    counts[:concordant] += 1 if comparison == -1
    counts[:discordant] += 1 if comparison == 1
    counts[:tied] += 1 if comparison == 0
  end
  counts
end

signals = {
  app_id: ->(row) { row[:app_pair_id] },
  japanese_lexical: ->(row) { row[:japanese] },
  english_length: ->(row) { row[:english].each_grapheme_cluster.count },
  english_lexical: ->(row) { row[:english] },
  content_sha256: ->(row) { Digest::SHA256.hexdigest(row[:japanese] + "\0" + row[:english]) }
}
aggregates = Hash.new { |all, name| all[name] = { exact: 0, rows: 0, concordant: 0, discordant: 0, tied: 0 } }
rows_by_context.each do |context_id, raw_rows|
  reference_rows = raw_rows.sort_by { |row| row["rank"].to_i }.map do |row|
    analyzer_json, = Open3.capture2(lindera_cli, "tokenize", "--dict", ipadic_directory, "--output", "json", stdin_data: row["japanese"] + "\n")
    {
      japanese: row["japanese"],
      english: row["english"],
      japanese_length: row["japanese"].each_grapheme_cluster.count,
      app_pair_id: pair_ids_by_provider_coordinate[[row["japanese_id"].to_i, row["english_id"].to_i]],
      token_count: JSON.parse(analyzer_json).count { |token| token["part_of_speech"] != "記号" }
    }
  end.select { |row| row[:app_pair_id] }

  signals.merge(token_count: ->(row) { row[:token_count] }).each do |signal_name, signal|
    order_key = ->(row) { [row[:japanese_length], signal.call(row), row[:app_pair_id]] }
    predicted_rows = reference_rows.sort_by(&order_key)
    reverse_input_rows = reference_rows.reverse.sort_by(&order_key)
    predicted_ids = predicted_rows.map { |row| row[:app_pair_id] }
    raise "input-order-dependent result" unless predicted_ids == reverse_input_rows.map { |row| row[:app_pair_id] }
    raise "duplicate predicted pair" unless predicted_ids.uniq.length == predicted_ids.length

    exact_positions = reference_rows.zip(predicted_rows).count { |reference, predicted| reference[:app_pair_id] == predicted[:app_pair_id] }
    context_relations = { concordant: 0, discordant: 0, tied: 0 }
    reference_rows.group_by { |row| row[:japanese_length] }.each_value do |equal_length_rows|
      group_relations = relation_counts(equal_length_rows, &signal)
      context_relations.each_key { |relation| context_relations[relation] += group_relations[relation] }
    end
    relation_total = context_relations.values.sum
    puts [context_id, signal_name, "exact=#{exact_positions}/#{reference_rows.length}", "concordant=#{context_relations[:concordant]}/#{relation_total}", "discordant=#{context_relations[:discordant]}/#{relation_total}", "tied=#{context_relations[:tied]}/#{relation_total}"].join("\t")

    aggregate = aggregates[signal_name]
    aggregate[:exact] += exact_positions
    aggregate[:rows] += reference_rows.length
    context_relations.each_key { |relation| aggregate[relation] += context_relations[relation] }
  end
end
puts "AGG"
aggregates.each do |signal_name, aggregate|
  relation_total = aggregate[:concordant] + aggregate[:discordant] + aggregate[:tied]
  raise "unexpected within-length pair total" unless relation_total == 180
  puts [signal_name, "exact=#{aggregate[:exact]}/#{aggregate[:rows]}", "concordant=#{aggregate[:concordant]}/#{relation_total}", "discordant=#{aggregate[:discordant]}/#{relation_total}", "tied=#{aggregate[:tied]}/#{relation_total}"].join("\t")
end
```

</details>

Run `ruby rank_probe.rb "$repo" "$scratch/lindera-cli/lindera" "$scratch/ipadic/lindera-ipadic" > ranking.tsv`. Source SHA-256 is `a77f860b935596b615caaf48f033f08ff8dc82a89501479a840f8bed262ec691`; the complete 37-line output SHA-256 is `761c5d3027d677602c7acac4f46e821a4e25a480ac4354da0a3d8b62f70a80e2`. Its six aggregate rows are the Ranking table above. Reversing every context's input before sorting produces identical app-owned ID sequences; every aggregate relation partition sums to exactly `180`.

### Public RH09 ambiguity replay

The only RH09 sentence text published here is the three already disclosed misses: exact LF-terminated input `始め！`, `よし始め。`, `演技はじめ！` (45 bytes, SHA-256 `8e34189ad39a78039066d4fbaf289262ec4d63fd6218c5104576574310e71d67`). Run the IPADIC replay independently:

```bash
for run in 1 2 3; do
  printf '始め！\nよし始め。\n演技はじめ！\n' |
    "$scratch/lindera-cli/lindera" tokenize \
      --dict "$scratch/ipadic/lindera-ipadic" --output json |
    shasum -a 256
done
```

Then run the separate UniDic replay:

```bash
for run in 1 2 3; do
  printf '始め！\nよし始め。\n演技はじめ！\n' |
    "$scratch/lindera-cli/lindera" tokenize \
      --dict "$scratch/unidic/lindera-unidic" --output json |
    shasum -a 256
done
```

All three fresh IPADIC processes produced SHA-256 `8fb3103b3eb2bfd41457d37c980977049c00356585db5443513780c92fa60971`; all three UniDic processes produced `37cdeccf1a7445bcec846f54e89f50fa681b0923d0db77c36f59430ea187c622`. In every sentence, IPADIC reports the relevant `始め`/`はじめ` token as `名詞` with base form `始め`/`はじめ`; UniDic reports `名詞`, `普通名詞`, `副詞可能`, with lexeme `始め`. This replay proves only analyzer classification of the three public misses; the private RH09 top-20 aggregate remains custodian-only.

### Raw timing and determinism evidence

The timed inputs are exactly 1,000 repetitions each of `彼は少し飲んだ。` and `始めました。` (2,000 sentences). Each executable was wrapped in `/usr/bin/time -lp`, run three times, and had stdout discarded. The rerun used these exact commands for Lindera IPADIC, then the same command with `unidic/lindera-unidic`:

```bash
for run in 1 2 3; do
  ruby -e '1000.times { puts "彼は少し飲んだ。"; puts "始めました。" }' |
    /usr/bin/time -lp "$scratch/lindera-cli/lindera" tokenize \
      --dict "$scratch/ipadic/lindera-ipadic" --output wakati >/dev/null
done
```

Save this complete source as `sudachi_perf.py` and run it three times with `/usr/bin/time -lp "$scratch/venv/bin/python" sudachi_perf.py >/dev/null`:

```python
from sudachipy import dictionary

tokenizer = dictionary.Dictionary(dict="small").create()
sentences = ("彼は少し飲んだ。", "始めました。") * 1000
for sentence in sentences:
    tokenizer.tokenize(sentence)
```

Save this complete source as `nl_perf.swift`, compile with `xcrun swiftc -O nl_perf.swift -o nl_perf`, and run `nl_perf` three times through `/usr/bin/time -lp`:

```swift
import NaturalLanguage

let sentences = Array(repeating: ["彼は少し飲んだ。", "始めました。"], count: 1000).flatMap { $0 }
for sentence in sentences {
    let tagger = NLTagger(tagSchemes: [.lemma])
    tagger.string = sentence
    tagger.enumerateTags(
        in: sentence.startIndex..<sentence.endIndex,
        unit: .word,
        scheme: .lemma,
        options: [.omitWhitespace, .omitPunctuation]
    ) { _, _ in true }
}
```

Raw verification observations, in run order:

| Probe | Wall seconds | Maximum RSS bytes |
|---|---|---|
| Lindera IPADIC | `0.04, 0.05, 0.05` | `43728896, 43663360, 43728896` |
| Lindera UniDic | `0.05, 0.05, 0.05` | `150798336, 150781952, 150732800` |
| SudachiDict-small | `0.04, 0.04, 0.04` | `38666240, 38486016, 38551552` |
| Apple Natural Language | `1.09, 0.73, 0.72` | `13680640, 13844480, 13680640` |

Save the exact observed rows below as `timing_tsv.py`, then run `python3 timing_tsv.py > timing.tsv` and `test "$(shasum -a 256 timing.tsv | cut -d' ' -f1)" = 85f0ccbfb30cfb1195966bd796234c00dee4c483c21f2a72d3fbdb3fe0034290`:

```python
rows = (
    ("lindera-ipadic", 1, "0.04", 43728896),
    ("lindera-ipadic", 2, "0.05", 43663360),
    ("lindera-ipadic", 3, "0.05", 43728896),
    ("lindera-unidic", 1, "0.05", 150798336),
    ("lindera-unidic", 2, "0.05", 150781952),
    ("lindera-unidic", 3, "0.05", 150732800),
    ("sudachi-small", 1, "0.04", 38666240),
    ("sudachi-small", 2, "0.04", 38486016),
    ("sudachi-small", 3, "0.04", 38551552),
    ("apple-natural-language", 1, "1.09", 13680640),
    ("apple-natural-language", 2, "0.73", 13844480),
    ("apple-natural-language", 3, "0.72", 13680640),
)

print("probe\trun\twall_seconds\tmax_rss_bytes")
for row in rows:
    print("\t".join(map(str, row)))
```

This produces the complete 433-byte, 13-line canonical TSV, with a tab-separated header and LF line endings, SHA-256 `85f0ccbfb30cfb1195966bd796234c00dee4c483c21f2a72d3fbdb3fe0034290`; `timing_tsv.py` has SHA-256 `205bb971964acc4429e83887bde3a31de05d6f9035adec8654150334f7572b00`. Source SHA-256 values are `c0b7ea675ceebdcad5c4bfef2ac1313f5b96425a97514f42c633ed9da341fd20` for `sudachi_perf.py` and `e1be27416d0ce1a1a85c0e64980dd6a715e6913b4535b6c981a4e4adde0c00be` for `nl_perf.swift`. The first-process timing includes cold process and page-cache effects; timing remains descriptive host evidence.

The determinism input is the following exact LF-terminated four-line sequence (SHA-256 `f7e13631e4b2b52271a89dd9138f16540c7dca0b1cf3bdf2556bbb0c578eab99`): `彼は少し飲んだ。`, `始めました。`, `始め！`, `演技はじめ！`. Lindera was replayed three times with:

```bash
for run in 1 2 3; do
  printf '彼は少し飲んだ。\n始めました。\n始め！\n演技はじめ！\n' |
    "$scratch/lindera-cli/lindera" tokenize \
      --dict "$scratch/ipadic/lindera-ipadic" --output json |
    shasum -a 256
done
```

Save this complete Sudachi source as `sudachi_determinism.py` and run `for run in 1 2 3; do "$scratch/venv/bin/python" sudachi_determinism.py | shasum -a 256; done`:

```python
from sudachipy import dictionary

tokenizer = dictionary.Dictionary(dict="small").create()
sentences = ("彼は少し飲んだ。", "始めました。", "始め！", "演技はじめ！")
for sentence in sentences:
    print(f"SENTENCE\t{sentence}")
    for morpheme in tokenizer.tokenize(sentence):
        print("\t".join((morpheme.surface(), morpheme.dictionary_form(), morpheme.reading_form(), ",".join(morpheme.part_of_speech()))))
```

Save this complete Apple source as `nl_determinism.swift` and run `for run in 1 2 3; do xcrun swift nl_determinism.swift | shasum -a 256; done`:

```swift
import NaturalLanguage

let sentences = ["彼は少し飲んだ。", "始めました。", "始め！", "演技はじめ！"]
let schemes = NLTagger.availableTagSchemes(for: .word, language: .japanese)
    .map(\.rawValue)
    .sorted()
print("SCHEMES\t\(schemes.joined(separator: ","))")
for sentence in sentences {
    print("SENTENCE\t\(sentence)")
    let tagger = NLTagger(tagSchemes: [.lemma])
    tagger.string = sentence
    tagger.enumerateTags(
        in: sentence.startIndex..<sentence.endIndex,
        unit: .word,
        scheme: .lemma,
        options: [.omitWhitespace, .omitPunctuation]
    ) { tag, range in
        print("\(sentence[range])\t\(tag?.rawValue ?? "nil")")
        return true
    }
}
```

Fresh processes produced identical normalized output 3/3: Lindera `8a34eccf7caf00b48295e517fed6d0d82b9df8cdbd4e68e3a26d2b9b0e1e04db`, Sudachi `8224337282f972ee464e3918a6e9465fc1988e1049d29e2357075c88f43a87c5`, and Apple `2119ba767cf3b600d7550873bc64357fac7bfd74434fc51382917eec90dcfa56`. Complete source hashes are `22bd4c4c15b849f045a544cc2e9c2e315500e12be8ef4a0f2a5ae3b4da2ace3c` for Sudachi and `f6c305d323c48d624586d3792361cc8ac96c659e5d48017be1f0cbe76f47e9ad` for Apple. The Apple output confirms only `Language`, `Script`, `TokenType` and `nil` Japanese lemmas.

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
