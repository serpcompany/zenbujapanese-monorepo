# Issue #234 TextKit ruby-link prototype evidence

Verdict: **fail; stop condition reached**.

Environment: iPhone 17 Pro Max Simulator
`D6C3072F-1C9B-43A4-9C7D-77F8F19A9CA5`, iOS 26.0.1, portrait,
English (US), Debug.

The disposable `-PROTOTYPEIssue234TextKitRubyLinks` launch harness resolves the
current Primary Dictionary Entry for `いる`, consumes the first eight ordered
records from direct-Japanese Example Sentence Retrieval, and uses current
`JapaneseTextToken` and `DictionaryEntry` values plus the existing open-word and
speech callbacks. Each candidate row is one selectable, noneditable, nonscrolling TextKit 2
`UITextView` whose attributed paragraph carries both Core Text ruby annotations
and native link attributes. The representative row also retains the SwiftUI
`Text(AttributedString)` negative control.

The Debug build and launch passed. The retained default screenshot shows compact
flow and visible ruby, including ruby visibly attached to `持`. The focused
public-accessibility test failed with 0 passed, 1 failed, and 0 skipped. The
representative TextKit paragraph published five native link ranges (`いる`,
`だけ`, `持`, `って`, and `いらっしゃい`), but all labels collapsed to their
surface. The current analyzer resolves the representative range to the current
`DictionaryEntry` `持 / じ / draw (in go, poetry contest, etc.), tie`; its public
link was `持`, not the required
`持, じ, draw (in go, poetry contest, etc.), tie`. Applying UIKit's native
`accessibilityTextCustom` attributed metadata did not change the public link label.

This is an explicit #234 stop condition. Enriching each range's public label
would require a hand-built accessibility element layer, which #234 forbids.
The remaining acceptance seams were therefore not run and must not be inferred
from the partial visual/hierarchy observations.

Focused command:

```sh
xcodebuild -project apps/ios/ZenbuJapanese.xcodeproj -scheme ZenbuJapanese \
  -destination 'platform=iOS Simulator,id=D6C3072F-1C9B-43A4-9C7D-77F8F19A9CA5' \
  -only-testing:ZenbuJapaneseUITests/PROTOTYPEIssue234UITests/testTextKitPublishesTheRequiredRichLinkLabel \
  test
```

Retained evidence:

- `FF9C25E3-9ED4-4D81-B7E7-FDA046BA186B.png`: default screenshot.
- `4A2950F4-AF6C-4DA6-BEBB-304D1C209720.txt`: full public accessibility hierarchy.
- `56C16532-8D26-4250-B16C-DD6A3ADCCB1A.mp4`: XCUITest screen recording.
- `manifest.json`: exported attachment provenance.

Removal is one bounded deletion: remove this evidence directory, the two
`PROTOTYPEIssue234` Swift files and their project references, plus the single
guarded `-PROTOTYPEIssue234TextKitRubyLinks` selection in
`SearchExperienceRootView`.
