# Issue #216 native chrome evidence

This directory is the issue-specific before/after record for the native SwiftUI
tab and navigation conversion. Every PNG is 1320 x 2868 and was captured on the
same iPhone 17 Pro Max / iOS 26.0.1 Simulator (`D6C3072F-1C9B-43A4-9C7D-77F8F19A9CA5`).

## Current-base before state

`before/search.png` and `before/more.png` were freshly captured from detached
`origin/main` commit `17de50f2f0f64f4eb9ffaf13b1db8b5026621585` by the passing focused test
`testSearchChromeKeepsImageSearchOutsideTheFieldAndMovesSourcesToSettings` on
2026-08-31. They show the custom bottom bar and More presented as a custom
sheet with a Done control.

The remaining five before images are copied byte-for-byte from the accepted
iPhone 17 Pro Max journey evidence that predates this branch:

- `word-detail.png`: `JOURNEY-INSPECT-WORD-v5`, `word-detail-miru-structured-top`
- `kanji-detail.png`: `JOURNEY-INSPECT-KANJI`, `kanji-shizu-source-backed-top`
- `example-sentences.png`: `JOURNEY-READ-EXAMPLES-v2`, `example-sentences-iru-top`
- `conjugations.png`: `JOURNEY-INSPECT-CONJUGATIONS`, `conjugations-ichidan-plain`
- `image-text.png`: `JOURNEY-IMAGE-FILES`, `image-text-clear-recognized`

Their original manifests retain the test identifier, device, timestamp, and
attachment provenance. Copies live here so #216 does not overwrite historical
journey evidence.

## Native after state

All seven files under `after/` were freshly captured from this branch by one
passing six-test partition on 2026-08-31. Search and More use the dedicated
`issue-216-after-*` attachments; the destination screenshots came from these
public journeys:

- Word Detail: `testJapaneseQueryOpensWordDetailAndBackPreservesResults`
- Kanji Detail: `testKanjiDetailShowsSourceBackedClassificationAndReadings`
- Example Sentences: `testExampleSentencesCanBeOpenedScrolledSpokenAndTraversed`
- Conjugations: `testIchidanConjugationsSwitchBetweenPlainAndPoliteAndReturnToWordDetail`
- Image Text: `testImageTextClearFileSupportsHighlightsGlossNestedWordSharingAndClose`

That evidence partition passed 6/6. It demonstrates the native two-tab
container, native navigation titles and Back controls, semantic toolbars, and
the explicit Image Text Close action.
