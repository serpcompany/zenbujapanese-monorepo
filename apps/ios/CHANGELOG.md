# Changelog

All notable user-facing changes to Zenbu Japanese are recorded here.

## Unreleased

### Added

- Sort search results from the **Sorted by** row at the top of the results: a frequency
  dictionary, most or least common first (JLPT by level), or your known words, known or unknown
  first. Your choice stays across launches and applies to Japanese, English, and romaji
  searches.
- Filter search results from the same **Sorted by** row: hide the words you know, or keep the
  words chosen frequency dictionaries rank. The row counts the filters and the words they hide, with
  **Clear Filter** one tap away, and your filter stays across launches.
- Translate's **Listen** has the speaker button too: mute spoken translations while the
  translated cards keep coming.

### Changed

- Image Search moved from Search's camera button to Translate's **Image** row: take a photo or
  pick one from your library, then tap any word to look it up.
- Translate's home is laid out like Settings: a header, then **Spoken** (Conversation, Listen) and
  **Written** (Image, Text, Document). Tapping a row opens it, with no Start button.
  **Document** opens PDFs and text files.
- Image Search can open up to 8 photos from your library at once.
- Search's top bar matches Player's: a small title and the same search field, which slides up
  while you type and keeps your query after a search, with **X** to go back to your recent
  searches.
- Search has a pencil and a grid button, always one tap away, for Handwriting and Radicals. Both
  slide up as a sheet you can drag away, and add their pick to the end of what's in the field, so
  you can build a word from both; Handwriting shows bigger candidates with their meanings, and both
  have the same **Undo** button for the last stroke or radical. Recent searches no longer sit under a **Recent** heading.

### Removed

- Image Search no longer opens image files from Files; choose them from your photo library.
- Translate's **Document** no longer reads photos; use **Image**, which also lets you tap words.

### Fixed

- Radicals no longer draws over the search results.
- Choosing **Photo Library** for Image Search opens the picker again.
- English searches put the common word first: `dog` shows 犬 first and `water` shows 水, where rarer
  words whose meaning was exactly the query used to come ahead of them.

## [2.0.0] - 2026-10-09

### Added

- Sign in to a Zenbu account from **Account → Sign In to Sync**, with Apple, Google, or a code
  sent by email, to keep your known words and lists the same on all your devices and Zenbu apps.
  Zenbu syncs after each change, when it opens, and when you tap **Sync Now**. Everything still
  works signed out and offline, and signing out keeps everything on your iPhone; changes you make
  while signed out sync when you sign back in to the same account. **Favorites** is one list on all your devices.
  A new account made with Apple takes the name you share with Apple.
- Signed in, Player's **Recent** videos are the same on all your devices: a video you watch on one
  appears on the others with how far you got, and one you remove is removed everywhere.
- Signed in, the sentences you bookmark in **Translations** are the same on all your devices, each
  with its translation, even where its conversation isn't. Only bookmarked sentences sync;
  conversations stay on the iPhone they were recorded on.
- Delete your Zenbu account from **Account → Zenbu Account → Delete Account…**, after signing in
  again. The account and everything it synced are deleted; your iPhone keeps its known words,
  lists, notes, and media.
- Links to zenbujapanese.com's words, searches, and kanji, such as Tomodachi's **Open in Zenbu**,
  open in Zenbu: a word opens its page, a search searches, and a kanji opens its detail.
- New **Translate** tab: a Japanese and English translator that runs entirely on the iPhone. Pick
  **Conversation**, **Listening**, **Text**, or **Document Upload** and tap **Start**. In
  **Conversation**, two people take turns speaking either language with no language button. Each
  sentence appears as it's spoken with its translation under it, and the translation is spoken
  aloud once the speaker pauses while the microphone keeps listening. **Listening** translates
  Japanese or English from a TV, a guide, or announcements. A conversation fills the screen, as cards or as
  **Two Panes** (Japanese over English), with buttons to mute spoken translations, change their
  speed, and pause; silence asks **Are you still there?** before pausing, and leaving the app
  pauses too. **Text** translates what you type or paste in whichever direction you wrote, and
  **Document Upload** translates the text in a PDF, a photo, or a text file. Conversations are
  saved to **Translations**, which shows how many of each one's words you know and has search, copy,
  share, and delete; in a transcript each sentence can be replayed or bookmarked, and
  **Bookmarked** lists them. **Account → Translations** opens it too.
  Every Japanese word opens the dictionary at half height.
- Image Search has four views: **Photo**, **Both** (the image above the Player's caption cards,
  with furigana and line translations), **Text** (the recognized Japanese as paragraph cards),
  and **Translate** (a natural translation, then context on what the text is and its idioms,
  with their dictionary meanings). Tapping a word, on the image or in the text, opens it at
  half height, as in the Player, and vertical text is marked with tinted word chips. Without
  Apple Translation, Apple Intelligence translates on the device.
- New **Player** tab: search YouTube or paste a link to watch the video with its Japanese captions
  as cards below the player instead of over the video. The card being spoken is highlighted and
  scrolls along as the video plays, tapping a card jumps to that line, and tapping a word pauses the
  video and opens it in the dictionary at half height. English translations appear beneath each
  line. Music-app controls add a scrubber, playback speed, and a repeat-line button; while paused,
  the previous and next line buttons play one line and pause again. Player shows how much of a
  video's vocabulary you know, such as **73%** 38 of 52 words known, and Recent lists watched
  videos as cards with that percentage, their length, and how far you watched.
- **Reading Aids** adds **Show Word Meanings**, a short meaning under each word you haven't marked
  known; **Show Sentence Translations**, with a translation language and a choice of YouTube or
  on-device Apple Translation for Player captions (with a button to download Apple's Japanese);
  and **Hide Furigana on Known Words**.
- Mark words as **Known**. Swipe a Search result or long-press it, or use the **•••** menu on a
  word's page. Known words show a green **✓ Known** capsule in Search and on the word's page,
  and **Account → Known Words** lists them with a count, search, and swipe to mark unknown.
  Known words are stored on your device.
- Save words to your own **Lists**. Use **Add to List…** in the **•••** menu on a word's page
  to add it to any list or a new one; the word's page lists them above Notes. **Account → Lists** starts with **Favorites** and lets you
  create, rename (swipe, or tap a list in Edit), reorder, and delete lists, and search a list, swipe a word out of it, or select several words to remove. Lists
  are stored on your device.
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

- About 1,260 more words now show a YouTube rank, including common ones whose spelling belongs to
  more than one dictionary word, such as 事 (こと), 時 (とき), 年 (ねん), 上 (うえ), and 先生
  (せんせい). About 100 words, such as 色 and 猫, now take a better YouTube rank from their usual
  spelling instead of a rare one.
- Tapping another word while a word's half-height sheet is open, in the Player or Image Search,
  now shows it in the same half-height sheet instead of reopening the sheet at full height.
- Image Search now recognizes vertical Japanese (縦書き), such as book pages and signs,
  instead of reporting that no Japanese text was found. Columns are read right to left.
- The Results and Discovered Words headings no longer stay pinned over results as you scroll.
- Inflected Japanese searches such as `まけたら`, `食べなかった`, and `勉強した` now find
  their dictionary forms (負ける, 食べる, 勉強) without downloading Japanese Text Analysis.
- Word Detail shows the right part of speech for adverbs, pronouns, pre-noun adjectives, and
  nouns that take する: もちろん is an adverb, これ a pronoun, この a pre-noun adjective, and 経験
  a noun and する verb. Common adverbs such as そう and もう now also get a TUBELEX rank.

### Changed

- A kanji's **JLPT** level is now Jonathan Waller's estimate, N5 to N1, so 一 and 日 show N5
  instead of the old four-level N4. A kanji his lists leave out, such as 分, shows no JLPT level.
- Zenbu Japanese 2.0 is published by TSMC LLC as an update to 1.0, on the same App Store app
  (`com.zenbujapanese.dictionary`).
- Words you marked known no longer show an underline in linked Japanese.
- The word sheet from Image Search and Player has a close button and **Open Full Entry** in its top
  bar instead of Done and a bottom button, and no longer repeats the word as its title. Its
  **Choose** list uses the same rows as Search results. Open Full Entry, and links out of the
  sheet, stay in the tab the sheet came from.
- Word Detail lists **Alternatives** after Frequency instead of above Meaning.
- The app stays in portrait on iPhone.
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
