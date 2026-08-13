# Physical-device QA user flows

This checklist is the durable human QA companion to the automated Lookup journeys. A flow is not accepted merely because a nearby test passes: the named test must exercise the same gesture or layout boundary reported by the user.

## TestFlight QC round from issue #124

| User flow | Expected result | Automated public seam | Manual physical-iPhone check |
| --- | --- | --- | --- |
| Search controls | Info is absent, Image Search is outside the field, and Settings opens Dictionary Sources. | `testDictionarySourceAttributionIsReachableFromSearch` | Tap the field, Image Search, and Settings. |
| Clear recent searches | Confirmation remains present; Cancel preserves history and Clear All removes it. | `testDisposableHistoryClearAllConfirmsAndCancelLeavesSearchRoot` | Repeat with normal finger taps, not iPhone Mirroring. |
| English `hello` ranking | `こんにちは` leads `ハロー` without substring-noise leaders. | `testEnglishQueryReturnsRankedDictionaryResults` | Inspect the first visible results. |
| Greeting Word Detail | Pitch and useful alternatives render; internal labels and Tatoeba record IDs do not. | `testGreetingWordDetailShowsCleanAlternativesPitchAndLearnerFacingExamples` | Scroll the entire page. |
| Bottom navigation clearance | The final row on every scrollable Lookup page can move completely above the tab bar with at least 24 pt of clearance. | `testWordDetailFinalContentClearsBottomNavigation` plus destination journey tests | Check Search results, Word Detail, examples, conjugations, Kanji Detail, Kanji Element Detail, and Image Text. |
| Image Text regions | Recognized Japanese, including hiragana-starting regions, is actionable. | Image Text journey tests | Import the retained fixture through Files or Photos and tap several regions. |
| Tolerant `山` handwriting | The completed shape offers `山` for both the recorded gesture and a deliberately noncanonical right → left → center, bottom-to-top stroke sequence. Recognition must not require canonical stroke order. | `testRecordedPhysicalPhoneYamaGestureIncludesYamaCandidate` and `testSameYamaShapeRecognizesAcrossNoncanonicalStrokeOrder` | Draw naturally with a fingertip in whatever order is intuitive; do not imitate test coordinates. |
| Handwriting drawing area | The canvas is at least 240 × 240 pt, remains above the tab bar, and does not feel compressed by controls. | `testHandwritingCanvasProvidesUncrampedPhysicalPhoneDrawingArea` | Compare usable drawing room with the reference app. |
| Conjugated-form search | `makasete` resolves to `任せる` while distinct supported entries retain distinct meanings. | `testInflectedRomajiTeFormFindsDictionaryForm` | Search the literal romaji query. |
| Nested Kanji navigation | Back restores each prior destination and its visible context. | `testKanjiElementAlternativeStandaloneAndNestedBackRestoreEveryPriorState` | Traverse at least two nested element levels and return. |

Speech is excluded from this QC round because the reporter retracted that concern in the source recording.

## Acceptance policy

- During implementation, run only tests affected by the change.
- Before publishing the next TestFlight build, freeze one commit and complete one passing Debug simulator run, one passing Release simulator run, and one passing signed physical-iPhone run.
- Human QA is performed in the distributed TestFlight build after upload. A direct Xcode installation proves physical-device behavior but does not prove TestFlight delivery.
