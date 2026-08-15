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

## Reproduction appendix

This appendix authenticates the empirical claims and gives a clean-room replay from the fixed product point. Commands were run on arm64 macOS 26.5.2 (`25F84`) with Xcode 26.0 (`17A324`), iPhoneOS 26.0 SDK, Swift 6.2, Rust/Cargo 1.91.1, Python 3.10.0, and system Ruby 2.6.10. No signed device was used. Timing is descriptive: repeat counts, input, raw observations, and maximum RSS are fixed below, but wall time and RSS are expected to vary by host.

### Inputs and artifact identity

| Input/artifact | Bytes | SHA-256 / exact revision |
|---|---:|---|
| D01-D20 observation TSV (selection: D18-D20) | 109,630 | `ffbad9f0a93843507058045f0820dec6f242c6041db224b0ec8e79574c5c7dbc` |
| D21-D22 entry-probe TSV (all rows) | 18,273 | `c4db9dadba2720c9d47b72a72f9a085d23a5104235b63d596007d3a938e0ab9e` |
| pinned Language Reference Data SQLite | 342,433,792 | `248f9308662374c00dc597731ef085ee5ed87d9b703ec356be93ee9be8f03d4f` |
| revealed-holdout public matrix (selection: RH06/RH08/RH09 metadata) | 8,445 | `77b6d0705d2d69125163c91fcf6f0e704e91a4abad5677b89e5bfe204d4ddd68` |
| Lindera macOS CLI archive / executable | 2,104,174 / 4,992,192 | `cf60c9f6be16d0b620f70f30ce811670ac4a9b44220151ec47750fdd4c295a27` / `d0d10be332cce379d3872b5c25886a047ba18f94d2609016cc780167d54a151a` |
| Lindera IPADIC / UniDic archives | 15,879,934 / 54,469,218 | `ed10ce59ff1b1315b780a3984cfd10e31b9e658e58a1706328eb343aaa6927c6` / `321f9c9d26ae08138d9ee635592cf4eb19f6833d8ed3a959508d89c5229f860f` |
| Lindera source / generated `Cargo.lock` | — | `1bcb0e28fcd90f34b2bcf12f55a25008d791f62c` / `41642d86375024c03924030b57195b268bcbd8329fb74920a3161834ba10f0ec` |
| Lindera iOS static library / Swift-linked smoke | 27,085,752 / 7,349,504 | `137607b73a05751560846c0f337f8d2c931d27f08ad9948239772356036f77b5` / `3b747ab73ac626d2f8ca8d0230cada370cdbda72fc49847d0aadc8fa7f914e01` |
| Sudachi.rs source / `Cargo.lock` / iOS `rlib` | 4,145,200 (`rlib`) | `90fd6068c80c2fc3b63e0dbab0e341475bad4d8f` / `f847ceb0e9a6c91f97825b04267f21b6f3294f1ebe92a57a99bb1aebb48331ee` / `b3d8fcc2afbfabd55d116361105cf3ce68accc40efced9ae20cbdb37b5e43dd1` |
| SudachiDict-small wheel / extracted `system.dic` | 41,770,618 / 122,953,610 | `c10c7541795c4cf501ddd15f456409d0b75b84339c5961dd045fa922378b687a` / `f872a878c3c5e8a0df4ae8c548e1d7a754f58cdb37eb660ba22f6514457ad8cc` |
| Vibrato source / `Cargo.lock` / iOS `rlib` | 1,824,432 (`rlib`) | `7462fa07a60a176e8d9ef3cb287c7973290a0f9d` / `811a1afa0592ddfae1dc8a858afe78cf5bc873e792c7654fc79675e2eecc4778` / `b5d6b0c43d7116179169e3608b4505308e03e48a4dd30b68c61409b1c6da41d3` |

RH09's full top-20 transcription remains private. Its public matrix, issue #160 evidence hashes, and canonical aggregate line `RH09<TAB>literal=1/20<TAB>dictionary_form=17/20<TAB>misses=3<LF>` (49 bytes, SHA-256 `d374f350984f9f99cf8da9790bbd7bdbc97fcc00cec4d3ebac574a2088fc3470`) authenticate the retained run but deliberately do not republish private screenshot content. Thus D18-D22 are independently replayable from Git; RH09 is independently replayable only by the evidence custodian. No replacement holdout was opened.

### Acquisition and compile replay

Run from a clean checkout. `--locked` fixes each Rust dependency graph; the target and release profile are the compiler configuration used.

```bash
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
test "$(git -C "$repo" rev-parse HEAD)" = 917cbb7153457a79db117b5d536bbf60a7dfe519
scratch=$(mktemp -d)

curl -L -o "$scratch/lindera-cli.zip" https://github.com/lindera/lindera/releases/download/v5.1.0/lindera-aarch64-apple-darwin-v5.1.0.zip
curl -L -o "$scratch/ipadic.zip" https://github.com/lindera/lindera/releases/download/v5.1.0/lindera-ipadic-5.1.0.zip
curl -L -o "$scratch/unidic.zip" https://github.com/lindera/lindera/releases/download/v5.1.0/lindera-unidic-5.1.0.zip
curl -L -o "$scratch/sudachi-small.whl" https://github.com/WorksApplications/SudachiDict/releases/download/v20260723/sudachidict_small-20260723-py3-none-any.whl
shasum -a 256 "$scratch"/{lindera-cli.zip,ipadic.zip,unidic.zip,sudachi-small.whl}
unzip -q "$scratch/lindera-cli.zip" -d "$scratch/lindera-cli"
unzip -q "$scratch/ipadic.zip" -d "$scratch/ipadic"

git clone --filter=blob:none https://github.com/lindera/lindera.git "$scratch/lindera-src"
git -C "$scratch/lindera-src" checkout 1bcb0e28fcd90f34b2bcf12f55a25008d791f62c
git clone --filter=blob:none https://github.com/WorksApplications/sudachi.rs.git "$scratch/sudachi-rs"
git -C "$scratch/sudachi-rs" checkout 90fd6068c80c2fc3b63e0dbab0e341475bad4d8f
cargo build --manifest-path "$scratch/sudachi-rs/Cargo.toml" --locked --release --target aarch64-apple-ios -p sudachi
git clone --filter=blob:none https://github.com/daac-tools/vibrato.git "$scratch/vibrato"
git -C "$scratch/vibrato" checkout 7462fa07a60a176e8d9ef3cb287c7973290a0f9d
cargo build --manifest-path "$scratch/vibrato/Cargo.toml" --locked --release --target aarch64-apple-ios -p vibrato

python3 -m venv "$scratch/venv"
"$scratch/venv/bin/pip" install 'sudachipy==0.6.11' "$scratch/sudachi-small.whl"
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

Build with `cargo build --locked --release --target aarch64-apple-ios`; link the archive with `xcrun --sdk iphoneos swiftc -target arm64-apple-ios26.0 -import-objc-header bridge.h smoke.swift target/aarch64-apple-ios/release/libissue147_lindera_ios.a -o lindera-swift-smoke`. `bridge.h` declares the function above and `smoke.swift` asserts that a missing dictionary returns `-5`. Source SHA-256 values were `2f56c282e8f832dda54aff98e0d012fb67f3cebb616c1eb27136245fbc9003aa` (Rust), `ab82ac93dc3b7f1934e59265025a4aa3a399ecb85be4c66b8f58bdb3b66f715e` (header), and `f404b994f57d17c55ead8c63b7702812178b0737ab1b629aef5d4b852e20edb0` (Swift). Mach-O UUID/path metadata can change the linked-file digest on replay; successful arm64 linkage and `otool -L` showing only `libSystem` and `libswiftCore` are the deterministic checks.

### Analyzer and Ranking replay

The following public fixture probe produces the five Direct/entry rows below. Save it as `analyzer_probe.py` and run `venv/bin/python analyzer_probe.py "$repo"`.

```python
import csv,sys
from sudachipy import dictionary
root=sys.argv[1]; tokenizer=dictionary.Dictionary(dict="small").create()
obs=list(csv.DictReader(open(root+"/docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv"),delimiter="\t"))
for context,query in (("D18","食べる"),("D19","食べた"),("D20","ねこ")):
    rows=[r for r in obs if r["context_id"]==context]
    print(f"{context}\tliteral={sum(query in r['japanese'] for r in rows)}/{len(rows)}")
entries=list(csv.DictReader(open(root+"/docs/research/fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv"),delimiter="\t"))
for context in ("D21","D22"):
    rows=[r for r in entries if r["probe_id"]==context]; head,reading=rows[0]["entry_headword"],rows[0]["entry_reading"]
    kata="".join(chr(ord(c)+0x60) if "ぁ"<=c<="ゖ" else c for c in reading)
    literal=sum(any(x in r["japanese"] for x in (head,reading,kata)) for r in rows)
    evidence=sum(any((m.dictionary_form()==head) if context=="D21" else (m.reading_form()=="ネコ") for m in tokenizer.tokenize(r["japanese"])) for r in rows)
    print(f"{context}\tliteral_or_reading={literal}/{len(rows)}\t{'dictionary_form' if context=='D21' else 'exact_token_reading'}={evidence}/{len(rows)}")
```

Normalized output is `D18 20/20`, `D19 20/20`, `D20 9/9`, `D21 literal 6/20 and dictionary form 20/20`, `D22 literal/reading 20/20 and exact token reading 19/20`; canonical TSV SHA-256 is `7e7cbe3b6ff7ae646e2c1fea335f44ab5870a6bff820a56f70de7ff188df5e79`.

The Ranking replay selects exactly D18-D20 and D21-D22, resolves app-owned pair IDs from the pinned SQLite database, sorts first by Ruby grapheme count and then each declared signal, and computes exact positions plus concordant pairs inside equal-length groups. The executable source is preserved inline to avoid an extra repository artifact:

<details><summary>Ruby Ranking probe</summary>

```ruby
require "csv"; require "digest"; require "json"; require "open3"; require "sqlite3"
root,lindera,ipadic=ARGV
db=SQLite3::Database.new(root+"/apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3")
ids={}; db.execute("select p.source_japanese_record_id,p.source_english_record_id,'esp1_'||lower(hex(e.id)) from example_sentences e join example_sentence_provenance p on p.pair_id=e.id"){|j,e,id|ids[[j,e]]=id}
rows={}
CSV.foreach(root+"/docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv",headers:true,col_sep:"\t"){|r|(rows[r["context_id"]]||=[])<<r if %w[D18 D19 D20].include?(r["context_id"])}
CSV.foreach(root+"/docs/research/fixtures/example-sentence-retrieval-issue-147-entry-route-probes.tsv",headers:true,col_sep:"\t"){|r|(rows[r["probe_id"]]||=[])<<r if %w[D21 D22].include?(r["probe_id"])}
def agree(a); n=d=0;a.combination(2){|x,y|n+=1;d+=1 if yield(x)>yield(y)};[n-d,n] end
signals={app_id:->r{r[:id]},japanese_lexical:->r{r[:ja]},english_length:->r{r[:en].each_grapheme_cluster.count},english_lexical:->r{r[:en]},content_sha256:->r{Digest::SHA256.hexdigest(r[:ja]+"\0"+r[:en])}}
agg=Hash.new{|h,k|h[k]=[0,0,0,0]}
rows.each do |ctx,raw|
  ranked=raw.sort_by{|r|r["rank"].to_i}.map{|r|out,_=Open3.capture2(lindera,"tokenize","--dict",ipadic,"--output","json",stdin_data:r["japanese"]+"\n");{ja:r["japanese"],en:r["english"],len:r["japanese"].each_grapheme_cluster.count,id:ids[[r["japanese_id"].to_i,r["english_id"].to_i]],tokens:JSON.parse(out).count{|t|t["part_of_speech"]!="記号"}}}.select{|r|r[:id]}
  signals.merge(token_count:->r{r[:tokens]}).each do |name,fn|
    pred=ranked.sort_by{|r|[r[:len],fn.call(r)]}; exact=ranked.zip(pred).count{|x,y|x[:id]==y[:id]}; concord=pairs=0
    ranked.group_by{|r|r[:len]}.each_value{|g|c,p=agree(g,&fn);concord+=c;pairs+=p}; puts [ctx,name,"exact=#{exact}/#{ranked.length}","tie_pair_agree=#{concord}/#{pairs}"].join("\t"); x=agg[name];x[0]+=exact;x[1]+=ranked.length;x[2]+=concord;x[3]+=pairs
  end
end
puts "AGG";agg.each{|n,x|puts [n,"exact=#{x[0]}/#{x[1]}","tie_pair_agree=#{x[2]}/#{x[3]}"].join("\t")}
```

</details>

Run `ruby rank_probe.rb "$repo" "$scratch/lindera-cli/lindera" "$scratch/ipadic/lindera-ipadic" > ranking.tsv`. The complete 37-line result is authenticated by SHA-256 `114be3178f6b77e86dd43f2b79873fdce601526ffd8854e822eee213d02187ec`; its six aggregate rows are the Ranking table above.

### Raw timing and determinism evidence

The timed inputs are exactly 1,000 repetitions each of `彼は少し飲んだ。` and `始めました。` (2,000 sentences). Lindera used `lindera tokenize --output wakati --dict DICTIONARY`; Sudachi constructed one small-dictionary tokenizer then called `tokenize`; Apple constructed one Japanese lemma `NLTagger` per sentence. Each command was wrapped in `/usr/bin/time -lp` and run three times with stdout discarded. Raw observations, in run order:

| Probe | Wall seconds | Maximum RSS bytes |
|---|---|---|
| Lindera IPADIC | `0.05, 0.05, 0.05` | `43728896, 43745280, 43728896` |
| Lindera UniDic | `0.05, 0.06, 0.05` | `150847488, 150798336, 150781952` |
| SudachiDict-small | `0.03, 0.03, 0.03` | `38764544, 38977536, 39059456` |
| Apple Natural Language | `1.17, 0.72, 0.74` | `13467648, 13238272, 13484032` |

Canonical TSV (header `probe,run,wall_seconds,max_rss_bytes`, tab-separated, LF) SHA-256 is `704b78b753997bdf6661640b5a62fe0133b403d0b12601a04bb8b67f276fc0ba`. Sudachi's 250-byte timing source is `tokenizer=dictionary.Dictionary(dict='small').create();` followed by the nested 1,000 × two-sentence loop; SHA-256 `a464b9e7be32911db4aa13034d1d347d430abf22d7f3d65869029aef9be990a8`. Apple's equivalent 531-byte Swift source SHA-256 is `9c59ee24a664800cdc0e0fcc2ebf6d2d9e4c2dd154a574bf21a740c8b767fdc6`; compile with `xcrun swiftc -O nl_perf.swift -o nl_perf`.

Fresh processes analyzing the same fixed four-sentence probe produced identical normalized output 3/3: Lindera SHA-256 `f495eeee8071648c2af1c16b3a6279c22f072adf4ccad55da8de6c63fa46b4cc`, Sudachi SHA-256 `dc517cc74661c7de3b9deb61185c4a3e2993bcf48e7dfeca57f786bac7639f41`. The Apple scheme/lemma probe source SHA-256 is `8078f73fdc17a0d520422e0be032cfcbe328c6fb5f6027baf91c54ec55dfe6ef`; its normalized output (schemes plus token-to-lemma rows) is `96f0bc25005f129e79de7c40b090a23825fb546d7f0da00be9f4340ac9ad22ee`, confirming only `Language`, `Script`, `TokenType` and `nil` Japanese lemmas.

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
