# Recent Search rerun journey evidence

Exported from the final passing `ZenbuJapaneseUITests` result bundle on the iPhone 17 Pro Max iOS 26.0.1 simulator. The complete suite passed 17 tests with 0 failures and 0 skips. `manifest.json` retains the three public test identifiers, device identifier, timestamps, and original attachment names for this journey.

All history rows below were created during isolated UI-test sessions after `-ResetRecentSearches`; no personal or pre-existing search history was read or retained.

| Public seam | Settled screenshot |
| --- | --- |
| Session-created `もんだい` is the newest recent row | [90DF5225-A62E-462F-9B8A-30732EDDB991.png](90DF5225-A62E-462F-9B8A-30732EDDB991.png) |
| Selecting that row restores the same representative ordered result set | [9FF0B8CB-C581-4625-8FDD-952E5CA6C79F.png](9FF0B8CB-C581-4625-8FDD-952E5CA6C79F.png) |
| Per-row swipe deletion removes only `日本`, preserving `think` | [C9F3B900-8BB4-4781-A8F0-B7C843DD3C8D.png](C9F3B900-8BB4-4781-A8F0-B7C843DD3C8D.png) |
| Confirmed Clear All leaves the isolated history empty | [6828DE04-5575-41DF-9B8D-1F23AAF656B4.png](6828DE04-5575-41DF-9B8D-1F23AAF656B4.png) |

## Recorded differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification uses iPhone 17 Pro Max Simulator iOS 26.0.1; the fixed reference authority is a physical iPhone 17 Pro Max on iOS 26.5.2.
- `APPROVED-HISTORY-DELETION-001`: Zenbu uses a standard app-owned trailing swipe action that removes only the selected row and persists that removal. Exact Nihongo gesture, control, and animation parity is not claimed because the dossier forbids deriving uncaptured mechanics.
- `EVIDENCE-GAP-HISTORY-PERSISTENCE-001`: the reference storage location and cold-relaunch persistence were not captured. Zenbu stores app-owned normalized queries in device-local `UserDefaults`; the relaunch test establishes Zenbu behavior only, not reference parity.
- `REFERENCE-DESTRUCTIVE-BOUNDARY-001`: Clear All was not exercised against the reference because that would destroy pre-existing history. Zenbu requires confirmation and verifies the behavior only in reset synthetic test storage.
- `ASSET-SUBSTITUTE-001`: the replica uses approved Zenbu-owned SwiftUI/SF Symbol presentation rather than Nihongo assets.

No unresolved defect remains in creating, presenting, rerunning, individually deleting, or clearing app-owned recent Search queries for this journey.
