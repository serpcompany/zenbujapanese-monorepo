# PROTOTYPE ONLY: issue #293 Liquid Glass audit controls

Disposable minimal iOS 26 SwiftUI control app. It contains no Zenbu product code and must not be merged into a production branch.

Question: does Xcode's whole-window contrast audit report native `List`/`Section` content fading beneath the iOS 26 floating tab bar while still catching a fully unobscured app-authored contrast defect and clearing its semantic repair?

The four variants are preregistered by issue #293 and selected with `-PrototypeVariant 1...4`:

1. untouched automatic scroll edge;
2. untouched `.scrollEdgeEffectStyle(.hard, for: .bottom)`;
3. automatic edge plus a deliberately low-contrast, fully unobscured label;
4. the same label repaired with semantic `.primary`.

The UI tests use Accessibility XXXL (`UICTContentSizeCategoryAccessibilityXXXL`, AX5), light and dark appearances, and direct no-handler `performAccessibilityAudit(for: .contrast)` calls. Expected red results are evidence, not a passing test suite.

Generate and run:

```sh
xcodegen generate
xcodebuild test \
  -project PrototypeIssue293.xcodeproj \
  -scheme PrototypeIssue293 \
  -destination 'platform=iOS Simulator,id=<DEVICE-UDID>' \
  -resultBundlePath Evidence/normal/<test>.xcresult \
  -only-testing:PrototypeIssue293UITests/PrototypeIssue293UITests/<test>
```

Public Simulator controls used by this prototype:

```sh
xcrun simctl ui <DEVICE-UDID> content_size accessibility-extra-extra-extra-large
xcrun simctl ui <DEVICE-UDID> increase_contrast enabled
```

Use the `PrototypeIssue293IncreaseContrast` scheme for that separate matrix. The schemes supply the expected public state to the test runner; each UI test asserts Apple's public `UIAccessibility.isDarkerSystemColorsEnabled` value and retains it as an attachment before the audit.

`simctl ui` in Xcode 26.6 has no Reduce Transparency option. Do not substitute private defaults; route that setting to separate physical/manual HIL.
