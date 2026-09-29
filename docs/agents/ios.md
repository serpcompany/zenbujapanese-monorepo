# iOS working guide

## Build and inspect

Use XcodeBuildMCP to discover the project, scheme, and an already-booted iOS
Simulator from the current checkout. Build and run with the `arm64` architecture,
then inspect the launched app before reporting success.

The current `sudachi-swift` binary lacks an x86_64 Simulator slice. Use
`ONLY_ACTIVE_ARCH=YES`; a generic dual-architecture Simulator build fails at
link time.

## Interactive parsing comparison harness

The app defaults to the bundled Kuromoji engine for interactive Japanese in Image Search,
Word Detail, and Example Sentences. Dictionary search segmentation continues to use Sudachi.

To compare the previous interactive parsing path, launch the app with
`ZENBU_MORPHOLOGY_ENGINE=sudachi`. Omit the variable, or use any other value, to exercise
Kuromoji. Keep `ONLY_ACTIVE_ARCH=YES` for either path.

Compare both paths with the same source text and check:

- visible word boundaries and separate underline geometry;
- dictionary resolution for surface, normalized, and dictionary forms;
- candidate selection and the explicit no-entry state;
- the large Word Detail sheet and its **Open Full Entry** route; and
- linked-word behavior in Word Detail and Example Sentences.

This switch is a local comparison harness. It does not change the TestFlight engine, which
uses the default Kuromoji path.

## Current verification boundary

The `SearchExperienceTests` Swift package target covers Search behavior (result ordering,
deinflection, frequency chips and packs, pitch accent, and parts of speech) on an arm64 iOS
Simulator. Run it from
`apps/ios/Modules` with:

```sh
xcodebuild -scheme ZenbuJapaneseModules \
  -destination 'platform=iOS Simulator,id=<booted-simulator-udid>' \
  ONLY_ACTIVE_ARCH=YES test
```

`SearchConformanceTests` checks Search against the shared conformance suite in
`apps/ios/LanguageData/Conformance/search-retrieval.json` (see ADR 0006). After an intended
change to Search results or a dictionary rebuild, record it again by adding
`TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1` before the test command above, add
`-only-testing:SearchExperienceTests/SearchConformanceTests` after it, and review the diff.

`WordDetailConformanceTests` and `KanjiDetailConformanceTests` do the same for the detail
screens, so the website's word and kanji pages can be checked against the app. They check
`word-detail.json` and `kanji-detail.json` in the same folder, reading each case from the
models and clients the views use: for a word, its headword, furigana, part of speech, pitch,
senses, default frequency packs (JLPT and TUBELEX), kanji, and its first 25 examples with
their linked tokens; for a kanji, its metrics, meanings, readings with their words, elements,
24 words, and whether it has stroke data (not its JLPT metric, which the suites don't record). Each
file pins the SHA-256 of every bundled artifact it was recorded against. After an intended
change to either screen or its data, record them again with the same
`TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1` prefix and
`-only-testing:SearchExperienceTests/WordDetailConformanceTests` or
`-only-testing:SearchExperienceTests/KanjiDetailConformanceTests`, and review the diff.
Recording keeps each case's `id` or `character` and its `covers` note, so add a case by
adding those two fields and recording.

The iOS app has no CI workflow. Verify ordinary app changes by also building,
launching, and inspecting the real app.

Frequency-pack selection has one repo-local Python contract test. Run
`python3 -m unittest apps/ios/Tools/tests/test_frequency_pack_runtime_contract.py` to verify
that every selectable manifest pins a known evidence row and rank, each ordered source agrees
with the generated mapping analysis, the bundled TUBELEX artifact contains its pinned row, and
the bundled JLPT level pack matches its pinned source files and import report. Rebuild the JLPT
pack with `python3 apps/ios/Tools/import_jlpt_level_pack.py > apps/ios/LanguageData/Generated/JLPT-Waller-2025-08-26.import.json`
and copy the reported hashes into its catalog manifest.

Examples for kana-headword words come from `ExampleWordIndex.sqlite3`, which is built against the
bundled `LanguageReferenceData.sqlite3`. Run
`python3 -m unittest apps/ios/Tools/tests/test_example_word_index_contract.py` to verify that it
matches that database, its pinned source, and its import report.

Pitch for two-part compounds UniDic doesn't list whole, such as 記者会見, comes from
`CompoundPitch.sqlite3`, also built against that database. Run
`python3 -m unittest apps/ios/Tools/tests/test_compound_pitch_contract.py` to verify it.

Every frequency pack pins the SHA-256 of `LanguageReferenceData.sqlite3`. After rebuilding it
with `import_jmdict.py` (inputs are listed in `LanguageData/Sources/README.md`), also copy its
ranking contract into `DictionaryRankingArtifactContract.json`, rebuild the TUBELEX and Wikipedia
packs with `import_frequency_pack.py` (TUBELEX also needs `--unidic apps/ios/LanguageData/Sources/unidic-cwj-3.1.0.zip`), rebuild the Jiten packs with
`build_jiten_frequency_packs.py --out-dir <dir>` (it rewrites their manifests and keeps changed
ones trusted) and publish the new ZIPs, rebuild the JLPT pack, rebuild the example word index with `import_example_word_index.py`, rebuild the compound pitch estimates with `import_compound_pitch.py`
(inputs in `LanguageData/Sources/Tatoeba-jpn-indices-2026-09-26.source.json`), and update each catalog manifest. Move the previous manifests of downloadable
packs into `trustedHistoricalManifests` so packs a learner already installed stay trusted.

Downloadable packs are served from `cdn.zenbujapanese.com` (Cloudflare R2 bucket
`zenbujapanese-cdn`), never from upstream hosts. Point a new or changed manifest's `downloadURL`
at `https://cdn.zenbujapanese.com/frequency-packs/<packID>/<sourceSHA256>.<ext>`, then upload the
verified source file with
`CLOUDFLARE_ACCOUNT_ID=<SERP account> python3 apps/ios/Tools/publish_frequency_pack_sources.py <file>…`.
The tool matches files by size and SHA-256 and re-downloads each public URL to verify it. Never
overwrite or delete an object: trusted historical manifests still reference it.

## Search manual checks

Search ordering, deinflection, and frequency-chip rules are covered by `SearchExperienceTests`.
When changing Search results or frequency dictionaries, also check in the Simulator:

- `いる` shows chips in the Enabled order (JLPT first by default). Reordering or disabling
  dictionaries under **Account → Frequency Dictionaries** re-sorts the visible results without
  resubmitting, and disabling every dictionary removes the chips.
- `静` keeps its Kanji row first; `日本語を勉強する` shows **Discovered Words**; `見る` offers
  Example Sentences; `sensei` offers the Japanese-reading refinement (「せんせい」).
- With a pack made unreadable in a debug container, results stay listed and the footer names
  the unavailable dictionary.
- Rapidly submitting `quiet`, `miru`, then `いる` leaves only `いる` results.

## Image Search manual checks

`ImageTextRecognitionTests` run Vision on the images in
`Modules/Tests/SearchExperienceTests/Fixtures/ImageText`: vertical Japanese (a book-page photo,
a proverb list, and a panel with an English subtitle) and a horizontal control. When changing
text recognition, also open one vertical and one horizontal image in the Simulator's Image
Search and check:

- every view has the same toolbar: close, and a **•••** menu;
- **Photo** shows blue chips down vertical columns and underlines under horizontal lines, and
  nothing moves when a word opens;
- **Both** makes words on the image tappable, outlines the first card's line on it, and shows
  line translations under the Player's caption cards;
- **Text** joins the book-page columns into paragraph cards; and
- **Translate** shows **Translation**, then **Context** with the proverb list's idioms.

Apple Translation doesn't run in the Simulator, so translations there come from Apple
Intelligence's on-device model (Foundation Models), labeled as such; check Apple Translation on
a device. The on-device model runs in a Simulator only when the runtime matches the Mac: on an
iOS 26 runtime under a newer macOS, its safety check fails, so translation and Context fail
there. Use a Simulator on the runtime that matches the Mac, with Apple Intelligence on for the
Mac. `ImageTextExplanationTests` exercise the model only where it runs.

## Known words manual checks

`WordKnowledgeTests` cover known-word storage: persistence, unreadable and newer-version files,
failed writes, and backups. When changing known words, also check in the Simulator:

- Swiping a Search result right, or the **•••** menu on Word Detail, toggles **✓ Known** on
  both screens, and the mark survives a relaunch.
- **Account → Known Words** shows the count, lists the word, swipes it back to unknown, and
  opens it in Search.
- Known words live in `Application Support/Zenbu Japanese/word-knowledge.json` in the app's
  data container.

## Word lists manual checks

`WordListsTests` cover list storage: create, rename, delete, and reorder surviving a reload,
membership, the one-time Favorites list, and unreadable and newer-version files. When changing
word lists, also check in the Simulator:

- Word Detail **•••** → **Add to List…** toggles a word in Favorites and in a list made with
  **New List**, and both survive a relaunch. The word's **Lists** section above Notes names both.
- **Account → Lists** shows the count; a list removes a word by swipe or by **•••** → Select
  Words, renames or deletes itself from **•••**, and opens a word in Search;
  the index renames by swipe or by tapping a list in Edit, reorders in Edit, and asks before deleting a list that has words.
- Lists live in `Application Support/Zenbu Japanese/word-lists.json` in the app's data container.

## Player manual checks

`YouTubeCaptionsTests` cover link parsing, search-result links, caption-track choice,
timed-text parsing, translation pairing, card size, and word meanings. The live caption fetch
and the embedded player need the network, so when changing Player, also check these videos in
the Simulator. Type a link into the Player search bar; typing Japanese there triggers a paste
prompt, so search in English.

| Video | What it exercises |
| --- | --- |
| `https://youtu.be/AQdI1o2D32I` (Fuku) | Creator-made captions with line-aligned YouTube translations |
| `https://www.youtube.com/watch?v=C7GcYZzyeY8` (Metal Gear Solid 4) | A 1.5-hour video with long lines and ~500 counted words |
| `https://www.youtube.com/watch?v=T_lC2O1oIew` (Plastic Love) | Automatic captions, sound tags, and sentence-length translations that must not grow a card past two lines |
| `https://www.youtube.com/watch?v=fi6XzdRVjkk&list=PLq2VAzMUDhfHyvK6AoYEwOLCVnNNNr18d` | A playlist link to a video without Japanese captions, showing **No Japanese Captions** |

With each video, check that:

- The video plays inline without YouTube's caption overlay, the spoken line's card is
  highlighted and scrolls into view, tapping a card outside its words plays from that line, and
  the previous, play/pause, and next controls move between lines. Dragging the scrubber seeks,
  and the speed menu changes playback speed. While paused, previous and next play one line and
  pause at its end; while playing, they jump and keep playing.
- The repeat button replays the current line until it's turned off, and skipping or tapping a
  card moves the repeat to that line.
- The video appears under **Recent** after going back, with its title and thumbnail.
- Searching words in the Player search bar shows YouTube results in the app, and tapping a
  video opens it in Player.
- English lines appear beneath the Japanese, and the tab bar stays visible while watching.
- Tapping a word pauses the video and opens the word sheet at half height; **Open Full Entry**
  opens the word inside Player, and Back returns to the video.
- A video without Japanese captions shows **No Japanese Captions**, and one that disallows
  embedding shows **Video Unavailable**.
