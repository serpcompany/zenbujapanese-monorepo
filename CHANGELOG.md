# Changelog

All notable user-facing changes to Zenbu Japanese are recorded here.

## [1.0.0] - 2026-08-17

### Added

- Japanese, English, and romaji dictionary search with source-backed Japanese reading suggestions.
- Detailed word entries with readings, meanings, parts of speech, conjugations, pronunciation, related words, and example sentences.
- Kanji lookup with readings, meanings, components, classifications, related words, and animated stroke order.
- Handwriting recognition for finding kanji that are difficult to type.
- Image Text for recognizing selectable Japanese from the camera, photo library, or imported files, with on-device translation using Apple system features.
- Persistent, removable source-image context for words opened from Image Text.
- Kanji-aligned furigana for mixed kanji/kana words such as `女らしい`.
- Private word notes and recent-search history stored on the device.

### Quality and privacy

- Deterministic, app-owned dictionary and example-sentence ranking backed by bundled source data.
- Bounded indexed search for ordinary and multi-word queries, with stale-request cancellation and repeat-query caching.
- Literal query handling for punctuation and SQL wildcard characters.
- No account, advertising, analytics SDK, or cloud sync.
- Privacy and source-attribution disclosures included in the app and release bundle.

### Release scope

- iPhone only, requiring iOS 26.0 or later.
- English (U.S.) App Store listing.
- Free, with no in-app purchases or subscriptions.

[1.0.0]: https://github.com/serpcompany/zenbujapanese-monorepo/releases/tag/v1.0.0
