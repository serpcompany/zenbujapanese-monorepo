# Changelog

All notable user-facing changes to Zenbu Japanese are recorded here.

## Unreleased

### Changed

- Search now presents one Results list ordered by dictionary relevance first and active
  frequency-dictionary rank second. English rows show the gloss that matched the query.
- TUBELEX remains included by default. Japanese Wikipedia and nine domain-specific frequency
  dictionaries can be downloaded, activated, switched, and removed from You → Frequency
  Dictionaries.
- Image Text now divides recognized Japanese into individually selectable words and marks
  each boundary with a separate underline instead of highlighting broad OCR regions.
- Selecting a recognized word opens the existing Word Detail experience in a large sheet,
  with candidate selection and a route to the normal full-screen entry when available.
- Interactive Japanese text now uses the same Kuromoji parser family as the Zenbu browser
  extension, with improved dictionary-form resolution and an explicit no-entry state.

## [1.0.0] - 2026-08-17

### Added

- Japanese, English, and romaji dictionary search with source-backed Japanese reading suggestions.
- Detailed word entries with readings, meanings, parts of speech, conjugations, pronunciation, related words, and example sentences.
- Kanji lookup with readings, meanings, components, classifications, related words, and animated stroke order.
- Handwriting recognition for finding kanji that are difficult to type.
- Image Text for recognizing selectable Japanese from the camera, photo library, or imported files, with on-device translation using Apple system features.
- Multiple persistent, removable Encounter Media images for words opened from Image Text.
- A lightweight Media Library for browsing retained images and their associated words.
- Kanji-aligned furigana across Search, Word Detail, Kanji, Image Text, and example-sentence word links for mixed kanji/kana words such as `女らしい`.
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
