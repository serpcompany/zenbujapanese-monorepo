# Prototype sources, licenses, binaries, and redistribution audit

**Audit boundary:** iOS tag [`milestone/ios-nihongo-clone-2026-08-13`](https://github.com/serpcompany/zenbujapanese-monorepo/tree/milestone/ios-nihongo-clone-2026-08-13) (`44479f5f0a7feaa1a58a73ae6bb8a1fea3097a13`) and browser-extension tag [`prototype-handoff-2026-08-13`](https://github.com/serpcompany/zenbu-browser-extension/tree/prototype-handoff-2026-08-13) (commit `dd7a4a78e79c2cbe61fad04ee59000c67ecbde24`).

**Method:** repository source, lockfiles, release artifacts, and the named upstream projects' own licenses, documentation, and terms were treated as authoritative. Search-result summaries and third-party license databases were not used as authority. This is an engineering provenance audit, not legal advice.

## Decision summary

Neither frozen prototype is production-redistribution-ready as-is.

The iOS app has a strong provenance mechanism for its main Language Reference Data, but four items block calling the signed build cleared for public App Store or future Android distribution:

1. The Tatoeba adapter imports the general attributed sentence exports but retains neither contributor identity nor a per-sentence attribution link.
2. The DaKanji Core ML model is MIT-licensed at the upstream project level, but the trained model depends on ETL Character Database and KanjiVG training inputs whose downstream-model redistribution rights are not established by the MIT notice.
3. The Kanjium-derived element artifact has source-mixing and field-level provenance ambiguity, and the required Kanjium App Store/Google Play attribution has not been demonstrated.
4. The App icon and the captured Nihongo reference evidence have no affirmative redistribution grant recorded. The reference evidence must remain internal and outside public source/release packages; the icon needs an ownership record or replacement.

In addition, KanjiVG, Kanjium, and EDRDG-derived artifacts carry ShareAlike/no-additional-restrictions obligations. EDRDG expressly allows smartphone bundling when its attribution and update rules are followed, but KanjiVG and Kanjium provide no equivalent App Store-specific permission in the audited sources. Their inclusion in an Apple-encrypted binary therefore needs either written permission, a distribution design that leaves the licensed material unencumbered, or counsel approval.

The browser-extension findings are recorded below.

## iOS inventory

The Swift package declares no remote package dependency. It links the OS-provided `sqlite3` library and uses Apple SDK frameworks; no third-party Swift package or bundled SQLite binary exists ([`Package.swift`](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/Modules/Package.swift)). The only shipped non-source payloads are the generated language artifacts, one Core ML package, retained license notices, and the app icon.

| Shipped item | Derived from | License / terms | Current disposition |
| --- | --- | --- | --- |
| `LanguageReferenceData.sqlite3` (287,490,048 bytes; SHA-256 `c5076ad2…`) | JMdict English, UniDic pitch fields, Tatoeba Japanese/English sentences and links, Zenbu editorial relationships | Mixed: EDRDG CC BY-SA 4.0; UniDic selected under New BSD; Tatoeba currently recorded as CC BY 2.0 FR; Zenbu-owned facts | **Blocked as a whole** by Tatoeba attribution. Split into independently versioned resource inputs/artifacts so one source does not contaminate the release status of the entire database. |
| `KanjiReferenceData.json` (4,045,598 bytes; SHA-256 `425d4471…`) | KANJIDIC2 plus KRADFILE/RADKFILE | EDRDG CC BY-SA 4.0 and EDRDG's supplemental conditions | **Conditionally redistributable.** Existing source screen and monthly update check cover the main smartphone obligations; preserve attribution, license links, source identifiers, modification notices, and update procedure. |
| `RadicalReferenceData.json` (362,198 bytes; SHA-256 `f7c9eed0…`) | KRADFILE/RADKFILE | EDRDG CC BY-SA 4.0 and EDRDG's supplemental conditions | **Conditionally redistributable** under the same EDRDG controls. |
| `KanjiStrokeData.sqlite3` (21,921,792 bytes; SHA-256 `1b9bcd25…`) | KanjiVG `r20250816`, filtered and geometrically normalized | CC BY-SA 3.0 | **Not yet store-cleared.** Attribution, full license text, snapshot, and modification disclosure exist, but ShareAlike and no-effective-technological-measures handling needs an approved distribution design or permission. |
| `KanjiElementReferenceData.json` (1,561,664 bytes; SHA-256 `ec160ef…`) | Kanjium commit `8a0cdaa…` plus the EDRDG-derived Kanji Reference artifact | Kanjium claims CC BY-SA 4.0 for its changes while identifying numerous independently sourced inputs | **Blocked pending field-level provenance.** The exact upstream ownership of every retained structural, variant, and phonetic field is not demonstrated. Kanjium's requested store-listing attribution must also be added before any store release. |
| `DaKanji.mlpackage` (about 23 MB; manifest/model/weights hashes retained) | DaKanji v1.2 pretrained model converted by Zenbu to Core ML | Upstream repository is MIT; model training inputs have additional terms | **Blocked.** Do not infer that MIT relicenses ETL or KanjiVG training inputs. Obtain written clearance for distributing the trained weights or replace the model with a provenance-cleared recognizer. |
| `DAKANJI-MIT.txt`, `KANJIVG-CC-BY-SA-3.0.txt`, `UNIDIC-NEW-BSD.txt` | Upstream notices | Respective upstream terms | Required notices; keep in every relevant binary/resource pack and expose them from Sources/About. |
| `AppIcon.png` | Added in commit `7c6c881…`; no author/source/license record in the tag | Unresolved | **Blocked for public release until ownership is recorded or the icon is replaced.** |
| Verification screenshots and Nihongo discovery evidence | Zenbu captures plus 147 captures of the third-party Nihongo UI | No third-party redistribution grant recorded | Keep private as internal product evidence. Exclude third-party captures, package reports, and boards embedding them from public archives, documentation sites, sample apps, store media, and distributable SDK/resource packs. |

The artifact composition and checksums above are recorded in the tag's [generated import manifests](https://github.com/serpcompany/zenbujapanese-monorepo/tree/milestone/ios-nihongo-clone-2026-08-13/apps/ios/LanguageData/Generated) and [source manifests](https://github.com/serpcompany/zenbujapanese-monorepo/tree/milestone/ios-nihongo-clone-2026-08-13/apps/ios/LanguageData/Sources).

### EDRDG: JMdict, KANJIDIC2, KRADFILE, and RADKFILE

EDRDG applies CC BY-SA 4.0 to these files and their derived data. It expressly permits commercial software and says the software itself need not be open source. For smartphone apps it requires an accessible Sources/About acknowledgement; it also requires a regular update procedure. The audited tag has a detailed Sources screen and a monthly upstream-check workflow. The KANJIDIC importer deliberately excludes query codes and other fields with special third-party interests, including SKIP ([EDRDG licence](https://www.edrdg.org/edrdg/licence.html), [source screen](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/Modules/Sources/LookupReplica/DictionarySourcesView.swift), [update workflow](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/.github/workflows/jmdict-upstream-check.yml), [KANJIDIC transform manifest](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/LanguageData/Generated/KANJIDIC2-2026-08-10.import.json)).

The update workflow is a compliance control, not merely maintenance convenience. A failed scheduled check must block release until a reviewed snapshot promotion occurs.

### UniDic

UniDic CWJ 3.1.0 is offered under a GPL v2.0 / LGPL v2.1 / New BSD choice. Zenbu selects New BSD, retains only matched pitch facts, bundles the complete New BSD copyright/conditions/disclaimer, and exposes it in Sources. This supports source and binary redistribution without copylefting the app ([NINJAL version/license table](https://clrd.ninjal.ac.jp/unidic/en/back_number_en.html), [retained New BSD notice](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/LanguageData/Sources/UNIDIC-NEW-BSD.txt)).

NINJAL's back-number page requests consultation for profit use while its separate commercial-use note says version 2.x onward is free for business under the triple license ([commercial-use note](https://clrd.ninjal.ac.jp/unidic/en/commerce_use_en.html)). That inconsistency is not a license blocker under the selected New BSD text, but production should retain a record of a NINJAL inquiry before a paid launch.

### Tatoeba

The frozen adapter reads `jpn_sentences.tsv.bz2`, `eng_sentences.tsv.bz2`, and `jpn-eng_links.tsv.bz2`, not the separately published `*_sentences_CC0.tsv.bz2` exports. It outputs only source identity, Japanese sentence ID, Japanese text, and English text; it drops both contributors' identities and the English sentence ID ([adapter](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/Tools/tatoeba_adapter.py), [frozen source manifest](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/LanguageData/Sources/Tatoeba-2026-08-08.source.json)).

Tatoeba's terms say attributed text reuse must cite the author and that the reuser is responsible for circulating each sentence with its license. Its official download page separately identifies a CC0-only sentence export ([terms](https://tatoeba.org/en/terms_of_use), [download formats](https://tatoeba.org/en/downloads)). The general project link in Zenbu's Sources screen is therefore insufficient evidence of per-sentence attribution.

**Required replacement:** rebuild examples only from Japanese and English records explicitly present in the CC0 exports, retain both record IDs for provenance, and record the CC0 snapshot/checksums. If non-CC0 sentences remain necessary, import author data and render a durable per-pair attribution/license path instead.

### KanjiVG

KanjiVG identifies Ulrich Apel as copyright holder and licenses the work under CC BY-SA 3.0. Zenbu records the source release, creator, license, modifications, and complete terms, and explicitly licenses the transformed stroke database under the same terms ([KanjiVG project licence](https://github.com/KanjiVG/kanjivg), [Zenbu source record](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/LanguageData/Sources/KanjiVG-2025-08-16.source.json)).

CC BY-SA 3.0 requires adaptations to remain under a compatible ShareAlike license and prohibits effective technological measures that restrict recipients' licensed rights ([legal code](https://creativecommons.org/licenses/by-sa/3.0/legalcode.en)). Creative Commons' own FAQ says a licensee may not apply DRM to third-party CC material without express permission ([CC FAQ](https://creativecommons.org/faq/)). Because Apple may encrypt store binaries, production must not assume that a bundled ShareAlike database is safe merely because its notice is visible. Obtain supplemental permission, legal approval, or deliver the resource through a channel that does not encumber it and gives recipients the licensed artifact separately.

### Kanjium

Kanjium's pinned README says its package is CC BY-SA 4.0, but also documents that it incorporates EDRDG data, Tatoeba examples, third-party fonts and stroke images, ChineseEtymology.org images, JLPT data, libhangul, and CC-CEDICT. It specifically requests attribution of Uros O.'s additions in the application **and** the iTunes App Store/Google Play description ([pinned README](https://github.com/mifunetoshiro/kanjium/blob/8a0cdaa16d64a281a2048de2eee2ec5e3a440fa6/README.md), [pinned license](https://github.com/mifunetoshiro/kanjium/blob/8a0cdaa16d64a281a2048de2eee2ec5e3a440fa6/LICENSE.txt)).

Zenbu extracts element structure, variants, and explicit phonetic annotations, but Kanjium does not provide field-level provenance sufficient to prove which named upstream owns every selected value ([Zenbu importer](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/Tools/import_kanji_elements.py)). Treat this artifact as unresolved rather than relying on the repository-wide CC label. Production should replace those fields with independently documented sources or obtain a field-specific provenance statement from Kanjium's maintainer.

### DaKanji Core ML model

DaKanji v1.2's code repository is MIT and its release provides pretrained weights. Its README says training used the AIST ETL Character Database and KanjiVG-generated characters ([DaKanji README](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition/blob/v1.2/README.md), [MIT license](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition/blob/v1.2/LICENSE)). Zenbu's source record proves a byte-stable Core ML conversion but does not preserve a training bill of materials, training command, dataset versions, upstream assent, or a legal basis for redistributing the learned weights ([Zenbu model record](https://github.com/serpcompany/zenbujapanese-monorepo/blob/milestone/ios-nihongo-clone-2026-08-13/apps/ios/LanguageData/Sources/DaKanji-v1.2.source.json)).

AIST permits free **use** of ETL but says the database itself may be distributed only through its website and prohibits unauthorized redistribution/publication beyond quotation or direct links ([AIST terms](https://etlcdb.db.aist.go.jp/download2/)). Those terms do not answer whether commercial redistribution of learned weights is allowed. KanjiVG's ShareAlike treatment of learned weights is also unsettled in the audited sources. The upstream project's MIT notice cannot grant rights held by AIST or KanjiVG.

**Required replacement/clearance:** obtain written confirmation from AIST and KanjiVG that this trained model may be redistributed through Apple's and Google's stores under Zenbu's intended terms, plus a reproducible training BOM; otherwise replace it with a model trained only on cleared data or a platform capability. Do not ship the present model to Android merely because the Core ML file can be converted.

### Apple platform capabilities and services

The app uses OS-provided Vision for image/handwriting text recognition, Translation for Natural Translation, AVFoundation for Speech Synthesis, and system camera/photo/file pickers. It does not bundle those frameworks or an Apple model. Apple documents Vision recognition as on-device. Translation is also on-device, although Apple may collect bundle ID, source/target language, and performance metrics without source or translated content ([Vision documentation](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [TranslationSession documentation](https://developer.apple.com/documentation/translation/translationsession)).

These are distributable Apple-client integrations, not portable shared binaries. Keep each behind a Shared Capability adapter, disclose any required metrics/privacy behavior, and supply an independently cleared Android/browser implementation. Apple's App Review Guidelines also require rights to every included third-party work and permission for third-party services ([App Review Guidelines 5.2](https://developer.apple.com/app-store/review/guidelines/)).

## Browser-extension inventory

The frozen extension must remain a read-only provenance exhibit, not a source dependency. Do not copy it, use it as a subtree/submodule, publish its package, or re-upload its release into the monorepo.

### Recovered Sokutan implementation

The extension's own source note says its main implementation was recovered from Chrome Web Store extension `iegifihnfhecggemcbkfgipepbnmiade`, Sokutan 1.4.10, and that neither a top-level license nor a public redistribution/rebranding grant was found. The frozen repository itself has no top-level license ([frozen `SOURCE_NOTES.md`](https://github.com/serpcompany/zenbu-browser-extension/blob/dd7a4a78e79c2cbe61fad04ee59000c67ecbde24/SOURCE_NOTES.md)). This applies to the inherited shell, page annotation, dictionary, subtitle, saved-item, settings, relay, styles, tests, and store-document implementation. Readable source in an installed package is not evidence of permission to redistribute it.

**Required disposition:** either obtain a written grant from the copyright holder covering Sokutan 1.4.10 and derivatives, or cleanly implement accepted behavior from independently authored requirements. Until then, do not transplant any extension source into the monorepo.

### GPL ImageTrans OCR layer and bundled binaries

The tag identifies its OCR integration as adapted from ImageTrans and retains GPL-3.0 terms. The following frozen runtime/model payloads are byte-identical to files at ImageTrans commit [`dfee8a38`](https://github.com/xulihang/ImageTrans_chrome_extension/tree/dfee8a38afa90f5abe146a2d8f9cdd9a297d7b43/ImageTrans/paddleocr):

| Frozen payload | SHA-256 | Finding |
| --- | --- | --- |
| `ocr/models/det.onnx` | `193bab7a04fc…` | Exact ImageTrans `tiny/det.onnx`; original Paddle model/export/training provenance absent. |
| `ocr/models/ja-rec.onnx` | `5435fd747c9e…` | Exact ImageTrans `rec.onnx`; original Paddle model/export/training provenance absent. |
| `ocr/models/ja-dict.txt` | `b5f2bfe2bdd9…` | Exact ImageTrans `ppocrv6_dict.txt`; original dataset construction provenance absent. |
| `ocr/runtime/opencv.js` | `806cb5646afa…` | Exact ImageTrans file; exact OpenCV release and build options absent. |
| `ocr/runtime/ort.min.js` | `25ede6ef16e2…` | Banner identifies ONNX Runtime Web 1.25.1, MIT. |
| `ocr/runtime/ort-wasm-simd-threaded.jsep.js` | `42e36575e4e…` | Matches ImageTrans and the official ONNX Runtime Web 1.25.1 artifact, with a renamed extension. |
| `ocr/runtime/ort-wasm-simd-threaded.jsep.wasm` | `36aacaf44f7b…` | Matches official ONNX Runtime Web 1.25.1, MIT. |

ImageTrans is GPL-3.0, which requires the covered/combined distribution to retain the GPL freedoms and provide Corresponding Source, including necessary build and installation scripts ([ImageTrans license](https://github.com/xulihang/ImageTrans_chrome_extension/blob/dfee8a38afa90f5abe146a2d8f9cdd9a297d7b43/LICENSE)). The frozen packaging recipe excludes much of the build/provenance material needed to prove a complete Corresponding Source offer, and GPL compliance would not cure the separate missing Sokutan permission.

PaddleOCR itself is Apache-2.0 ([official license](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)), and ONNX Runtime 1.25.1 is MIT ([official license](https://github.com/microsoft/onnxruntime/blob/v1.25.1/LICENSE)). Those upstream licenses do not establish that these specific converted models came from a named official Paddle release.

**Required replacement:** select named official models, retain immutable source/version/hash and training provenance, perform and document the export, pin official ONNX Runtime Web and a versioned OpenCV.js build, and write a new orchestration/interface layer. Alternatively, deliberately GPL the complete extension only after resolving the recovered-source rights.

### Kuromoji and tokenizer data

`lib/kuromoji.js` matches npm `kuromoji@0.1.2`, licensed Apache-2.0, and first run downloads its twelve dictionary files from jsDelivr's immutable `0.1.2` path ([official tag license](https://github.com/takuyaa/kuromoji.js/blob/d0357c1427acb912815fc8ab59f284dd08bad0fa/LICENSE-2.0.txt)). The extension omits the package's required MeCab-IPADIC, NAIST, and ICOT notices documented in upstream [`NOTICE.md`](https://github.com/takuyaa/kuromoji.js/blob/d0357c1427acb912815fc8ab59f284dd08bad0fa/NOTICE.md).

**Required replacement/control:** pin or vendor every dictionary file by checksum and ship the complete Apache license and NOTICE. Prefer evaluating a maintained tokenizer before locking this old version into the Shared Capability.

### Jitendex dictionary and audio

The extension downloads `jitendex-mdict.zip` through a mutable GitHub `/latest/` URL and records no upstream release, immutable asset identity, size, or checksum. Jitendex licenses its files CC BY-SA 4.0 and documents incorporated JMdict, Tatoeba, Kanji alive audio, and JmdictFurigana sources ([Jitendex legal inventory](https://jitendex.org/pages/legal.html)). The extension's single Jitendex link does not reproduce that complete attribution inventory.

**Required replacement/control:** select an immutable Jitendex release and retain its complete legal files, or build a versioned Language Reference Data artifact from directly audited inputs. Never ship a production pipeline that resolves `/latest/` at runtime.

### Build dependencies

The lockfile pins Playwright 1.60.0, `esearch-ocr` 8.5.0, `cross-env` 10.1.0, `dotenv` 17.4.2, and their small transitive development dependencies. `esearch-ocr` is Apache-2.0 and its install script generates a UMD runtime plus its license, but that generated directory is absent from the tag. A raw tag checkout is therefore not the same loadable artifact as the packaged release. The lock also has `onnxruntime-common@1.27.0` while the hand-copied browser runtime identifies 1.25.1 ([frozen lockfile](https://github.com/serpcompany/zenbu-browser-extension/blob/dd7a4a78e79c2cbe61fad04ee59000c67ecbde24/package-lock.json), [sync script](https://github.com/serpcompany/zenbu-browser-extension/blob/dd7a4a78e79c2cbe61fad04ee59000c67ecbde24/scripts/sync-ocr-runtime.js)). Production must remove this split and produce a reproducible SBOM from one build.

### Media and fonts

No font is bundled; runtime CSS names system fonts. Icons were rendered by repository scripts using whichever Japanese system font Chromium selected, so their font provenance is not reproducible. Four store screenshots were scripted; one intentionally includes a live Jitendex definition. Two promotional backgrounds are described only as OpenAI-generated, with no generation ID, account record, exact prompt, terms snapshot, or content credential. OpenAI's terms allocate Output ownership to the user as between the user and OpenAI, but that does not prove who generated these particular files or under which account ([OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)).

**Required replacement:** recreate brand/store art under a controlled company account or design agreement, retain editable sources and generation records, and document approved fonts/licenses. Do not place third-party dictionary content in marketing screenshots without its attribution.

### Network and platform services

- **MyMemory:** Natural Translate sends user-selected Japanese text in the URL query. MyMemory's official specification limits `q` to 500 bytes; its terms say submitted segments and usage metadata may be retained and may reach external machine-translation providers ([API specification](https://mymemory.translated.net/doc/spec.php), [terms/privacy](https://mymemory.translated.net/terms-and-conditions)). Keep it explicit and opt-in, disclose remote processing, and decide whether its quota/privacy/reliability fit production.
- **jsDelivr/npm and GitHub Releases:** today they receive request/IP metadata and deliver tokenizer/Jitendex data. Prefer immutable, checksummed, controlled resource delivery.
- **YouTube:** the code intercepts timed-text requests and calls undocumented InnerTube endpoints rather than a supported integration. Production must use an authorized design consistent with the [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service), or omit it.
- **Netflix:** the code walks internal page/player objects and manifests without evidence of a licensed Netflix API. Obtain an authorized integration or omit it; review the [Netflix Terms of Use](https://help.netflix.com/legal/termsofuse).
- **Browser speech synthesis:** no voice or audio model is bundled; available voices and their behavior belong to the user's OS/browser.

### Clean implementation boundary

Import only independently written requirements, issue decisions, links, and hashes. Treat screenshots as restricted internal behavioral evidence. Open clean implementation work for the extension shell, subtitle integrations, Language Reference Data/tokenizer pipeline, OCR pipeline, Natural Translation provider, media assets, and notices. Its release gate must include written ownership confirmation, a generated SBOM, immutable artifact hashes, all license/NOTICE files, reproducible build/source correspondence, and service terms/privacy review.

## Distribution matrix

| Material class | Private source / collaborators | TestFlight / App Store | Browser stores | Future Android / Play |
| --- | --- | --- | --- | --- |
| Zenbu-authored code and fixtures | Owner may share; no repository-level license currently grants public reuse | Yes, subject to Apple terms and clearing all bundled inputs | Yes, subject to store terms and clearing all bundled inputs | Yes, subject to Google terms and clearing all bundled inputs |
| EDRDG derived artifacts | Yes with attribution, CC BY-SA marking, and update controls | Expressly contemplated by EDRDG for smartphone apps; keep Sources screen, links, modification/provenance, and monthly update gate | Yes with visible acknowledgement and ShareAlike/no-additional-restrictions compliance | Expressly contemplated as a smartphone app; same controls |
| UniDic-derived pitch facts | Yes under selected New BSD with notice | Yes with notice; retain commercial-use inquiry record | Yes with notice | Yes with notice |
| Tatoeba examples in frozen iOS DB | Private audit only | **No production clearance** until CC0 rebuild or contributor attribution is implemented | Do not import this frozen artifact | **No production clearance** |
| KanjiVG stroke database | Yes if shared as CC BY-SA 3.0 with attribution, modifications, and terms | Needs permission/legal approval or an unencumbered delivery design | Likely feasible if the artifact remains extractable and correctly marked; verify store terms | Likely feasible in an ordinary APK/resource delivery if no DRM/additional restriction is applied; verify store terms |
| Kanjium element artifact | Audit only pending field-level provenance | **No production clearance** | **No production clearance** | **No production clearance** |
| DaKanji converted model | Audit only with upstream notices | **No production clearance** pending training-data/model permission | Do not port or package | **No production clearance** |
| Nihongo reference captures | Keep access-controlled for internal evidence only | Never bundle or use as store media | Never bundle or publish | Never bundle or use as store media |
| Frozen browser-extension source | Preserve as restricted provenance evidence only | Not applicable | **No redistribution clearance** because Sokutan permission is absent; GPL OCR does not cure it | Do not import |
| Extension OCR models/runtime | Preserve hashes and upstream links only | Not applicable | **No production clearance**; rebuild from named, permissively licensed inputs | Reuse only a newly audited cross-platform pipeline |
| Jitendex runtime download | Audit the fixed resource chosen later | Not applicable | Do not use mutable `/latest/`; complete attribution and ShareAlike design required | Same |

## Architecture and release requirements

1. **Keep resource licenses as architectural boundaries.** Do not ship one opaque cross-license mega-database. Generate independently versioned Language Reference Data packs with source record identity, source snapshot/hash, transform hash, output hash, license, attribution, modification statement, and update policy.
2. **Make provenance machine-enforced.** A release must fail when a bundled non-Zenbu file or generated artifact lacks a manifest, retained terms, owner, allowed channels, and reviewed status. Generate a human Sources screen, store-listing credits, and release notices from the same records.
3. **Quarantine unresolved inputs.** Tatoeba's current general export, the Kanjium-derived artifact, the DaKanji model, the unproven App icon, and third-party reference captures must not cross the production-release boundary.
4. **Prefer the CC0 Tatoeba path.** It removes hundreds of thousands of per-contributor attribution obligations while retaining source IDs and snapshot provenance.
5. **Resolve ShareAlike delivery before architecture locks.** Decide whether CC BY-SA resource packs are independently downloadable/unencumbered, separately offered in source form, covered by supplemental permissions, or replaced. Do not leave this to App Store submission week.
6. **Treat system providers as adapters.** Vision, Translation, and AVFoundation satisfy current iOS Shared Capabilities but do not define the cross-platform contract or confer an Android/browser implementation.
7. **Choose and record the first-party source license.** Both preserved repositories are private and have no repository-level license. Before any public source release or external contribution program, decide proprietary versus an explicit open-source license and add contribution terms; GitHub visibility alone is not a license grant.
8. **Separate internal clone evidence from product assets.** Keep Nihongo screenshots/package observations in restricted evidence storage referenced by IDs. Public documentation and tests should use Zenbu-owned fixtures and screenshots only.
9. **Require channel-specific legal gates.** “Builds successfully” is not redistribution approval. Maintain explicit `source`, `TestFlight/App Store`, `browser store`, and `Android/Play` status for every resource and model.

## Immediate release status

The frozen releases remain valid historical prototypes and internal acceptance evidence. They must not be described as production-license-cleared. Before expanding TestFlight beyond controlled internal evaluation or submitting any public store build, replace or clear the Tatoeba, Kanjium, DaKanji, and icon blockers; decide the ShareAlike distribution design; and generate complete channel-specific notices.
