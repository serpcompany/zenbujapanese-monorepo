# Handwriting Search journey evidence (v2)

Exported from the final passing `ZenbuJapaneseUITests` result bundle after Spec re-review on the iPhone 17 Pro Max iOS 26.0.1 simulator. The complete suite passed 23 tests with 0 failures and 0 skips. `manifest.json` retains all six handwriting test identifiers, the device identifier, timestamps, and the nine original attachment names.

| Public seam | Settled screenshot |
| --- | --- |
| Live offline recognition ranks `日`, `目`, then `田` after a synthetic `日` drawing | [9FC1D8AA-BB88-474F-A808-AC7CF6865C2D.png](9FC1D8AA-BB88-474F-A808-AC7CF6865C2D.png) |
| Selecting two live candidates composes `日本` and returns Language Reference Data results | [1CE6EE47-63F9-4DA1-9241-058A669B4245.png](1CE6EE47-63F9-4DA1-9241-058A669B4245.png) |
| Erase clears the pending app-owned drawing and disables Search | [1D8D25D8-1136-4F65-A0F4-6718AF080814.png](1D8D25D8-1136-4F65-A0F4-6718AF080814.png) |
| Radicals reaches a functional grouped grid; selecting `一` exposes candidates | [A50CAB14-D320-4384-84E7-BB34751F645F.png](A50CAB14-D320-4384-84E7-BB34751F645F.png) |
| Single handwritten `丁` produces the explicit rank-one KANJI-primary row inside Best Matches | [2BB02C0D-BD47-4105-B774-9F4D98F299E9.png](2BB02C0D-BD47-4105-B774-9F4D98F299E9.png) |
| Selecting the KANJI-primary row reaches Kanji detail | [D0BBDF4D-42B5-456E-B46A-9DDAD858F9DA.png](D0BBDF4D-42B5-456E-B46A-9DDAD858F9DA.png) |
| Search includes the unselected pending `一`, producing ordered `丁一` Discovered Words | [B0C3E6D5-93ED-4BAB-ADCA-EA4AD64E7391.png](B0C3E6D5-93ED-4BAB-ADCA-EA4AD64E7391.png) |
| No-candidate state is explicit and recoverable by erase/redraw | [64379A26-4DE4-4358-AFDD-3B46E535A0F4.png](64379A26-4DE4-4358-AFDD-3B46E535A0F4.png) |
| Production composition uses the live offline recognizer without fixture arguments | [1B8843E7-4AF8-4B65-B125-D00E32AAE4FB.png](1B8843E7-4AF8-4B65-B125-D00E32AAE4FB.png) |

## Recorded differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification uses iPhone 17 Pro Max Simulator iOS 26.0.1; the fixed reference authority is a physical iPhone 17 Pro Max on iOS 26.5.2.
- `HANDWRITING-RECOGNIZER-SUBSTITUTE-001`: Nihongo's recognizer implementation and model are unavailable. Zenbu uses an app-owned offline stroke-shape recognizer for the captured `日`, `本`, and `丁` classes, followed by Japanese-only Vision recognition. This proves user-operable offline input, not identical ranking, stroke-order tolerance, or character coverage outside the recorded fixtures.
- `APP-OWNED-ERASE-001`: the reference capture does not disambiguate single-stroke removal from clearing the pending character. Zenbu clears the current drawing and candidate strip; exact Nihongo erase mechanics are not claimed.
- `APP-OWNED-NO-CANDIDATE-001`: reference low-confidence and no-candidate states remain uncaptured. Zenbu presents an explicit recoverable state and verifies erase/redraw; no reference parity claim is made for its wording or threshold.
- `JOURNEY-OWNERSHIP-RADICAL-001`: issue #98 verifies that its visible Radicals control reaches a real grouped, selectable grid and that Handwriting/Keyboard return controls work. Complete radical narrowing, `薮` submission, and dedicated evidence remain owned by issue #99.
- `ASSET-SUBSTITUTE-001`: the replica uses approved Zenbu-owned SwiftUI/SF Symbol presentation rather than Nihongo assets.

No unresolved defect remains in the bounded handwriting composition, candidate selection, pending recognition, submission, history, input-mode transition, or single-kanji result path.
