# Zenbu Japanese 1.0 Search acceptance

This is the frozen bounded Search acceptance record retained for version 1.0.
Current regression coverage and journey evidence are indexed in the living
[Search experience regression record](../../../../apps/ios/Verification/search-experience-regression-index.md).

> **Reference boundary:** The fixed screenshots below are genuine Nihongo
> 1.34.3 evidence. They do not establish current-version parity; the bounded
> Nihongo 1.34.4 replay remains owned by #168. See the canonical
> [reference-authority boundary](../../../../docs/clone-discovery/nihongo/REFERENCE-AUTHORITY.md).

## Public journey seam

`SearchExperienceJourneyUITests.testJapaneseQueryOpensWordDetailAndBackPreservesResults`
launches into Search, enters the synthetic Japanese query `問題`, observes the
Dictionary Best Matches hierarchy, opens the Primary Dictionary Entry, returns
to Search, and verifies that the query and result state remain visible.

The independent reference evidence is:

- `docs/clone-discovery/nihongo/evidence/reference/screenshots/search-inventory/search-root-empty.png`
- `docs/clone-discovery/nihongo/evidence/reference/screenshots/search-inventory/fixture-rich-mondai-refined.png`
- `docs/clone-discovery/nihongo/evidence/reference/screenshots/search-inventory/edge-results-to-word-detail-mondai-settled.png`
- `docs/clone-discovery/nihongo/evidence/reference/screenshots/word-inventory/state-word-detail-mondai-top.png`

## Recorded bounded result

- Compile-time verification passed for the app and UI-test products with
  Xcode 26.0.
- Runtime journey verification passed on the iPhone 17 Pro Max iOS 26.0.1
  simulator.
- Visual comparison passed for Search results, Word Detail, and the
  returned-results state against the fixed screenshots. The UI test retained an
  XCTest screenshot at each checkpoint.
- The recorded automated result was 55 passed, 0 failed, and 0 skipped.

These totals describe this bounded historical run only. The
[whole-product 1.0 release record](../../1.0.0.md) owns the final build 14
acceptance totals.

## Named gaps and differences

- `ENVIRONMENT-DIFFERENCE-001`: The simulator runtime was iOS 26.0.1; the
  fixed reference authority was physical iPhone 17 Pro Max on iOS 26.5.2. Any
  observable difference required classification before acceptance.
- `ASSET-SUBSTITUTE-001`: Toolbar, tab, search, badge, and pitch-display glyphs
  use SF Symbols and SwiftUI drawing. They are clean-room substitutes under the
  dossier's approved icon/asset variance, not copied Nihongo assets.

No unresolved parity defect or exact-fidelity blocker remained for this bounded
journey when the result was recorded. This snapshot cannot merge or close
current parity work by itself.
