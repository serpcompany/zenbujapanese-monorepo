# Default-size native controls for #173 — eight audits completed

## Decision

All nine visible light-mode warnings reproduce with ordinary native components and the same relevant semantic modifiers, without Zenbu imports. The deliberate low-contrast control is caught; restoring that exact label to primary clears its finding. This establishes an effective contrast signal and native-only reproduction, not a blanket false-positive disposition.

With Increase Contrast enabled and proved in the app's receipt, **eight of nine warnings clear**. The app-chosen caption/secondary frequency rank remains below ordinary-text contrast and is the one targeted semantic repair candidate. No production code, exemption, or test-plan membership changed.

| Control | Default light | Default dark | Light, Increase Contrast |
| --- | --- | --- | --- |
| Search headers | Best Matches, Additional Matches nearly pass | Pass | Pass |
| Rank #115, caption + secondary | Nearly passes | Pass | Nearly passes |
| Noun native LabeledContent value | Nearly passes | Pass | Pass |
| ALTERNATIVES, MEANING, KANJI, NOTES native headers | Four nearly pass | Pass | Pass |
| Add Note native Button | Nearly passes | Pass | Pass |
| Deliberate label (light only) | Fails, plus three baseline Search warnings | Not run | Not run |
| Same label restored to primary | Label clears; three baseline Search warnings remain | Not run | Not run |

Six default/sensitivity audits: 2 tests pass, 4 fail intentionally with 16 contrast findings. Two Increase Contrast audits: Detail passes; Search fails with exactly rank #115. All label/frame/settings preconditions pass. No retries or ninth audit occurred.

## Runtime and source

- Xcode 26.6 17F113; iOS 26.5 23F77; iPhone 17 Pro Max 72E8E7B4-9392-46D3-8C7B-7E684493085C; en_US; default Large text.
- App-side receipts record `size=large`, actual appearance, Increase Contrast false/true as appropriate, Bold Text false, Reduce Transparency false. All targets are entirely between native navigation/tab bounds.
- Source: `App/DefaultContrastControlView.swift`, `UITests/DefaultContrastControlUITests.swift`, selected by `-DefaultContrastControl` in the existing prototype entry point. Search uses `.plain`; Detail uses `.insetGrouped`. Source was whitespace-formatted after execution; no semantic change followed execution.
- Builds: initial 3.083s, deterministic receipt rebuild 14.902s, additional IC selector build 1.900s. Total build **19.885s**.
- Test processes: six controls **124.786s**, two IC checks **46.135s**; total **170.921s**. Build+test **190.806s (3m11s)**, within the eight-minute ceiling.
- Raw bundles retained locally: `/tmp/Zenbu173DefaultNativeControls.xcresult`, `/tmp/Zenbu173NativeIncreaseContrast.xcresult`. Exported PNG/text receipts and filtered manifests are committed in `normal/` and `increase-contrast/`; videos/event objects remain in raw bundles. Complete test logs are retained alongside exports.
- Commands: `xcodegen generate`; `xcodebuild build-for-testing -project PrototypeIssue293.xcodeproj -scheme PrototypeIssue293 -destination 'platform=iOS Simulator,id=72E8E7B4-9392-46D3-8C7B-7E684493085C' -derivedDataPath .derivedData CODE_SIGNING_ALLOWED=NO`. Default test-without-building selected exactly methods test01 through test06 through the then-six-method DefaultContrastControlUITests class. IC run explicitly selected only test07SearchIncreaseContrast and test08DetailIncreaseContrast. Parallel testing disabled. Both used the above destinations/build directory and separate raw bundles.
- Public `simctl ui` set content_size large and increase_contrast disabled for baseline; enabled for the two IC checks, then restored disabled.

## Independent pixel check

`python3 Evidence/default-native/measure_contrast.py` reads the retained sRGB screenshots and original per-element point bounds (@3x). It selects dominant solid glyph/background pixels, excludes the containing button when measuring its label, and applies the [W3C relative-luminance contrast formula](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). It is a sampled rendered-pixel check, not a universal audit of every antialiased pixel or every screen.

| Text | Default ratio | Increase Contrast ratio |
| --- | ---: | ---: |
| Noun | 3.439:1 | 5.967:1 |
| ALTERNATIVES | 3.287:1 | 5.331:1 |
| Add Note label | 3.520:1 | 11.158:1 |
| Best Matches | Native audit nearly passes | 5.967:1 |
| #115 caption | Native audit nearly passes | **4.004:1** |

The rank's IC crop is RGB127 on white, still below the usual 4.5:1 ordinary-text threshold. Semantic `.primary` for this small rank is the smallest app-owned candidate; it still needs actual-app verification.

## Apple criterion and final gate

[Apple's Sufficient Contrast evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/sufficient-contrast-evaluation-criteria/) explicitly permit apps using Apple-provided UI frameworks to verify that Increase Contrast provides sufficient contrast when defaults do not. This corrects the earlier research note's overly strict default-only interpretation. Default native reproduction alone is not sufficient evidence; the actual adaptation receipts, direct audits, and independent ratios matter. [Apple's audit guidance](https://developer.apple.com/videos/play/wwdc2023/10035/) requires investigating any alleged false positive.

The production app must still demonstrate the same eight named labels fully visible with Increase Contrast, in addition to preserving default-state evidence, navigation, scaling, and clipping checks. Keep the rank blocking until its semantic repair passes in the actual Search state. This prototype cannot claim actual-app IC success or authorize an automatic diagnostic transfer. No complete Zenbu suite was run and this prototype branch must never merge into production.
