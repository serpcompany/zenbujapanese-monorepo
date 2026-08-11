# Romaji refinement journey evidence

Exported from the final passing `ZenbuJapaneseUITests` result bundle on the iPhone 17 Pro Max iOS 26.0.1 simulator. The complete suite passed 14 tests with 0 failures and 0 skips. `manifest.json` retains the test identifiers, device identifier, timestamps, and original attachment names for this journey.

| Public seam | Settled screenshot |
| --- | --- |
| Literal `mondai` ranking with Japanese-reading action and `月曜日` first | [2C6D714E-B2E0-4AC1-8684-0B00F3DD3AA8.png](2C6D714E-B2E0-4AC1-8684-0B00F3DD3AA8.png) |
| Selected `もんだい` refinement with normalized query and `問題` first | [1CC07053-3FEB-4E38-A40F-77A75201C5C0.png](1CC07053-3FEB-4E38-A40F-77A75201C5C0.png) |
| Selected `にほん` recovery class with normalized query and `日本` first | [D1946D6E-DDF6-448A-ACE4-3170D1563B36.png](D1946D6E-DDF6-448A-ACE4-3170D1563B36.png) |

## Recorded differences

- `ENVIRONMENT-DIFFERENCE-001`: verification uses iPhone 17 Pro Max Simulator iOS 26.0.1; the fixed reference authority is a physical iPhone 17 Pro Max on iOS 26.5.2.
- `JOURNEY-OWNERSHIP-001`: the reference literal `mondai` screenshot also exposes “View 50+ Example Sentences.” That separately materialized control and destination are owned by `JOURNEY-WORD-EXAMPLES` and its open implementation ticket, not by this bounded refinement journey. It remains absent here and is not claimed as accepted whole-product behavior.
- `ASSET-SUBSTITUTE-001`: the replica uses approved Zenbu-owned SwiftUI/SF Symbol presentation rather than Nihongo assets.

No unresolved defect remains in literal ranking, refinement selection, normalized query state, or reranked results for this journey.
