# Japanese Image Text technology evaluation for issue #250

Research for [#250](https://github.com/serpcompany/zenbujapanese-monorepo/issues/250)
on `refactor/native-swiftui-components` at
`f01796825736d084c2ed4a65bde490b3e8d55692`. Consulted 2026-09-03. This note
changes no production Swift, test, data artifact, dependency, privacy behavior,
or learner-visible behavior.

## Decision

Do not replace Apple Vision with another OCR engine yet. The attached screens
prove a learner-visible region/granularity problem, but the pixels alone do not
identify its layer. The code audit and #249 evidence prove that Zenbu has fragile
**custom post-OCR region construction and Japanese analysis**; the standard
vertical-fixture journey uses injected text observations rather than live OCR.
The horizontal screenshot remains mixed evidence until its exact launch and
result artifact are replayed, so it cannot be attributed to OCR or post-OCR
logic from the screenshot alone.

Use this modular target stack:

1. **Image acquisition and orientation:** retain Apple's current Camera,
   `PhotosPicker`, `fileImporter`, ImageIO orientation, and bounded image-copy
   path.
2. **Still-image OCR:** keep Apple Vision on-device and advance iOS 26
   `RecognizeDocumentsRequest` as the leading native replacement for the current
   `VNRecognizeTextRequest` adapter. The empirical seed below changed this from
   a paper candidate into the clear next prototype: it recovered all four
   vertical lines, correct top-to-bottom direction, right-to-left column order,
   and line quadrilaterals where the current request recovered none. Do not
   treat it as a Japanese tokenizer: Apple explicitly says its word view is
   unavailable for Japanese, Chinese, Korean, and Thai, and the seed returned
   words only for the Latin fixture footer.
   [Apple WWDC25: Read documents using Vision](https://developer.apple.com/videos/play/wwdc2025/272/)
3. **Region geometry:** consume provider-supplied line and character polygons.
   Remove cross-observation word invention and proportional token rectangles
   from the production candidate. If exact token geometry is unavailable, show
   an honest selectable line/region or raw text; do not fabricate a word box.
   Prototype VisionKit `ImageAnalyzer` + `ImageAnalysisInteraction` as the
   Apple-native still-image selection surface before extending the custom
   overlay; route selected text through Japanese Text Analysis and preserve
   Zenbu's exact Word Detail/Encounter Media behavior.
4. **Japanese morphology:** benchmark Apple's `NLTokenizer` as the zero-download
   system control and **Sudachi** as the established analyzer. The leading
   production candidate is the current `sudachi.rs` core through the existing
   Swift/UniFFI package, with pinned SudachiDict `core`. It supplies source
   ranges, dictionary/normalized forms, readings, and part of speech without
   Zenbu implementing a tokenizer or deinflector. It still requires an owner
   decision because the binding is very new and `core` is approximately 70 MB
   compressed/207 MB installed. The empirical seed rejected `small` as the
   default because it split the ordinary app-owned word `日本語` into `日本|語`.
   [sudachi-swift](https://github.com/iasnezhkov/sudachi-swift),
   [official Sudachi](https://github.com/WorksApplications/sudachi.rs),
   [official SudachiDict](https://github.com/WorksApplications/SudachiDict)
5. **Dictionary identity:** keep Zenbu's app-owned resolver. Map an analyzer's
   surface, source range, dictionary form, normalized form, reading, and POS to
   eligible Language Reference Data entries, return the exact
   `LanguageReferenceID` only when evidence identifies it, and preserve an
   explicit ambiguous/no-match state otherwise. Provider IDs and ranked-first
   guesses must not become canonical identity.
6. **Overlay and navigation:** keep the purpose-specific `ImageTextCanvas`,
   selection, gloss, Encounter Media, Word Detail, and Back contracts. Feed it
   evidence-rich regions rather than asking the view to infer language or
   geometry.
7. **Video/subtitles:** ingest subtitle text directly from lawful DOM text,
   native caption tracks, WebVTT/SRT files, or speech transcription. Do not OCR
   ordinary video frames when text already exists.

This follows [ADR 0001](../adr/0001-language-capability-boundaries.md): provider
modules remain replaceable Language Technology behind app-owned Image Text
Recognition and Japanese Text Analysis boundaries. It does not select a cloud
provider or authorize a package/data addition.

## What the two screenshots prove

The two downloaded desktop attachments show Zenbu displaying purpose-created
fixture images:

| Attachment                                                                                           | Capture SHA-256                                                    | Visible source fixture                        | What it proves                                                                              | What it does not prove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Vertical screen](https://github.com/user-attachments/assets/fe821e9d-dc87-4446-805b-ab080432e527)   | `e0d30b3ba642dfe07a5a70b307de48fa45da2e8c6bf1df22de470104c8829f29` | `IMG-FIXTURE-002 · synthetic vertical layout` | Current overlay grouping and box presentation look fragmented and displaced to the learner. | It cannot establish OCR accuracy. The standard public journey adds `-InjectVerticalImageTextRecognition`, and the DEBUG client returns four hard-coded line observations with no character boxes. The screenshot pixels alone do not preserve process arguments, so retain the result bundle/launch log when citing a particular run. [launch helper](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L5221-L5236), [injected observations](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextRecognitionFixture.swift#L5-L58) |
| [Horizontal screen](https://github.com/user-attachments/assets/838d37e7-5595-492f-a7b3-2b2f44c8b881) | `8d4bc73d3523bd2e6a0db16e9ae10780fd8c83e5a2300c0e0929f610629bec87` | `Synthetic fixture · IMG-FIXTURE-001`         | On a clean synthetic image, current output produces inconsistent phrase/word granularity.   | The label means the **input image** is synthetic. The standard helper does not inject recognition for this filename; it requests only deterministic translation, so the normal journey uses live Apple Vision. The screenshot alone, without launch arguments or a result artifact, cannot prove that this particular capture did. [launch helper](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L5221-L5236)                                                                                                                                                                                                                     |

The fixture PNGs themselves are checked in only for DEBUG and independently
pinned as `f7eaa0…abf4` (horizontal) and `ff2a1f…7882` (vertical). The screen
capture hashes above identify the larger 3456×2234 desktop screenshots, not the
fixture bytes.

The reviewed #249 evidence further separates the layers: injected vertical text
and the literal boxes for `日本語` and `読む` were correct, while custom
cross-observation grouping had historically synthesized false `読本`; contextual
`いる` and bare `静` were correctly left unresolved because several dictionary
identities remained possible. [#249 handoff](https://github.com/serpcompany/zenbujapanese-monorepo/issues/249#issuecomment-5518329330)

### Same-fixture comparison status

No current Nihongo 1.34.4 app run was possible, and no current cross-app timing,
memory, network, or accessibility comparison is claimed. Read-only
`devicectl list devices` found both recorded phones unavailable. The required
`device info apps --include-all-apps` call for each UUID then failed with
CoreDevice error 1000 (“specified device was not found”), so the exact bundle
and version could not be confirmed and no app was launched. The repository's
reference-authority policy requires that identity preflight before replay; the
old dossier must not be relabeled as current evidence.

| Layer                   | Zenbu exact iOS 26.0.1 empirical seed                                                                                                                                                   | Historical Nihongo 1.34.3 same-fixture evidence                                                                                                  | Current Nihongo 1.34.4 public/access evidence                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Horizontal transcript   | Current `VNRecognizeTextRequest` and new `RecognizeDocumentsRequest` both returned every authored target string exactly; normalized target CER `0.000`.                                 | Clear/noisy fixtures produced materially similar Japanese highlights; exact transcript serialization and executed provider were not established. | Blocked: physical inventory unavailable.                                                        |
| Vertical transcript     | Current request returned `0/4` target lines (target CER `1.000`); the document request returned exact `4/4` (CER `0.000`). The attached screen itself uses injected observations.       | Fixture was recognized sufficiently to expose Japanese highlights.                                                                               | Blocked: physical inventory unavailable.                                                        |
| Reading order           | Document lines were exact horizontal top-to-bottom; vertical lines were exact right-to-left columns with `.topToBottom` direction.                                                      | A cross-column selectable token showed that learner-visible grouping did not preserve intended column order.                                     | Unknown.                                                                                        |
| Boxes/polygons          | Current request supplied line/character boxes only for recognized horizontal text; document request supplied a quadrilateral for every target line. Independent polygon IoU is pending. | Recognized highlights were visible, but provider geometry versus app grouping was not separable.                                                 | Unknown.                                                                                        |
| Vertical layout         | Document request recovered four non-crossing column lines. It did not produce Japanese words; the custom analyzer remains necessary to replace.                                         | Same fixture visibly created a cross-column token, so the reference is not a vertical-layout oracle.                                             | Developer marketing says Photo Lookup works on photos; no current vertical benchmark was found. |
| Morphological tokens    | Four adjudicated anchors: current custom analyzer `1/4`, Apple word boundaries `3/4` with no lemma, Sudachi-small `3/4`, Sudachi-core `4/4`.                                            | Tappable word/short-phrase behavior observed; parser not disclosed.                                                                              | Parser not disclosed.                                                                           |
| Dictionary links        | Current analyzer produced three contextually wrong links in four anchors; `いる` ambiguity still abstained correctly.                                                                   | Tap-to-gloss/Word Detail observed, but provider IDs and selection policy unknown.                                                                | Official site promises tap-to-lookup; implementation remains unknown.                           |
| Latency/offline/privacy | Simulator single-run calls were about 1.10–1.31 seconds; not physical-device performance. Both Apple requests remained on-device.                                                       | Connected one-run observations; executed provider was not identified.                                                                            | Public privacy policy verifies photo upload to selected Google Cloud Vision or OCR.space.       |
| Accessibility           | Existing controls remain; the research probe did not change or rerun UI/AX journeys.                                                                                                    | Historical dossier does not authorize a current accessibility claim.                                                                             | App Store says the developer has not indicated supported accessibility features.                |

The proper next comparison is the independent benchmark below, followed by one
identity-preflighted current Nihongo run only if the owner still wants reference
behavior evidence. Nihongo's cloud output may be compared on redistributable
benchmark images, but neither its output nor its UI becomes Zenbu's ground truth.

## Current pipeline audit

| Current component or algorithm                                                                                      | Classification                            | Disposition                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Image copy/limits, orientation, cancellation, app-owned page/session state                                          | Necessary app-specific adapter/policy     | Retain and benchmark transforms.                                                                       |
| Apple Vision request and observation adapter                                                                        | Thin integration around proven technology | Retain as OCR baseline; version and benchmark it.                                                      |
| DEBUG recognition fixtures and fixed observations                                                                   | Fixture/test-only behavior                | Retain as deterministic composition tests, never OCR-quality evidence.                                 |
| Cross-observation two-ideograph pairing, equal-slice boxes, aspect-ratio vertical inference, missing-range fallback | Replaceable custom implementation         | Remove from a production candidate; consume real provider geometry or expose an honest coarser region. |
| Eight-character greedy dictionary scan, particle list, and three deinflection rules                                 | Replaceable custom implementation         | Replace with established Japanese Language Technology after the benchmark/owner gate.                  |
| Exact app-owned dictionary identity, ambiguity abstention, overlay selection, gloss, navigation, Encounter Media    | Necessary app-specific adapter/policy     | Retain, fed by typed OCR/analyzer evidence.                                                            |
| Vision still-image reading order beyond the two-fixture seed and across OS revisions                                | Unknown pending evidence                  | Expand the benchmark; do not generalize one exact run.                                                 |

### Acquisition and preprocessing

- Files are copied only after byte and pixel bounds are checked. Camera and
  Photo Library inputs are normalized to an upright JPEG capped at 4096 pixels;
  arbitrary Files input retains its original encoded bytes and EXIF orientation.
  [asset model](../../apps/ios/Modules/Sources/SearchExperience/ImageTextModels.swift),
  [source pickers](../../apps/ios/Modules/Sources/SearchExperience/ImageSourcePickers.swift)
- The live recognizer reads ImageIO orientation and passes it to Vision. This is
  a necessary thin platform adapter, not a custom OCR algorithm.
  [recognizer lines 60-93](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextRecognitionClient.swift#L60-L93)
- Zenbu does not currently deskew, dewarp, crop to detected document bounds, or
  enhance contrast. Whether any transformation helps must be benchmarked; it
  must not be applied blindly because a transform also changes all polygons.

Classification: **necessary app-specific policy plus thin Apple integration**.

### OCR and reading order

- Live OCR is Apple's `VNRecognizeTextRequest` at `.accurate`, prioritized for
  `ja-JP` and `en-US`, with language correction. When the first pass contains no
  Japanese, Zenbu retries Japanese-only without language correction and with a
  smaller minimum text height. It retains only the top candidate, observation
  rectangle, confidence, and per-character bounding boxes.
  [recognizer lines 69-128](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextRecognitionClient.swift#L69-L128)
- The array returned by Vision is preserved and later joined with newlines. The
  current code does not own or verify an explicit reading-order graph.
  [flow lines 50-89](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextFlowModel.swift#L50-L89)
- Apple documents that `VNRecognizedText.boundingBox(for:)` calculates a box for
  a character range, matching the current evidence capture. It does not document
  a Japanese morphology contract. [Apple `VNRecognizedText`](https://developer.apple.com/documentation/vision/vnrecognizedtext)

Classification: **established platform OCR behind a good capability seam**.
The empirical seed establishes one real vertical failure in the current request
and one strong native document-request replacement. Broader photo accuracy,
polygon IoU, revision/OS drift, device performance, and holdout behavior remain
unmeasured—not the existence of an OCR library.

### Geometry and cross-observation grouping

Zenbu currently owns three fragile algorithms after OCR:

1. It splits every observation into ideograph units. Where Vision has no exact
   character box, it divides the line rectangle into equal horizontal or
   vertical slices; “vertical” means only `height > width × 1.5`.
2. It searches ideographs in **different** observations for a nearby neighbor
   using fixed `0.25` normalized gaps and alignment ratios, concatenates the two
   characters, and keeps the pair if a dictionary entry exists.
3. It maps an analyzed token back to the observation by substring search; if the
   surface is not found, it fabricates a range from the current offset. It then
   unions character boxes or proportionally slices the observation rectangle.

[current grouping and geometry](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextFlowModel.swift#L142-L305)

Classification: **replaceable custom implementation**. A dictionary hit cannot
prove that two nearby characters belong to one word, and equal-width/height
slicing is not recognition evidence. These algorithms directly explain false
cross-column words and empty-looking or oversized boxes in injected fixtures.

The final Vision-to-SwiftUI transform flips the normalized Y axis and applies an
aspect-fit rectangle. That narrow transform is appropriate for an un-cropped,
axis-aligned image, but it should be represented and tested as a composed
transform if deskew, perspective correction, crop, or quadrilateral regions are
introduced. [canvas transform](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextFlowView.swift#L276-L293)

### Japanese Text Analysis

The current `JapaneseTextAnalyzer` is not an established morphological analyzer.
It:

- scans Japanese runs using a greedy longest dictionary-form match capped at
  eight Swift characters;
- reserves highlighted forms as an app-specific correction;
- performs repeated exact dictionary queries while caching by surface;
- recognizes only `して → する`, `きて/来て → くる/来る`, and a generic
  `…て → …る` deinflection;
- consumes an ambiguous longest surface but attaches no entry.

[current analyzer](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/JapaneseTextAnalysisClient.swift#L153-L314)

The `characterFallback` also hand-writes a particle-prefix list and otherwise
splits Japanese into individual characters.
[fallback](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/JapaneseTextAnalysisClient.swift#L110-L150)

Classification: **replaceable custom tokenizer/deinflector**. Preserving an
already selected entry's forms and failing unresolved identity closed are useful
app-owned policies; finding boundaries, lemmas, readings, and POS should move to
established Language Technology.

### Dictionary identity, overlay, and navigation

- `entriesMatchingForm` returns app-owned Language Reference Data. Choosing an
  entry only when the candidate family has one identity, and retaining no entry
  when several exact identities remain, is necessary app-specific policy.
- `ImageTextCanvas` is a purpose-specific overlay accepted by #218. It converts
  regions into highlight buttons, retains a selected gloss, opens exact Word
  Detail, and keeps the Image Text session/Encounter Media navigation contract.
  [canvas](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextFlowView.swift#L194-L273)
- The model/package currently has no third-party OCR or morphology dependency;
  the Swift package links only system SQLite. [package](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Package.swift)

Classification: **retain the app-owned identity/navigation policy and custom
learning overlay; replace the language and geometry inference feeding them**.

## Empirical seed on the two licensed fixtures

The issue's two purpose-created fixtures and their pre-existing manifest supply
independent text truth: exact visible strings, orientation class, immutable PNG
SHA-256, purpose, generation method, and privacy status. The expected text was
not copied from any candidate output.
[fixture manifest](../clone-discovery/nihongo/fixtures/image-text/manifest.json)

### Environment and metric boundary

- Xcode 26.0 (`17A324`), iOS 26.0.1 Simulator, iPhone 17 Pro Max
  `D6C3072F-1C9B-43A4-9C7D-77F8F19A9CA5`.
- Horizontal PNG `f7eaa0…abf4`; vertical PNG `ff2a1f…7882`.
- **Target CER** compares the manifest's four authored content lines after
  removing whitespace that only separates the three mixed-content fields on the
  final horizontal line. The visible synthetic-fixture footer is excluded before
  execution by the manifest target definition, not after inspecting output.
- **Line recall** is exact recovered authored lines divided by four. Footer text
  is real visible text, but not one of the four Japanese-learning target lines.
- Times are one instrumented framework call on a Simulator, not physical-device
  p50/p95 performance. Polygon IoU is not claimed because the old manifest has no
  independently annotated glyph/line polygons.

The probe temporarily called the checked-in clients from the existing unit test
host, printed typed results, and was removed completely after each run. The
accepted report commit contains no probe/test or production change.

### OCR and document-layout result

| Candidate/configuration                                                                                                                  | Horizontal                                                                                                                                                                     | Vertical                                                                                                                                         | Call time                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Current `ImageTextRecognitionClient.live`: `VNRecognizeTextRequest`, accurate, `ja-JP` + `en-US`, correction on, current fallback policy | Exact 4/4 lines, target CER `0.000`, line recall `1.000`; five observations including the real footer; non-space target characters had range boxes; order matched the fixture. | Footer only; exact 0/4 target lines, target CER `1.000`, line recall `0.000`.                                                                    | 1240.206 ms horizontal; 1105.297 ms vertical. |
| Forced current Japanese-only retry: accurate, `ja-JP`, correction off, minimum height `0.005`                                            | Not rerun; current primary was already exact.                                                                                                                                  | Footer only; exact 0/4, target CER `1.000`, line recall `0.000`.                                                                                 | 1100.285 ms vertical.                         |
| iOS 26 `RecognizeDocumentsRequest`, revision 1, `ja-JP` + `en-US`, correction on, minimum height `0.005`                                 | Exact 4/4, CER `0.000`, recall `1.000`; five ordered left-to-right line quadrilaterals including footer.                                                                       | Exact 4/4, CER `0.000`, recall `1.000`; four `.topToBottom` quadrilaterals in correct right-to-left column order, plus the left-to-right footer. | 1203.818 ms horizontal; 1096.775 ms vertical. |

Exact document-request vertical line evidence, in returned order and normalized
`topLeft; topRight; bottomRight; bottomLeft` coordinates:

| Line                 | Direction     | Quadrilateral                                                                |
| -------------------- | ------------- | ---------------------------------------------------------------------------- |
| `春の朝、静かな庭を` | `topToBottom` | `0.812016,0.925872; 0.812016,0.375000; 0.717054,0.375000; 0.717054,0.925872` |
| `蝶々が飛んでいる。` | `topToBottom` | `0.685082,0.925117; 0.659762,0.358592; 0.572294,0.360791; 0.597613,0.927316` |
| `日本語`             | `topToBottom` | `0.484902,0.920057; 0.457404,0.742695; 0.381408,0.749323; 0.408905,0.926684` |
| `を読む。`           | `topToBottom` | `0.334761,0.921936; 0.317396,0.669281; 0.246001,0.672041; 0.263365,0.924696` |

The document request's transcript grouped the first two vertical columns into
one paragraph and the last two into another, while its ordered `lines` retained
all four exact boundaries. Its optional `words` output contained only the Latin
footer tokens (`IMG-FIXTURE-002`, bullet, `synthetic`, `vertical`, `layout`) and
no Japanese tokens. That exactly supports the layer split: the native API can
own OCR, line geometry, direction, and reading order; established Japanese
morphology must still own word boundaries.

Exact local result bundles:

- `/tmp/Issue250VisionSeed2.xcresult`: live current request, 1/1, 2.349 s test.
- `/tmp/Issue250VisionJapaneseOnlySeed.xcresult`: forced Japanese-only request,
  1/1, 1.110 s.
- `/tmp/Issue250DocumentRecognitionWordsSeed.xcresult`: document request with
  exact transcripts, directions, quadrilaterals, and word inventory, 1/1,
  2.341 s.

The exact focused invocations were:

```sh
issue250_destination='platform=iOS Simulator,id=D6C3072F-1C9B-43A4-9C7D-77F8F19A9CA5'

xcodebuild test \
  -project apps/ios/ZenbuJapanese.xcodeproj \
  -scheme ZenbuJapanese -testPlan ZenbuPR \
  -destination "$issue250_destination" \
  -only-testing:ZenbuJapaneseTests/ImageTextFlowModelTests/testIssue250ResearchProbeUsesLiveVisionOnBothFixtures \
  -resultBundlePath /tmp/Issue250VisionSeed2.xcresult

xcodebuild test \
  -project apps/ios/ZenbuJapanese.xcodeproj \
  -scheme ZenbuJapanese -testPlan ZenbuPR \
  -destination "$issue250_destination" \
  -only-testing:ZenbuJapaneseTests/ImageTextFlowModelTests/testIssue250ResearchProbeForcesJapaneseOnlyVisionPass \
  -resultBundlePath /tmp/Issue250VisionJapaneseOnlySeed.xcresult

xcodebuild test \
  -project apps/ios/ZenbuJapanese.xcodeproj \
  -scheme ZenbuJapanese -testPlan ZenbuPR \
  -destination "$issue250_destination" \
  -only-testing:ZenbuJapaneseTests/ImageTextFlowModelTests/testIssue250ResearchProbeComparesDocumentRecognition \
  -resultBundlePath /tmp/Issue250DocumentRecognitionWordsSeed.xcresult

xcodebuild test \
  -project apps/ios/ZenbuJapanese.xcodeproj \
  -scheme ZenbuJapanese -testPlan ZenbuPR \
  -destination "$issue250_destination" \
  -only-testing:ZenbuJapaneseTests/ImageTextFlowModelTests/testIssue250ResearchProbeComparesCurrentAndAppleTokenBoundaries \
  -resultBundlePath /tmp/Issue250TokenizerSeed.xcresult
```

The temporary method bodies are reproduced in the “Probe source” appendix so
these commands are executable after applying that isolated test-only snippet.

The existing fallback gate has a separate real defect: Vision recognized the
footer bullet as katakana middle dot `・` (U+30FB), and Zenbu treats every scalar
in U+3040–U+30FF as Japanese. The punctuation therefore suppresses the
Japanese-only retry even when no Japanese letter/ideograph was found.
[current gate](https://github.com/serpcompany/zenbujapanese-monorepo/blob/f01796825736d084c2ed4a65bde490b3e8d55692/apps/ios/Modules/Sources/SearchExperience/ImageTextRecognitionClient.swift#L138-L151)
The forced retry still recovered 0/4 vertical lines, so correcting the gate is
necessary honest behavior but not a vertical-recognition solution.

### Token and dictionary-identity seed

Four context anchors were adjudicated from the purpose-created source text and
the existing app-owned Language Reference Data before comparing candidates:

| Anchor           | Independent expected evidence                                          | Current custom analyzer                              | Apple `NLTokenizer`                   | Sudachi 0.6.11 + small 20260723      | Sudachi 0.6.11 + core 20260723                  |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| `日本語`         | One lexical token/base `日本語`                                        | Correct `日本語`                                     | Splits `日本` then `語`; no base form | Splits `日本` then `語`              | Correct `日本語` → `日本語`, reading `ニホンゴ` |
| `今日は静か…`    | `今日` then `は`; `今日` means today, not greeting `今日は/こんにちは` | One `今日は` linked to greeting reading `こんにちは` | Correct boundary; no base form        | Correct boundary/base                | Correct boundary/base                           |
| `問題を解いて…`  | `解い` then `て`; verb base `解く`; never noun `解` plus `射手/いて`   | `解` linked as noun `かい`; `いて` linked to `射手`  | Correct boundary; no base form        | Correct boundary and `解い` → `解く` | Correct boundary and `解い` → `解く`            |
| `友達と話します` | `話し` then `ます`; verb base `話す`, not noun `話/はなし`             | Boundary present but `話し` links to noun `話`       | Correct boundary; no base form        | Correct boundary and `話し` → `話す` | Correct boundary and `話し` → `話す`            |

On this deliberately tiny four-anchor seed:

- current custom exact boundary + correct base/identity evidence: **1/4**;
- Apple word-boundary evidence: **3/4**, with base form unavailable;
- Sudachi-small exact boundary + base form: **3/4**;
- Sudachi-core exact boundary + base form: **4/4**.

These are regression anchors, not population accuracy or a substitute for token
precision/recall/F1 on the designed corpus. They nevertheless reject both the
current custom analyzer and Sudachi-small as an immediate default. Apple also
kept `蝶々`, `いる`, and `読む` as useful whole word spans, while splitting
`日本語`; Sudachi core supplied the corresponding readings/base forms.
Contextual `いる` still has several app-owned dictionary identities, so every
candidate must preserve the existing correct abstention instead of converting a
morphological token into a guessed `LanguageReferenceID`.

The Apple/current comparison is retained in
`/tmp/Issue250TokenizerSeed.xcresult` (1/1, 0.275 s). Sudachi was run in an
isolated temporary environment with exact versions and all A/B/C modes; the
fixture anchors were invariant across modes:

```sh
python3 -m venv /tmp/issue250-sudachi-venv
/tmp/issue250-sudachi-venv/bin/pip install \
  'sudachipy==0.6.11' \
  'sudachidict-small==20260723' \
  'sudachidict-core==20260723'

/tmp/issue250-sudachi-venv/bin/python - <<'PY'
from sudachipy import dictionary, tokenizer

samples = [
    "日本語の勉強",
    "今日は静かな公園で蝶々を見た。",
    "問題を解いてから、友達と話します。",
    "東京駅 12:30 Platform 4",
    "春の朝、静かな庭を",
    "蝶々が飛んでいる。",
    "日本語",
    "を読む。",
]
for edition in ("small", "core"):
    analyzer = dictionary.Dictionary(dict=edition).create()
    for mode in (
        tokenizer.Tokenizer.SplitMode.A,
        tokenizer.Tokenizer.SplitMode.B,
        tokenizer.Tokenizer.SplitMode.C,
    ):
        for text in samples:
            result = analyzer.tokenize(text, mode)
            fields = [
                (item.surface(), item.dictionary_form(),
                 item.reading_form(), item.part_of_speech())
                for item in result
            ]
            print(edition, mode, text, fields, sep="\t")
PY
```

No Sudachi code, dictionary, output, or provider ID was copied into the app.

### Current Nihongo access result

The lawful current-app replay was exhausted without bypassing the repository's
authority rule:

1. `xcrun devicectl list devices --timeout 10` listed the recorded iPhone 17 Pro
   Max and required iPhone 14 Pro Max as **unavailable**.
2. `xcrun devicectl device info apps --include-all-apps --device <recorded-id>
--timeout 10` was attempted for each and exited 1 with CoreDevice error 1000,
   “The specified device was not found.”
3. Therefore exact bundle `com.serpentisei.studyjapanese`, version 1.34.4, and
   Zenbu candidate coexistence could not be confirmed. No app was launched,
   screenshot captured, network intercepted, or device/app state changed.

This is an access blocker, not evidence that Nihongo is absent or evidence about
its current same-image output. #250 must remain open/ready-for-human until a
current identity-preflighted replay is available or the owner accepts the public
provider evidence plus Zenbu's independent benchmark as the decision authority.

## Migaku: what is relevant and what is not

Migaku's current publisher listing makes the architectural split explicit:
interactive **text/subtitles** are analyzed across supported media, while
Text Recognition/OCR is separately listed as iOS/Android camera/photo behavior.
[Migaku Chrome Web Store listing](https://chromewebstore.google.com/detail/migaku-really-learn-langu/lkhiljgmbeecmljiogckofcalncmfnfo)

Verified from Migaku-owned public material:

- Migaku accepts `.srt` and `.vtt` subtitle imports on supported video sites,
  and its local player extracts embedded subtitle/audio tracks or generates
  subtitles from audio. [Migaku changelog](https://migaku.com/blog/changelog)
- It makes subtitle words interactive, supports word-status/highlight overlays,
  Japanese furigana and pitch display, dictionary lookup, and public product
  claims for conjugated-form lookup.
- A screenshot captured for a flashcard is card media; it is not evidence that
  video subtitle pixels were OCR input.

Not verified:

- whether YouTube/Netflix captions arrive through DOM nodes, `TextTrack`, WebVTT
  network responses, a platform API, or site-specific combinations;
- Migaku's Japanese tokenizer, morphological analyzer, inflection engine,
  dictionary-link algorithm, or dictionary provenance for parsing;
- frame-by-frame OCR as the normal hosted-video path.

Therefore Migaku is a useful **learner-visible benchmark** for token boundaries,
inflected lookup, word highlighting, and subtitle interaction. It is not an OCR
architecture reference and supplies no reusable component/data license. Its
terms prohibit reverse engineering, unauthorized crawling/scraping, and access
to private or proprietary data. [Migaku terms](https://migaku.com/terms)

## Nihongo reference app

Current first-party/public evidence is conclusive about the OCR provider:

- Nihongo 1.34.4's App Store listing describes Photo Lookup as using **Google
  Cloud Vision**, says the app is an offline dictionary and reading assistant,
  and lists a 497 MB download with iOS 17 minimum. The “offline” description
  must not be generalized to Photo Lookup because the same listing explicitly
  identifies a cloud OCR service. [current App Store listing](https://apps.apple.com/us/app/japanese-dictionary-nihongo/id881697245)
- Nihongo's privacy policy, updated 2026-05-25, says a photo is transmitted to a
  third-party OCR service and the learner can choose Google Cloud Vision or
  OCR.space in Settings. It also documents Firebase analytics/diagnostics.
  [Nihongo privacy policy](https://nihongo-app.com/privacy_policy.html)
- The developer's site verifies the public journey: take a picture, then tap a
  recognized word; pasted Clippings similarly turn words into definition links.
  It does not disclose the tokenizer or geometry implementation.
  [Nihongo product site](https://nihongo-app.com/)
- The developer's 2020 public demo shows overlays and tap-to-gloss on signs,
  vertical book text, and manga. It is useful historical UX evidence, not proof
  of current provider parameters, accuracy, or internals.
  [official Photo Lookup demo](https://www.youtube.com/watch?v=ffRxPyc9K8A)

The historical lawful black-box dossier in this repository recorded equivalent
horizontal results, a real vertical cross-column error, and an observable
provider picker. It is version 1.34.3 evidence, not current 1.34.4 acceptance,
and did not reveal the grouping implementation.
[reference-authority boundary](../clone-discovery/nihongo/REFERENCE-AUTHORITY.md)

Nihongo therefore demonstrates a polished cloud-backed learner workflow, not a
better on-device component Zenbu can reuse. Google Cloud Vision is a legitimate
benchmark or explicit opt-in alternative, but adopting it would reverse Zenbu's
current no-image-upload privacy contract and add network failure, recurring
cost, consent, retention, and vendor credentials. Google's current docs list
Japanese as supported and regularly evaluated, charge per image after the free
tier, and say synchronous images are processed in memory rather than persisted
to disk while request metadata is temporarily logged.
[language support](https://cloud.google.com/vision/docs/languages),
[pricing](https://cloud.google.com/vision/pricing),
[data use](https://cloud.google.com/vision/docs/data-usage)

## OCR and layout candidates

Unknown means the owner has not published the requested evidence. Marketing or
metrics from different private evaluation sets are not treated as comparative
Zenbu accuracy.

| Candidate                                                  | Current/maintenance evidence                                                                                                                                               | Japanese and vertical evidence                                                                                                                                                                               | License/provenance                                                                                                 | iOS, size, runtime                                                                                                                                                                                                                              | Privacy/determinism                                                                                                                                             | Verdict                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Vision `RecognizeTextRequest`**                    | Platform API already shipped and used by Zenbu; exact behavior follows the OS and request revision.                                                                        | `ja-JP` works in the current app. The seed returned exact horizontal text/boxes but zero authored vertical lines. Apple publishes no vertical-Japanese accuracy or reading-order guarantee for this request. | Apple platform component; model/training data are not redistributable app assets and are not publicly enumerated.  | Native Swift, no bundled model, iOS 26 target already proven; seed Simulator calls were about 1.1–1.2 seconds, not device performance.                                                                                                          | On-device. Output may change with OS/revision, so record OS/revision and hash repeated results.                                                                 | **Retain as the legacy/horizontal control, not the preferred vertical adapter.**                                                                                                                                                                                                                                                                    |
| **Apple Vision `RecognizeDocumentsRequest`**               | New iOS 26 Vision API. Apple documents hierarchical document, paragraph, line, table, list, transcript, and bounding-region output.                                        | 26 recognition languages; exact seed recovered 4/4 vertical lines, top-to-bottom direction, right-to-left order, and quadrilaterals. Japanese word extraction remained unavailable as documented.            | Apple platform component.                                                                                          | Native Swift, no bundled model, matches Zenbu's iOS 26 floor; seed Simulator calls were about 1.1–1.3 seconds, not device performance.                                                                                                          | Apple says Vision APIs run entirely on-device. Revision drift still applies.                                                                                    | **Leading OCR/layout production prototype; pair with separate Japanese morphology.** [Apple](https://developer.apple.com/videos/play/wwdc2025/272/)                                                                                                                                                                                                 |
| **VisionKit `ImageAnalyzer` + `ImageAnalysisInteraction`** | Apple's still-image Live Text surface supplies system text selection and actions over an analyzed image.                                                                   | Japanese is part of Apple's Live Text language family, but no current vertical/manga accuracy or exact single-tap word-boundary contract is published.                                                       | Apple platform component.                                                                                          | Native image interaction, zero bundled model; a UIKit bridge is needed in the current SwiftUI canvas.                                                                                                                                           | On-device. Selection behavior follows the OS.                                                                                                                   | **Prototype as the Apple-native still-image interaction challenger.** It may remove custom overlay geometry, but must prove exact selected text, Zenbu lookup routing, accessibility, and Encounter Media behavior. [Apple](https://developer.apple.com/documentation/visionkit/enabling-live-text-interactions-with-images)                        |
| **VisionKit `DataScannerViewController` / Live Text**      | Current Apple camera scanning UI; supplies system guidance, highlights, tap handling, and recognized items in reading order.                                               | Supported-language list is runtime-queryable. No published vertical-Japanese quality result.                                                                                                                 | Apple platform component.                                                                                          | On-device live camera only, requires supported hardware; does not solve existing imported Files/Photos or persistent Image Text result.                                                                                                         | On-device and system-owned interaction.                                                                                                                         | **Evaluate only for a future live-camera mode.** Do not replace still-image flow with it. [Apple](https://developer.apple.com/documentation/visionkit/scanning-data-with-the-camera)                                                                                                                                                                |
| **PaddleOCR PP-OCRv6/v5**                                  | Apache-2.0 project with current v3.7.0 release (2026-06-11). Current docs report unified Japanese and PP-OCRv5 metrics for Japanese/vertical scenarios.                    | Explicit Japanese, scene text, rotation/distortion, and vertical-text training/evaluation. Published internal-set values are not comparable to Zenbu.                                                        | Apache-2.0 code; exact model cards/training-data and every transitive notice still require pin review.             | Mobile recognizer evidence exists; Paddle-Lite exposes C++ iOS/Metal packages, but its latest public release is a 2024 release candidate and no Swift API is supplied. Published model size/latency excludes a proven complete iPhone pipeline. | Can be local/offline; deterministic only with pinned models/runtime.                                                                                            | **Serious benchmark challenger, not production-ready for this Swift app without an iOS integration/size proof.** [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [model evidence](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md), [Paddle-Lite](https://github.com/PaddlePaddle/Paddle-Lite) |
| **Tesseract 5.5.3 + official `jpn`/`jpn_vert`**            | Maintained Apache-2.0 C++ engine; 5.5.3 released 2026-07-24. Official fast/best model repositories are older but explicitly versioned.                                     | Separate Japanese vertical language/script models and orientation/layout support.                                                                                                                            | Apache-2.0 engine and trained data; Leptonica is BSD-2-Clause.                                                     | No maintained official Swift package. Current fast horizontal+vertical data are about 5.3 MB combined; best are about 27.3 MB combined, before engine/dependencies. iPhone latency/memory unknown.                                              | Fully offline and pin-able; exact same-platform and cross-platform repeatability still needs measured output hashes.                                            | **Useful small vertical control in the benchmark; not the leading production engine.** [Tesseract](https://github.com/tesseract-ocr/tesseract), [vertical models](https://github.com/tesseract-ocr/tesseract/blob/main/doc/tesseract.1.asc)                                                                                                         |
| **NDLOCR-Lite 1.2.3**                                      | Current National Diet Library project; 1.2.3 released 2026-06-09. Its architecture explicitly separates layout recognition, string recognition, and reading-order sorting. | Purpose-built for Japanese horizontal/vertical documents; publishes printed-text F-scores and 2026 handwritten CER split by horizontal/vertical.                                                             | Official source/model repository is CC BY 4.0; transitive ONNX/runtime licenses and attribution require inventory. | Python/ONNX desktop pipeline, no official iOS/Swift integration. Four current ONNX files total about 157 MB and release archives are about 251–308 MB; these are not iPhone runtime evidence.                                                   | Local/offline and pin-able; exact repeatability must still be measured.                                                                                         | **Best independent Japanese layout/order benchmark; optional model-pack challenger only after real iPhone feasibility proof.** [NDL](https://github.com/ndl-lab/ndlocr-lite), [release](https://github.com/ndl-lab/ndlocr-lite/releases/tag/1.2.3)                                                                                                  |
| **manga-ocr 0.1.16**                                       | Maintained Apache-2.0 project; latest release 2026-07-19.                                                                                                                  | Explicitly targets vertical/horizontal manga, furigana, text over images, fonts, and low-quality scans.                                                                                                      | Apache-2.0 code/model card; model acknowledges Manga109-s and CC-100 training sources.                             | Python/PyTorch/Transformers, approximately 400 MB model, no iOS/Swift integration. It returns recognized text rather than the token polygons required by the overlay.                                                                           | Local/offline when downloaded, but its own docs warn it may invent text on empty images.                                                                        | **Reject for production Image Text; use only as a recognition-quality comparison on manga crops.** [project](https://github.com/kha-white/manga-ocr), [model card](https://huggingface.co/kha-white/manga-ocr-base)                                                                                                                                 |
| **Google Cloud Vision**                                    | Managed current service; Japanese is supported/regularly evaluated. Current Nihongo uses it.                                                                               | Structured pages/blocks/paragraphs/words/boxes; no first-party vertical-Japanese benchmark found.                                                                                                            | Proprietary service; API output is not a redistributable model.                                                    | Simple HTTPS integration but requires credentials/backend protection and network. $1.50/1,000 images for the main paid tier at consultation time.                                                                                               | Images leave device; synchronous content is not persisted to disk per current policy, but metadata is logged. Service/model can change outside the app release. | **Only an explicit opt-in cloud option after owner/privacy/cost decision; never a silent fallback.**                                                                                                                                                                                                                                                |

No candidate wins every layer. `RecognizeDocumentsRequest` is the seed winner
for native OCR/layout and still must face the complete independent corpus;
Sudachi/Apple Natural Language must separately compete on morphology and
app-owned identity.

## Japanese morphology candidates

| Candidate                                                             | Evidence and outputs                                                                                                                                                                                                                                                                                                                                                              | Footprint/integration                                                                                                                                                                                                                      | Determinism/license                                                                                                                            | Verdict                                                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple `NLTokenizer` / `NLTagger`**                                  | Apple explicitly documents word tokenization for scripts such as Japanese, and `NLTagger` can expose POS and a lemma “if known.” Available tag schemes must be queried per language/device. [tokenizer](https://developer.apple.com/documentation/naturallanguage/tokenizing-natural-language-text), [tagger](https://developer.apple.com/documentation/naturallanguage/nltagger) | Native Swift, zero bundled model, no FFI. Exact Japanese lemma/reading/POS coverage is undocumented.                                                                                                                                       | On-device; model assets and outputs may vary by OS.                                                                                            | **Mandatory zero-cost control. Adopt only if the independent token/lemma/link benchmark passes; do not patch failures with another custom deinflector.** |
| **Sudachi 0.6.11 + SudachiDict 20260723 through sudachi-swift 0.1.1** | Established Works Applications analyzer supplies multiple split modes, ranges, surface, normalized/dictionary forms, readings, POS, and OOV evidence. The community Swift binding pins upstream and exposes those fields via UniFFI.                                                                                                                                              | iOS 17+, prebuilt arm64 XCFramework. The v0.1.1 XCFramework archive is 29.5 MB before app slicing; binding docs report approximately 40 MB installed for `small` and 207 MB for `core`. Measured M-series timings are not iPhone evidence. | Apache-2.0 core/binding; SudachiDict includes UniDic/other notices. The engine, dictionary, split policy, and golden output can all be pinned. | **Core is the leading morphology prototype: 4/4 seed anchors. Small is rejected as the default after splitting `日本語`.**                               |
| **Lindera 5.1.0 + UniDic**                                            | Current Rust morphology library with base-form/reading filters and prebuilt dictionaries; active 2026 release line.                                                                                                                                                                                                                                                               | No official Swift package; a new C/UniFFI bridge would duplicate work already available in sudachi-swift. Released Apple binary is a CLI, not an iOS SDK.                                                                                  | MIT engine; dictionaries have separate licenses. Pin-able/offline.                                                                             | **Reserve challenger if Sudachi fails performance/quality or binding review.** [Lindera](https://github.com/lindera/lindera)                             |
| **MeCab/older Swift wrappers**                                        | Mature morphology API, but common packaged IPADic is old and wrappers have mixed maintenance.                                                                                                                                                                                                                                                                                     | C/C++ bridge and dictionary packaging.                                                                                                                                                                                                     | Engine/dictionary notices vary; output pin-able.                                                                                               | **Do not adopt as the new default while the maintained Sudachi path exists.**                                                                            |

The Language Technology output is evidence, not canonical data. Zenbu must not
store Sudachi or Apple token IDs as `LanguageReferenceID`, and analyzer split
mode must be versioned as part of Japanese Text Analysis policy.

## Independent benchmark before adoption

Create one redistributable `JapaneseImageTextBenchmark/v1` under a separate
implementation ticket. Do not generate expected output from any candidate.

The empirical seed above executes two purpose-created fixtures and four
adjudicated morphology anchors. The complete 48-image corpus, independent
polygon annotations, holdout, p50/p95 device performance, memory, and candidate
breadth remain for the next benchmark phase. #250's complete benchmark and
production outcome therefore remains open after this report.

### Corpus

Use 48 images with immutable bytes, source/license records, and disjoint
development/holdout IDs:

- the five existing purpose-created fixtures, including the exact horizontal
  and vertical layouts in the screenshots;
- eight team-created ordinary phone photos: signs, packaging, menus, book pages,
  screens, perspective, rotation, glare, blur, and low contrast;
- eight horizontal dense/mixed layouts with kanji, kana, Latin, numbers, emoji,
  punctuation, and furigana;
- eight vertical right-to-left column layouts, including punctuation, ruby,
  multi-column boundaries, and tate-chu-yoko;
- six lawful subtitle frames plus the exact accompanying caption text/track;
- six team-created outlined/stylized text or speech-bubble crops;
- seven derived transform cases whose source image and exact transform matrix are
  retained, so expected polygons are transformed mechanically rather than
  re-annotated from a candidate.

Prefer team-owned captures/art, public-domain Japanese source material, and
freely redistributable fonts. Record consent and strip personal/location data.
Do not commit commercial manga, streaming frames, private photos, Migaku/Nihongo
assets, or proprietary captions merely because they are convenient.

### Ground truth

Two Japanese-proficient annotators independently author, then adjudicate:

- exact Unicode transcript per region and the normalized comparison form;
- quadrilateral line/region polygons in source-image coordinates;
- an explicit reading-order sequence/graph;
- character-offset token spans, surface, lemma/dictionary form, reading, POS,
  and ambiguity;
- expected app-owned `LanguageReferenceID` set, one chosen ID only where context
  supports it, or explicit ambiguous/no-match;
- source, author, license, fixture SHA-256, orientation, and transform matrix.

Keep 25% of IDs sealed as a holdout. Candidate tuning and threshold selection
use only the development set; final scoring runs once on the holdout.

### Metrics

Report overall plus horizontal/vertical/scene/subtitle/furigana strata:

1. **OCR:** raw and normalized character error rate (Levenshtein edits/reference
   characters), exact-region transcript rate, and hallucinated-character count.
2. **Detection/geometry:** polygon IoU with one-to-one assignment; precision,
   recall, and F1 at IoU 0.5 and 0.75; corner error after the full image-to-view
   transform; empty/displaced region count.
3. **Reading order:** exact sequence rate and pairwise precedence accuracy; do
   not score by array position alone where ground truth allows independent areas.
4. **Morphology:** character-offset token-boundary precision/recall/F1 plus
   lemma, reading, and POS exact accuracy. Score OCR-perfect transcript separately
   from end-to-end OCR output so OCR and tokenization errors are not conflated.
5. **Dictionary linking:** micro/macro precision and recall by app-owned ID,
   wrong-ID count, ambiguity abstention accuracy, and navigation round-trip.
   A ranked-first wrong homograph is a false positive, not partial credit.
6. **Product overlay:** region hit success, selected surface/gloss agreement,
   no overlapping unrelated hit targets, highlight/translation/share/Back/Close
   preservation, and explicit raw/unavailable state.
7. **Operational:** cold and warm p50/p95 latency, peak resident memory, energy
   sample, compressed download size, installed model size, app binary delta,
   first-use behavior, and eight repeated-output hashes per supported device/OS.
8. **Privacy/failure:** offline execution with networking denied; cancellation,
   memory warning, corrupt/missing model, unsupported language, and provider
   update behavior. Capture outbound hosts/bytes separately for any cloud trial.

Record the exact hardware, OS build, API/request revision, analyzer version,
dictionary version/checksum, model checksum, runtime, and build flags for every
row. A candidate cannot be called deterministic merely because one fixture
passes once.

## Adoption gate and owner options

The next ticket should expand the benchmark and build disposable provider
adapters, not replace production immediately. It should compare:

- current Apple `RecognizeTextRequest`;
- Apple `RecognizeDocumentsRequest`;
- Apple VisionKit `ImageAnalysisInteraction` over the same still images;
- one pinned NDL or PaddleOCR offline desktop/device-feasibility run;
- Tesseract `jpn` + `jpn_vert` as a small vertical control;
- Apple `NLTokenizer` and pinned Sudachi `core` on the same perfect transcripts;
  retain `small` only as the measured size/coverage control.

Production remains blocked on two focused owner decisions:

### 1. Pixel privacy

- **Option A — recommended:** Image Text remains entirely on-device. Cloud OCR
  may be evaluated offline against nonprivate benchmark images but is not shipped.
- **Option B:** add an explicit optional cloud provider. This requires a new
  privacy/product issue covering opt-in consent before upload, credential/backend
  design, provider/region/retention disclosure, recurring-cost limits, offline
  behavior, deletion, abuse controls, App Privacy, and a non-cloud fallback.

### 2. Download/install budget for Japanese Language Technology

- **Option A — recommended:** allow an optional, checksum-pinned SudachiDict
  `core` download (approximately 70 MB compressed/207 MB installed) after the app
  remains usable with honest raw text or measured Apple boundaries while the
  pack is absent. Show source/version/license, exclude the derived pack from
  backup, update atomically, and never silently change token semantics.
- **Option B:** bundle `core` for consistent first-run analysis at the cost of a
  substantially larger app plus the new binding binary.
- **Option C:** prohibit the pack and require Apple Natural Language alone. This
  loses base forms/readings and already splits `日本語`; accept only after the
  complete benchmark and an explicit product decision. Zenbu must not fill gaps
  with more hand-coded morphology.

Do not choose an NDL model pack, 400 MB manga-ocr model, cloud upload, or new
parser in the implementation agent by default. If the native document request
fails the broader vertical holdout or `core` exceeds the approved size budget,
return to the owner with the measured trade-off instead of writing another
geometry or morphology heuristic.

## Probe source

For an exact rerun, temporarily add `ImageIO`, `NaturalLanguage`, and `Vision`
imports to `ImageTextFlowModelTests.swift`, paste the following methods into its
existing `@MainActor ImageTextFlowModelTests`, run the exact commands above, and
then remove the probe. The methods use the existing independently pinned
`imageTextFixtureData` helper and production clients; they make no product
assertion and therefore must not become the final acceptance harness unchanged.

```swift
func testIssue250ResearchProbeUsesLiveVisionOnBothFixtures() async throws {
  for name in ["fixture-clear-horizontal.png", "fixture-vertical.png"] {
    let data = try imageTextFixtureData(named: name)
    let started = Date()
    let observations = try await ImageTextRecognitionClient.live.recognize(
      ImageTextAsset(name: name, data: data)
    )
    let milliseconds = Date().timeIntervalSince(started) * 1_000
    print("ISSUE250_VISION_BEGIN\t\(name)\t\(String(format: "%.3f", milliseconds))")
    for observation in observations {
      let box = observation.boundingBox
      let formattedBox = [box.minX, box.minY, box.width, box.height]
        .map { String(format: "%.6f", $0) }
        .joined(separator: ",")
      print(
        "ISSUE250_VISION_OBS\t\(observation.id)\t\(observation.text)\t"
          + "\(formattedBox)\t\(String(format: "%.6f", observation.confidence))\t"
          + "characterBoxes=\(observation.characterBoxes.filter { !$0.isNull }.count)"
      )
    }
    print("ISSUE250_VISION_END\t\(name)\tcount=\(observations.count)")
  }
}

func testIssue250ResearchProbeForcesJapaneseOnlyVisionPass() throws {
  let data = try imageTextFixtureData(named: "fixture-vertical.png")
  let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
  let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
  let rawOrientation = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
  let orientation = CGImagePropertyOrientation(rawValue: rawOrientation) ?? .up
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["ja-JP"]
  request.usesLanguageCorrection = false
  request.minimumTextHeight = 0.005
  let started = Date()
  try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
  let milliseconds = Date().timeIntervalSince(started) * 1_000
  print("ISSUE250_JA_ONLY_BEGIN\t\(String(format: "%.3f", milliseconds))")
  for (index, observation) in (request.results ?? []).enumerated() {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let box = observation.boundingBox
    let formattedBox = [box.minX, box.minY, box.width, box.height]
      .map { String(format: "%.6f", $0) }
      .joined(separator: ",")
    print(
      "ISSUE250_JA_ONLY_OBS\t\(index)\t\(candidate.string)\t\(formattedBox)\t"
        + "\(String(format: "%.6f", candidate.confidence))"
    )
  }
  print("ISSUE250_JA_ONLY_END\tcount=\((request.results ?? []).count)")
}

func testIssue250ResearchProbeComparesDocumentRecognition() async throws {
  for name in ["fixture-clear-horizontal.png", "fixture-vertical.png"] {
    let data = try imageTextFixtureData(named: name)
    var request = RecognizeDocumentsRequest()
    request.textRecognitionOptions.recognitionLanguages = [
      Locale.Language(identifier: "ja-JP"),
      Locale.Language(identifier: "en-US"),
    ]
    request.textRecognitionOptions.useLanguageCorrection = true
    request.textRecognitionOptions.minimumTextHeightFraction = 0.005
    let started = Date()
    let results = try await request.perform(on: data)
    let milliseconds = Date().timeIntervalSince(started) * 1_000
    print(
      "ISSUE250_DOCUMENT_BEGIN\t\(name)\t\(String(format: "%.3f", milliseconds))\t"
        + "documents=\(results.count)"
    )
    for result in results {
      print(
        "ISSUE250_DOCUMENT_TEXT\t\(result.document.text.transcript)\t"
          + "paragraphs=\(result.document.paragraphs.count)\t"
          + "lines=\(result.document.text.lines.count)\t"
          + "words=\(result.document.text.words?.map(\.transcript).joined(separator: "|") ?? "nil")"
      )
      for (index, line) in result.document.text.lines.enumerated() {
        let points = [line.topLeft, line.topRight, line.bottomRight, line.bottomLeft]
          .map { "\(String(format: "%.6f", $0.x)),\(String(format: "%.6f", $0.y))" }
          .joined(separator: ";")
        print(
          "ISSUE250_DOCUMENT_LINE\t\(index)\t\(line.transcript)\t"
            + "direction=\(String(describing: line.textDirection))\t\(points)"
        )
      }
    }
    print("ISSUE250_DOCUMENT_END\t\(name)")
  }
}

func testIssue250ResearchProbeComparesCurrentAndAppleTokenBoundaries() async throws {
  let samples = [
    "日本語の勉強",
    "今日は静かな公園で蝶々を見た。",
    "問題を解いてから、友達と話します。",
    "東京駅 12:30 Platform 4",
    "春の朝、静かな庭を",
    "蝶々が飛んでいる。",
    "日本語",
    "を読む。",
  ]
  let lookup = LookupClient.freshBundledDatabase()
  let current = JapaneseTextAnalysisClient.live(lookupClient: lookup)
  for sample in samples {
    let currentTokens = await current.linkedTokens(sample, SearchQuery(""), nil)
    print(
      "ISSUE250_CURRENT_TOKENS\t\(sample)\t"
        + currentTokens.map { token in
          "\(token.surface)→\(token.entry?.headword ?? "-")→\(token.entry?.reading ?? "-")"
        }.joined(separator: "|")
    )
    let apple = NLTokenizer(unit: .word)
    apple.setLanguage(.japanese)
    apple.string = sample
    print(
      "ISSUE250_APPLE_TOKENS\t\(sample)\t"
        + apple.tokens(for: sample.startIndex ..< sample.endIndex)
          .map { String(sample[$0]) }
          .joined(separator: "|")
    )
  }
}
```

The durable tables above retain the exact accepted transcripts, line directions,
quadrilaterals, times, metrics, token classifications, environment, and terminal
test counts. Local `.xcresult` paths are convenience evidence, not the sole
record.

## Sources and rights boundary

This is an engineering evaluation, not legal advice. Any selected dependency or
model must have an immutable upstream URL, release/commit, SHA-256, SBOM entry,
complete code/model/data license inventory, notices, update and rollback policy,
and independent review before it is added.

- Migaku and Nihongo are lawful behavior references only. Do not copy their
  assets, dictionaries, parsed output, provider configuration, or private code.
- Apple system frameworks do not add a redistributable model to the app, but the
  OS owns model updates; acceptance must be OS/revision-bound.
- Apache/MIT engine licenses do not automatically clear every bundled dictionary,
  model, training dataset, font, or runtime.
- Google Cloud and OCR.space are services, not open-source data or models. Their
  current policies do not authorize a silent upload design.

## Exact next action

Owner: choose **Pixel privacy Option A or B** and **Language Technology package
Option A, B, or C**. The research recommendation is **A + A**: on-device pixels,
plus an optional pinned SudachiDict `core` pack if the complete benchmark
confirms the seed's material token/link improvement over Apple Natural Language.

After that choice, create a benchmark/prototype child of #250 and stop again at
the measured adoption result. This research does not authorize production OCR,
tokenizer, parser, data, privacy, or UI changes.
