# Gate 1 identity verification

Captured on 2026-08-14 from `agent/issue-141-identity` using the iPhone 16e
simulator on iOS 26.0.1.

## Visual evidence

- `search-light.png`: approved Zenbu light colors with the release Search and
  Settings destinations.
- `search-dark.png`: approved Zenbu dark colors with the same typography,
  geometry, and destinations.

The screenshots are Zenbu-owned verification artifacts. Private reference
captures are not included.

## Automated evidence

- Debug simulator build: succeeded.
- Full Search/dictionary UI suite: 75 tests executed; 72 passed, 2 transient
  failures, and 1 physical-device camera fixture test skipped. The two failures
  were `testExampleSentencesCanBeOpenedScrolledSpokenAndTraversed` and
  `testImageTextClearFileSupportsHighlightsGlossNestedWordSharingAndClose`.
- Immediate isolated rerun of both failures: 2 passed, 0 failed, 0 skipped.
- Unsigned generic-device Release archive: succeeded.

Result bundles from this local run were written outside the repository:

- `/tmp/ZenbuJapanese-issue-141-tests.xcresult`
- `/tmp/ZenbuJapanese-issue-141-targeted.xcresult`
- `/tmp/ZenbuJapanese-issue-141-final.xcarchive`

## Release inspection

- `CFBundleDisplayName` and `CFBundleName`: `Zenbu Japanese`.
- `CFBundleIdentifier`: `com.zenbujapanese.dictionary`.
- `UIDeviceFamily`: iPhone (`1`) only.
- Asset catalog: 1024 by 1024 phone AppIcon rendition present.
- Source and compiled AppIcon PNGs: opaque (`hasAlpha: no`).
- Stripped application binary search returned no matches for `replica`,
  `acceptance replica`, `clone`, `Nihongo Pro`, `clippings`, `flashcards`, or
  `fixture`.
- Release bundle inventory contained no private captures, side-by-side evidence,
  or image-text fixture media.
- The icon provenance manifest passed `shasum -a 256 -c`.

The Release archive was produced with `CODE_SIGNING_ALLOWED=NO`; signing,
App Store Connect operations, and submission remain outside Gate 1.
