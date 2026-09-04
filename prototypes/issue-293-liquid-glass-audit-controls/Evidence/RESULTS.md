# Issue #293 result

## Verdict

The first branch of issue #293's decision rule is satisfied.

Untouched native SwiftUI controls reproduced whole-window contrast findings at the iOS 26 Liquid Glass tab boundary in light and dark at AX5. The deliberate fully unobscured defect was caught in both appearances, and restoring the same label to semantic `.primary` removed that label's finding in both appearances. A native-boundary finding remained after the repair.

Therefore the whole-window contrast audit is sensitive but not specific at this native Liquid Glass boundary. For #289, keep exact app-owned/focused contrast checks blocking and retain native-boundary whole-window findings as visible non-blocking diagnostics. This prototype does not authorize any other #289 policy change.

## Environment

- Date: 2026-09-05 (Asia/Tokyo)
- Base: `origin/refactor/native-swiftui-components` at `f989cb06ba2b7584716d0aa5449c3f45c08315a1`
- Xcode: 26.6 (`17F113`)
- SDK: iPhoneSimulator 26.5 (`23F81a`)
- Simulator: iPhone 17 Pro Max, iOS 26.5 (`23F77`), UDID `72E8E7B4-9392-46D3-8C7B-7E684493085C`
- Swift: Apple Swift 6.3.3 (`swiftlang-6.3.3.1.3`, `clang-2100.1.1.101`)
- Content size: `accessibility-extra-extra-extra-large` / `UICTContentSizeCategoryAccessibilityXXXL` (AX5)
- Baseline Increase Contrast: disabled
- Separate Increase Contrast matrix: enabled through public `simctl ui`
- Runtime setting proof: every test asserts and retains `UIAccessibility.isDarkerSystemColorsEnabled`
- Reduce Transparency: not run; Xcode 26.6 `simctl ui` exposes no deterministic public option for it. Route this setting to separate physical/manual HIL rather than private defaults.

## Preregistered counts

Each count is one failure produced by a direct, no-handler `performAccessibilityAudit(for: .contrast)` call.

| Variant | Light | Dark | Light + Increase Contrast | Dark + Increase Contrast |
| --- | ---: | ---: | ---: | ---: |
| 1. Untouched automatic edge | 2 | 2 | 2 | 2 |
| 2. Untouched hard edge | 2 | 2 | 2 | 2 |
| 3. Deliberate unobscured defect | 2 | 2 | 2 | 2 |
| 4. Semantic repair | 1 | 1 | 1 | 1 |

The hard edge did not change the audit count or identified nodes. Increase Contrast did not change any count in this matrix.

## Exact audit descriptions and element availability

Every exported `Complete Issue Description.txt` contains exactly:

```text
Contrast failed for SwiftUI.AccessibilityNode
```

Xcode's test activity resolves the failing node's label even when its identifier is unavailable. The retained pre-audit accessibility inventories record labels and frames:

| State | Failing node | Identifier | Label | Frame (points) | Location |
| --- | --- | --- | --- | --- | --- |
| Automatic and hard, light/dark | native secondary row text | unavailable on issue node | `System secondary label` | `{{40, 793}, {288.667, 102.333}}` | intersects tab edge beginning at y=873 |
| Automatic and hard, light/dark | native primary row text | unavailable on issue node | `Native row 2` | `{{40, 925.333}, {278.333, 63.333}}` | beneath tab/window edge |
| Deliberate defect, light/dark | authored defect | `prototype.deliberate-low-contrast` | `Deliberately low-contrast unobscured label` | `{{20, 489.667}, {400, 279.333}}` | fully above tab edge; maxY=769 |
| Deliberate defect and semantic repair, light/dark | native section header | unavailable on issue node | `Native navigation links` | `{{20, 786.667}, {400, 207.333}}` | intersects tab edge beginning at y=873 |

The containing native `NavigationLink` for the automatic/hard edge has identifier `prototype.row.2`, but Xcode attaches each finding to descendant `SwiftUI.AccessibilityNode` values whose own identifiers are unavailable. Labels and frames are available for all observed nodes.

## Commands

```sh
xcodegen generate
xcodebuild build-for-testing \
  -project PrototypeIssue293.xcodeproj \
  -scheme PrototypeIssue293 \
  -destination 'platform=iOS Simulator,id=72E8E7B4-9392-46D3-8C7B-7E684493085C' \
  -derivedDataPath .derivedData \
  CODE_SIGNING_ALLOWED=NO

xcrun simctl ui 72E8E7B4-9392-46D3-8C7B-7E684493085C \
  content_size accessibility-extra-extra-extra-large
xcrun simctl ui 72E8E7B4-9392-46D3-8C7B-7E684493085C increase_contrast disabled

xcodebuild test-without-building \
  -project PrototypeIssue293.xcodeproj \
  -scheme PrototypeIssue293 \
  -destination 'platform=iOS Simulator,id=72E8E7B4-9392-46D3-8C7B-7E684493085C' \
  -derivedDataPath .derivedData \
  -resultBundlePath Evidence/normal/PrototypeIssue293-normal.xcresult

xcrun simctl ui 72E8E7B4-9392-46D3-8C7B-7E684493085C increase_contrast enabled

xcodebuild test-without-building \
  -project PrototypeIssue293.xcodeproj \
  -scheme PrototypeIssue293IncreaseContrast \
  -destination 'platform=iOS Simulator,id=72E8E7B4-9392-46D3-8C7B-7E684493085C' \
  -derivedDataPath .derivedData \
  -resultBundlePath Evidence/increase-contrast/PrototypeIssue293-increase-contrast.xcresult
```

The complete local result bundles were retained during extraction and hashed before local archival:

- normal zipped bundle: SHA-256 `4ba60d9b420bb7e8056623199fec1ad40fe5433f5bb58bd65b31d68df61ab199`
- Increase Contrast zipped bundle: SHA-256 `bf9a33dc5fc62b8eab7d5fe5afc133ea690adc30730b564f5a63bdb4bfce5802`

The branch retains the durable, reviewable exports rather than the 96–111 MB generated bundles. Exact paths are `Evidence/{normal,increase-contrast}/xcodebuild.log`, `tests.json`, `export.log`, and `attachments/manifest.json`; each manifest maps the exported issue descriptions, app/element screenshots, eight named state screenshots, public-settings attachments, and element inventories. The final local raw bundles and their hashed zip files are staged at `/tmp/prototype293-final-bundles.Hfh11e` until branch handoff/cleanup.

## Primary Apple sources

- [Performing accessibility audits for your app](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [`ScrollEdgeEffectStyle`](https://developer.apple.com/documentation/swiftui/scrolledgeeffectstyle)
- [`scrollEdgeEffectStyle(_:for:)`](https://developer.apple.com/documentation/swiftui/view/scrolledgeeffectstyle(_:for:))

Apple documents that standard framework components adopt Liquid Glass automatically, whole-screen audits fail when they find issues, and the automatic edge style is system-selected while `.hard` produces a more opaque, defined boundary.
