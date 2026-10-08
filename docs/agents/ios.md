# iOS working guide

## Build and inspect

Use XcodeBuildMCP to discover the project, scheme, and an already-booted iOS
Simulator from the current checkout. Build and run with the `arm64` architecture,
then inspect the launched app before reporting success.

The command-line tools must point at Xcode, not at the Command Line Tools, or `xcodebuild` and
the Simulator tools refuse to run. `xcode-select -p` shows which; fix it once per Mac with
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.

The current `sudachi-swift` binary lacks an x86_64 Simulator slice. Use
`ONLY_ACTIVE_ARCH=YES`; a generic dual-architecture Simulator build fails at
link time.

The app's **Prepare bundled Sudachi Core** build phase runs offline: it copies the pinned Sudachi
Core dictionary from `~/Library/Caches/com.zenbujapanese.build/SudachiCore` (or
`ZENBU_SUDACHI_BUILD_CACHE`), and fails with "verified Sudachi build cache is missing" until that
cache is filled. Fill it once per Mac, online, from the repository root:

```sh
python3 apps/ios/Tools/prepare_sudachi_core.py \
  --manifest apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json \
  --cache "${ZENBU_SUDACHI_BUILD_CACHE:-$HOME/Library/Caches/com.zenbujapanese.build/SudachiCore}" \
  --cache-only
```

It downloads the release `LanguageTechnologyPackCatalog.json` names from GitHub (72 MB) and checks
its SHA-256; later builds reuse it.

## Install on an iPhone

Check a change on a real iPhone when the Simulator can't show it: the camera, Apple Translation,
or how fast it feels. The app needs iOS 26.0 or later, and the Sudachi cache above.

### From the Mac the iPhone is connected to

1. Connect the iPhone by USB, or pair it over the same Wi-Fi, and tap **Trust** on it.
2. Open `apps/ios/ZenbuJapanese.xcodeproj`, sign in under Xcode → Settings → Accounts, and pick a
   team under the ZenbuJapanese target's **Signing & Capabilities**. On the Apple Developer team
   that publishes the app (the backup account's, while #616 is open), keep the bundle ID. A free
   Apple ID (a Personal Team) can't use `com.zenbujapanese.app`, which that team registered:
   change it to one of your own, such as `com.<you>.zenbujapanese`. The project sets no team, so
   picking one edits `project.pbxproj`; don't commit that edit, or a bundle ID change.
3. Choose the iPhone as the run destination and run.
4. If iOS asks, turn on Developer Mode under Settings → Privacy & Security → Developer Mode. With a
   free Apple ID, also trust it under Settings → General → VPN & Device Management.

### Beside the TestFlight app

To try unreleased work without replacing the TestFlight app, build it as **Zenbu Dev**. The
target's bundle ID ends in `ZENBU_BUNDLE_ID_SUFFIX` and its name is `ZENBU_DISPLAY_NAME` (empty and
`Zenbu Japanese` by default), so overriding them installs a separate app with its own data and
leaves `project.pbxproj` alone. From `apps/ios`, with the phone's UDID from
`xcrun devicectl list devices`:

```sh
xcodebuild -project ZenbuJapanese.xcodeproj -scheme ZenbuJapanese -configuration Debug \
  -destination 'platform=iOS,id=<device-udid>' -derivedDataPath /tmp/zenbu-dev \
  DEVELOPMENT_TEAM=<team-id> CODE_SIGN_STYLE=Automatic \
  ZENBU_BUNDLE_ID_SUFFIX=.dev ZENBU_DISPLAY_NAME="Zenbu Dev" -allowProvisioningUpdates build
xcrun devicectl device install app --device <device-udid> \
  "/tmp/zenbu-dev/Build/Products/Debug-iphoneos/Zenbu Japanese.app"
```

### From a Mac the iPhone can't reach

Remote Desktop doesn't pass an iPhone's USB connection through to a Mac, so Xcode on a cloud Mac
never sees the phone. Build an unsigned `.ipa` there, and install it from the computer the phone
is plugged into, whether it runs Windows, macOS, or Linux.

1. On the Mac, from the repository root, build for devices without signing and package the app:

   ```sh
   xcodebuild -project apps/ios/ZenbuJapanese.xcodeproj -scheme ZenbuJapanese \
     -configuration Release -destination 'generic/platform=iOS' \
     -derivedDataPath /tmp/zenbu-device CODE_SIGNING_ALLOWED=NO build
   rm -rf /tmp/zenbu-ipa && mkdir -p /tmp/zenbu-ipa/Payload
   ditto "/tmp/zenbu-device/Build/Products/Release-iphoneos/Zenbu Japanese.app" \
     "/tmp/zenbu-ipa/Payload/Zenbu Japanese.app"
   (cd /tmp/zenbu-ipa && zip -qry ZenbuJapanese.ipa Payload)
   ```

   `/tmp/zenbu-ipa/ZenbuJapanese.ipa` is about 320 MB, mostly the bundled dictionaries.
2. Copy it to the computer the iPhone is plugged into, for example through a cloud drive.
3. Install it with [iloader](https://github.com/nab138/iloader), a free, open-source sideloader.
   Download it only from that repository, since lookalike copies exist. It signs the app with the
   Apple ID you sign in with, a free one included, and installs it over USB.
4. On the iPhone, turn on Developer Mode if iOS asks, and trust the Apple ID under Settings →
   General → VPN & Device Management.

A free Apple ID's install stops opening after 7 days, and an Apple ID can keep at most 3 such apps
installed; install it again to renew it.

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
xcodebuild -scheme ZenbuJapaneseModules-Package \
  -destination 'platform=iOS Simulator,id=<booted-simulator-udid>' \
  ONLY_ACTIVE_ARCH=YES test
```

The Translate tab has its own test target, `TranslatorCoreTests`, and its own guide,
[`translate.md`](translate.md).

`SearchConformanceTests` checks Search against the shared conformance suite in
`apps/ios/LanguageData/Conformance/search-retrieval.json` (see ADR 0006). Only each result's
Language Reference ID and position are the contract; its headword and reading are there to make
the file and failures readable. After an intended
change to Search results or a dictionary rebuild, record it again by adding
`TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1` before the test command above, add
`-only-testing:SearchExperienceTests/SearchConformanceTests` after it, and review the diff.

That suite records order before frequency evidence re-sorts it. `SearchResultsConformanceTests`
records the results screen as the app shows it, in `search-results.json`: for each query, the
rows after `SearchResultFrequencyOrdering` re-sorts them with a fresh install's frequency
dictionaries (JLPT, then TUBELEX), each with its Language Reference ID, ent_seq, headword,
reading, summary, frequency chips (dictionary, value, tier), match group, and retrieval position;
the kanji row; the Example Sentences and reading-refinement rows; the frequency notice; and the
No Dictionary Matches state. It pins the SHA-256 of every bundled artifact it reads and the
dictionaries a fresh install enables. Recent searches and known words don't change the list. The suite covers queries that match
directly, deinflected queries (食べた, 見ない), romaji and English queries, wildcards (`t*`, `^t*`), and queries with no
matches that aren't Japanese. It doesn't cover Japanese queries with no direct match or
Discovered Words: Search splits those into words with the Sudachi dictionary the app bundles,
which the package's test host lacks, so recording fails on them. Check those in the Simulator.
The screen's titles, counts, and which rows it shows come from `SearchResultsScreen` in
`SearchResultsScreen.swift`, which the view and the suite share. Record it with
`-only-testing:SearchExperienceTests/SearchResultsConformanceTests`; add a query by adding its
`query` and `covers` fields and recording.

`ExampleSearchConformanceTests` records, in `example-search.json`, the Example Sentences screen
that Search's "View N Example Sentences" row opens: for each query, the row's count and title,
the entry the screen links words to, whether it lists that entry's examples (a deinflected or
romaji query) or the sentences that contain the query, every listed sentence's pair ID in order,
and the first five sentences' words with their entry, candidates, and whether the screen accents
them as the query's, read with the app's Kuromoji analysis. What the screen lists and accents
comes from `ExampleSentencesScreen` in `ExampleSentencesView.swift`, which the view,
`LinkedJapaneseText`, and the suite share. It pins `LanguageReferenceData.sqlite3`,
`ExampleWordIndex.sqlite3`, and the Kuromoji files. Record it with
`-only-testing:SearchExperienceTests/ExampleSearchConformanceTests`; add a query by adding its
`query` and `covers` fields and recording.

`WordDetailConformanceTests` and `KanjiDetailConformanceTests` do the same for the detail
screens, so the website's word pages and kanji details can be checked against the app. They check
`word-detail.json` and `kanji-detail.json` in the same folder, reading each case from the
models and clients the views use: for a word, its headword, furigana (with each kanji run's
per-kanji split, `JapaneseRubyText.kanjiReadings`), part of speech, pitch (with the contour
`PitchContourLayout` lays out for `PitchAccentBadge`), senses, default frequency packs (JLPT and
TUBELEX, each with the Frequency Details it opens, `FrequencyDisclosurePresentation`), the
conjugation table its part of speech opens (each form with the words `ConjugationsView` shows,
`sharedSpellings(of:in:)`, and the examples its screen lists: every pair ID, in order, from
`ConjugatedForm.examples`, and the first 3 with their linked tokens and which of them
`LinkedJapaneseText.matchesQuery` accents), kanji, and its first 25 examples with their linked tokens; for
a kanji, its metrics, meanings, readings with their words, elements, 24 words, and whether it
has stroke data. The views and the suite
share those helpers, so the suite records what the views draw. Each file pins the SHA-256 of
every bundled artifact it was recorded against. After an intended
change to either screen or its data, record them again with the same
`TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1` prefix and
`-only-testing:SearchExperienceTests/WordDetailConformanceTests` or
`-only-testing:SearchExperienceTests/KanjiDetailConformanceTests`, and review the diff.
Recording keeps each case's `id` or `character` and its `covers` note, so add a case by
adding those two fields and recording.

The website's dictionary service replays all five suites through the shared TypeScript core on
the same data ([`dictionary-api.md`](dictionary-api.md)), and the `Dictionary API` workflow runs
them on pull requests that change a suite, so commit a re-recorded suite with the change to the
core it needs. A change to a Swift file the core ports needs its port changed in the same PR
([`dictionary-core.md`](dictionary-core.md), and Swift the shared core ports, below). One thing
the website does isn't recorded yet: sentence search (Discovered Words, above). The service
checks it with its own test (`sentence-search.test.ts`) until a suite records it.

The `iOS` workflow ([`ci.md`](ci.md), iOS) runs the data tools' contract tests on pull requests
that change `apps/ios`, and `SearchExperienceTests` on a macOS runner only once the owners turn
that on. Until then, run `SearchExperienceTests` on a Mac, and verify ordinary app changes by also
building, launching, and inspecting the real app.

Frequency-pack selection has one repo-local Python contract test. Run
`python3 -m unittest discover -s apps/ios/Tools/tests -p test_frequency_pack_runtime_contract.py` to verify
that every selectable manifest pins a known evidence row and rank, each ordered source agrees
with the generated mapping analysis, the bundled TUBELEX artifact contains its pinned row, and
the bundled JLPT level pack matches its pinned source files and import report. It also checks
that 事, 時, 上, and 先生, spellings TUBELEX counts once although JMdict files them under several
entries, carry their rank on the one entry their UniDic lemma reading names (#440).

Examples for kana-headword words come from `ExampleWordIndex.sqlite3`, which is built against the
bundled `LanguageReferenceData.sqlite3`. Run
`python3 -m unittest discover -s apps/ios/Tools/tests -p test_example_word_index_contract.py` to verify that it
matches that database, its pinned source, and its import report. Without the index, as with a
test database, kana headwords get no examples rather than substring matches. Tatoeba's index
writes both the adverb 然う and the suffix そう as bare そう, so those sentences link to neither.

Pitch for two-part compounds UniDic doesn't list whole, such as 記者会見, comes from
`CompoundPitch.sqlite3`, also built against that database. Run
`python3 -m unittest discover -s apps/ios/Tools/tests -p test_compound_pitch_contract.py` to verify it.

Every frequency pack, the example word index, and the compound pitch estimates pin the SHA-256 of
`LanguageReferenceData.sqlite3`, and each data tool records its own SHA-256 in what it builds, so
the language data is rebuilt as a whole, with one command on the pinned Python:

```sh
uv run --no-project --python 3.14.8 python apps/ios/Tools/rebuild_language_data.py --download
```

It runs every importer in order, copies each pack's import report into its catalog manifest,
moves the previous manifests of downloadable packs into `trustedHistoricalManifests` so packs a
learner already installed stay trusted, and runs the contract tests. Then re-record the five
suites above and review their diffs. [`apps/ios/Tools/README.md`](../../apps/ios/Tools/README.md)
says what each tool builds, why the Python is pinned, and how to move to a newer source snapshot.

Downloadable packs are served from `cdn.zenbujapanese.com` (Cloudflare R2 bucket
`zenbujapanese-cdn`), never from upstream hosts. Point a new or changed manifest's `downloadURL`
at `https://cdn.zenbujapanese.com/frequency-packs/<packID>/<sourceSHA256>.<ext>`, then upload the
verified source file with
`CLOUDFLARE_ACCOUNT_ID=<SERP account> python3 apps/ios/Tools/publish_frequency_pack_sources.py <file>…`.
The tool matches files by size and SHA-256 and re-downloads each public URL to verify it. Never
overwrite or delete an object: trusted historical manifests still reference it.

## Swift the shared core ports

`packages/dictionary-core/src/` ports parts of `apps/ios/Modules/Sources/SearchExperience/`: the
Swift sources section of [`dictionary-core.md`](dictionary-core.md) maps each module to the Swift
it ports. The `Search parity` workflow ([`ci.md`](ci.md)) fails a pull request that changes one
side of a pair without the other; change both, and re-record the suite that covers the change.

## Search and linked text

`LookupClient` retrieves a relevance-filtered, deduplicated set in dictionary order and never
reads frequency; `SearchResultFrequencyOrdering` reorders only that bounded
set. An exact dictionary form stays first (した is 下 and 舌 before する), then deinflected lemmas
by chain length, so a direct conjugation (まけたら → 負ける) outranks a longer chain, then prefix
and contains matches. Radical searches keep only the leading lexical-rank group.

`JapaneseDeinflector` rewrites suffixes in chains: after the first rule, a rule applies only when
its input classes include the class the previous one produced (ない is an i-adjective, so
なかった → ない → the base). Its candidates are hypotheses, kept only when an entry with that exact
form has a matching part of speech. Romaji can't tell which godan base a past or te-form had, so
`SearchQuery` offers every dictionary-form candidate, irregular verbs first (kita is also the past
of kiru), and -sete gives both -seru and -su (makasete: 任せる, 任す, 負かす).

`JapaneseInflectionGrouping` joins a verb or adjective with the pieces both parsers split off, so
見なかった links as one word: auxiliaries, the connectives て, で, and ば, IPADIC's suffix verbs
(れる, られる, せる, させる, tagged 接尾), and helper verbs after て (tagged 非自立). A na-adjective
stem (IPADIC: a noun tagged 形容動詞語幹; UniDic: 形状詞) joins one following な, で, or に, but not
the copula, so 静かだ stays 静か + だ. A joined word resolves through its head's forms only, since
its surface can match an unrelated headword (しまった is also the interjection "darn it!"), and
falls back to its pieces when the head resolves to nothing.

`PartOfSpeech` raw values are stable identifiers the JMdict importer writes, and
`PartOfSpeechFormatter` owns every learner-facing word for them, so rewording needs no
language-data rebuild. Romaji is Foundation's ICU transliteration as is
(`ReadingAidPresentation.swift`), deliberately without app-owned corrections for particles or
long vowels.

## Frequency packs

`FrequencyPackManager` trusts a pack only while its files match what its manifest pins: the
artifact, `languageDataSHA256`, and `mappingPolicySHA256`, the bundled mapping SQL the installer
runs on the device. `FrequencyPackMappingV1.sql` matches forms only; `FrequencyPackMappingV2.sql`
also requires a row's reading when it has one, honoring JMdict's reading restrictions, and maps
rows without one as V1 does. The catalog, the `search-results.json` suite, the analysis reports,
and the language-data release all pin those files byte for byte, so never edit one in place, not
even a comment: every pack that pins it would fail verification.

A manifest's encoding also feeds the trust hashes of installed packs, so anything outside a
pack's contract stays out of it: `kind` is omitted for rank packs, and chip names (`shortName`)
are matched by pack family, the ID's first three parts, so a rebuilt pack keeps its label. A
historical manifest can share its pack version with the current one when only derived hashes
changed, as after a language-data rebuild.

An artifact's content digest (`FrequencyPackArtifactContent` in `FrequencyPackArtifact.swift`, matched by
`import_frequency_pack.py`) hashes `zenbu.frequency-pack-content.v1` and a NUL byte, then the
metadata sorted by key, each UTF-8 key and value prefixed with its byte length as an unsigned
64-bit big-endian integer; `FrequencyPackContentDigestV1.json` is a test vector. Its
`mapping_sha256` hashes every evidence row in ID order (a level pack's: each ID's 16 bytes, then
its level as an unsigned 64-bit big-endian integer), so SQLite's page layout never changes it.

Verification hashes every row, so the manager keeps verified artifacts for later lookups, and
`SearchExperienceRootView` opens the store and loads kanji readings at launch, off the main
actor, to keep that work out of the first search. Lookups bind the raw 16-byte ID so SQLite uses
the primary key; `FrequencyLookupPerformanceTests` fails if they go back to scanning.

## Local stores

Known words (`WordKnowledge.swift`) and word lists (`WordLists.swift`) each keep one versioned
JSON file through `LocalJSONFile`, loaded once off the main actor and rewritten in full, with
dates in milliseconds since 1970. `LocalFileWriteQueue` runs the load and then each write in
order, so a write never races the load. A file this version can't read in full is copied aside
(the newest few copies are kept) before its readable records replace it, and records decode one
at a time (`LossyDecodable`), so one bad record doesn't lose the rest. A file from a newer
version, or one that can't be read at launch (before the device's first unlock), is never written
over; the store is read-only instead.

Both files are at version 2, which added kanji; a version 1 app would read kanji as words, so it
opens a version 2 file read-only. A word is keyed by its Language Reference ID and a kanji by
`kanji:` and the character (`SavedItem.storedID`), which can't collide with the hexadecimal ID.
Marking a word unknown keeps its record, so a later sync can tell a removal from no status. List
records are shaped to become database rows, and a membership keeps its headword so the word can
still be found if its entry's ID changes.

## Image Search and Apple Intelligence

`ImageTextRecognitionClient` uses Swift Vision's `RecognizeTextRequest`, which reads vertical
Japanese right to left; `VNRecognizeTextRequest` returns nothing for vertical Japanese. A line is
vertical when its characters advance downward, measured in image pixels so a wide or tall image
doesn't skew it; a single character falls back to its box's shape. Vision's y axis points up, so
a later piece of a column sits lower.

`ImageTextExplanationClient` runs Apple's on-device model with the
`.permissiveContentTransformations` guardrails, because the default ones refused an ordinary novel
page about illness. Those cover plain-text responses only, so translation and Context ask for
plain text (translation parses numbered lines) rather than guided generation. The model's context
is small: Context reads a page's first 1,200 characters, and translation goes in batches under
that. The model only picks idioms, since it confidently misread them (背水の陣 as "a surprise
attack") and translated them word by word (木を見て森を見ず). A pick is kept only when its entry
is tagged as an expression or it's a phrase of four or more characters, such as 背水の陣: single
words such as する matched unrelated entries (擦る, "to rub").

## Player and YouTube

`YouTubePlayer` loads YouTube's IFrame player with `https://zenbujapanese.com` as its origin and
referrer, which YouTube requires for embedded playback; error 101 or 150 means the owner
disallows embedding. While one line plays, time reports from before its seek landed are ignored.

`YouTubeCaptionClient` fetches timed text in its default `<transcript><text start dur>` XML, so it
drops any `fmt` from the track URL; the text escapes HTML entities twice (`&amp;#39;`). Automatic
captions overlap, so each line ends when the next begins. YouTube's translated track keeps the
Japanese track's time slots, leaves them empty while a sentence continues, and puts the whole
sentence in its last slot; `YouTubeCaptionParsing` rebuilds sentences from that, rejoining words
split across slots ("Do" and "n't"), before pairing them with lines.

`VideoSearchView` watches the web view's URL as well as its loads, because YouTube's mobile site
changes pages without loading them, and requires a tap before any media plays, so results pages'
previews stay still.

## SwiftUI notes

- A plain `List` pins section headers and footers over scrolling rows, so Search's headings
  (`SearchListHeading`) and frequency notice are rows.
- SwiftUI can miss the last keystroke before Return, so `SearchView` searches again when the query
  changed without SwiftUI starting a newer task; otherwise Searching stays on screen.
- `ExampleSentenceSections` keeps loaded rows while refreshing, so a Back transition doesn't
  collapse the `List` and lose its scroll position.
- The word sheet (`WordSheetPresentation` in `RecognizedWordSheet.swift`) swaps the word inside a
  `sheet(isPresented:)`: with `sheet(item:)`, each new word dismissed and re-presented the sheet,
  which reopened at full height.
- Image Search's Translate view starts from `.task(id: model.selectedPage)`, because a neighboring
  page's view appears before `selectPage` runs, and `selectPage` cancels what the old page started.
- Lists' swipe actions allow no full swipe, and Delete has no destructive role, so a list is never
  deleted by swiping too far and its row stays while the deletion is confirmed.
- The compiled asset catalog exposes the app icon only through the `CFBundleIcons` file names in
  Info.plist, which Account reads to show it.

## App conventions

- `ZenbuTheme` holds the only app-owned colors, for learning evidence: radical selection, the
  animated stroke, and the pitch downstep. Everything else uses SwiftUI's system styles.
- Account's support and privacy URLs (`AccountAndMediaLibraryView.swift`) match the App Store
  listing's in `apps/ios/metadata/`; change both together.
- `CreditsView` links the documentation of each EDRDG file (JMdict, KANJIDIC2, RADKFILE), as the
  EDRDG licence requires.

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
