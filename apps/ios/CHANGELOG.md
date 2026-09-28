# Changelog

All notable user-facing changes to Zenbu Japanese are recorded here.

## Unreleased

### Added

- Mark words as **Known**. Swipe a Search result or long-press it, or use the **•••** menu on a
  word's page. Known words show a green **✓ Known** capsule in Search and on the word's page,
  and **Account → Known Words** lists them with a count, search, and swipe to mark unknown.
  Known words are stored only on your device.
- Save words to your own **Lists**. Use **Add to List…** in the **•••** menu on a word's page
  to add it to any list or a new one; the word's page lists them above Notes. **Account → Lists** starts with **Favorites** and lets you
  create, rename (swipe, or tap a list in Edit), reorder, and delete lists, and search a list, swipe a word out of it, or select several words to remove. Lists
  are stored only on your device.
- Share a word from its page: the headword, reading, and meanings are shared as text.
- New optional frequency dictionaries built from openly licensed Jiten lists (CC BY-SA 4.0):
  **TV & Movies**, **Anime**, **Manga**, **Novels**, **Visual Novels**, and **Video Games**.
  They match words by reading as well as spelling, so words written the same way, such as
  方 (ほう, direction) and 方 (かた, person), get their own ranks.
- Account has a profile at the top: add a photo, name, username, and email, all stored only on
  your device.
- JLPT Levels is a new included dictionary, enabled first by default, that marks words with an
  estimated JLPT level (N5–N1) on Search and Word Detail, such as `JLPT N3`. Search puts
  easier levels first and breaks ties with the next enabled dictionary. Existing installs get it
  once at the top of their list. Levels come from Jonathan Waller's lists (CC BY-SA 4.0) and are
  unofficial study estimates.

### Fixed

- The Results and Discovered Words headings no longer stay pinned over results as you scroll.
- Inflected Japanese searches such as `まけたら`, `食べなかった`, and `勉強した` now find
  their dictionary forms (負ける, 食べる, 勉強) without downloading Japanese Text Analysis.
- Word Detail shows the right part of speech for adverbs, pronouns, pre-noun adjectives, and
  nouns that take する: もちろん is an adverb, これ a pronoun, この a pre-noun adjective, and 経験
  a noun and する verb. Common adverbs such as そう and もう now also get a TUBELEX rank.

### Changed

- A word's page has **Share** and **•••** buttons in place of **+**. Add Note, Take Photo, and
  Choose Photo are in the **•••** menu.
- The Video Games frequency chip is shortened to **Games**.
- In Account, Help & Support sits with the Privacy Policy and Credits & Attributions below the
  app's name and version.
- The included TUBELEX dictionary is now called **YouTube**.
- Optional frequency dictionaries now download from Zenbu's own servers instead of third-party
  hosts. Dictionaries you already downloaded keep working.
- **Credits & Attributions** now uses that name for its screen too, and is trimmed to each
  source's author, license, and project link. License texts and Tatoeba contributors are on one
  **Licenses** screen.
- The You tab is now **Account**, laid out like Settings with colored icons. It adds Help &
  Support, the Privacy Policy, and the app's version.
- Account no longer has a Japanese Text Analysis screen. The analysis is included with the app
  and had nothing to change; its sources and licenses remain under Credits & Attributions.
- Recent searches sit under a **Recent** heading, and Clear Recent Searches moved to the **⋯**
  menu at the top of Search.
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

### Removed

- The Netflix, TV Shows, Slice of Life, Shonen, Novels, Visual Novel, NHK, JP Dict, and Internet
  frequency dictionaries are removed because their sources have no license. If you downloaded
  any of them, they are deleted when you update. Download their replacements from
  **Account → Frequency Dictionaries**: TV & Movies, Anime, Manga, Novels, and Visual Novels.
  NHK, JP Dict, and Internet have no licensed replacement yet.

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
