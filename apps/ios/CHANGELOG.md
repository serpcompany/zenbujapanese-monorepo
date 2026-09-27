# Changelog

All notable user-facing changes to Zenbu Japanese are recorded here.

## Unreleased

### Added

- JLPT Levels is a new included dictionary, enabled first by default, that marks words with an
  estimated JLPT level (N5–N1) on Search and Word Detail, such as `JLPT N3`. Search puts
  easier levels first and breaks ties with the next enabled dictionary. Existing installs get it
  once at the top of their list. Levels come from Jonathan Waller's lists (CC BY-SA 4.0) and are
  unofficial study estimates.

### Fixed

- Inflected Japanese searches such as `まけたら`, `食べなかった`, and `勉強した` now find
  their dictionary forms (負ける, 食べる, 勉強) without downloading Japanese Text Analysis.
- Word Detail shows the right part of speech for adverbs, pronouns, pre-noun adjectives, and
  nouns that take する: もちろん is an adverb, これ a pronoun, この a pre-noun adjective, and 経験
  a noun and する verb. Common adverbs such as そう and もう now also get a TUBELEX rank.

### Changed

- You no longer has a Japanese Text Analysis screen. The analysis is included with the app and
  had nothing to change; its sources and licenses remain under Credits & Attributions.
- The conjugation table is compact: the word, its meaning, and a one-line rule sit at the top,
  and every form fits in one list with its changed ending highlighted. Tapping a form opens its
  own screen, which explains it and lists the example sentences that use it.
- Example sentences appear as separate cards, underline each word separately so you can see
  where one word ends and the next begins, and highlight the word or form you're studying.
  Inflected words such as 見なかった are one tappable word instead of 見 + なかっ + た, here and
  in Image Search.
- Search now presents one Results list ordered by dictionary relevance first, then by the enabled
  frequency dictionaries in priority order. English rows show the gloss that matched the query.
- TUBELEX remains included and enabled by default. Japanese Wikipedia and nine domain-specific
  frequency dictionaries can be downloaded and removed from You → Frequency Dictionaries.
- Any number of frequency dictionaries, including none, can be switched on and reordered from a
  simplified Frequency Dictionaries screen. Search rows and Word Detail show a rank chip for each
  enabled dictionary, colored from green for very common words to gray for rare ones.
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
