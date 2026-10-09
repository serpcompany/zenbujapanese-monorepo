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
2. Open `apps/ios/ZenbuJapanese.xcodeproj` and sign in under Xcode → Settings → Accounts. The
   ZenbuJapanese target signs with the team that publishes the app, TSMC LLC's `847HR8U8D9`, and
   the bundle ID that team registered, `com.zenbujapanese.dictionary` (The App Store record,
   below). With
   any other Apple ID, such as a free one (a Personal Team), pick your team under the target's
   **Signing & Capabilities** and change the bundle ID to one of your own, such as
   `com.<you>.zenbujapanese`. A Personal Team can't sign Associated Domains or Sign in with Apple
   either, so also remove those capabilities
   ([Links from the website](#links-from-the-website), [Account and sync](#account-and-sync)).
   Such a build still shows the Apple button, which fails; sign in with an emailed code, or with
   Google in a build given its client ID. Don't commit the team, the bundle ID change, or the
   removed capabilities.
3. Choose the iPhone as the run destination and run.
4. If iOS asks, turn on Developer Mode under Settings → Privacy & Security → Developer Mode. With a
   free Apple ID, also trust it under Settings → General → VPN & Device Management.

### Beside the TestFlight app

To try unreleased work without replacing the TestFlight app, build it as **Zenbu Dev**. The
target's bundle ID ends in `ZENBU_BUNDLE_ID_SUFFIX` and its name is `ZENBU_DISPLAY_NAME` (empty and
`Zenbu Japanese` by default), so overriding them installs a separate app with its own data and
leaves `project.pbxproj` alone. Its icon is the blue `AppIcon-Dev` (in
`apps/ios/App/Assets.xcassets`), chosen by `ASSETCATALOG_COMPILER_APPICON_NAME`, so it's easy to
tell from the red TestFlight app. From `apps/ios`, with the phone's UDID from
`xcrun devicectl list devices`:

```sh
xcodebuild -project ZenbuJapanese.xcodeproj -scheme ZenbuJapanese -configuration Debug \
  -destination 'platform=iOS,id=<device-udid>' -derivedDataPath /tmp/zenbu-dev \
  CODE_SIGN_STYLE=Automatic \
  ZENBU_BUNDLE_ID_SUFFIX=.dev ZENBU_DISPLAY_NAME="Zenbu Dev" \
  ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon-Dev -allowProvisioningUpdates build
xcrun devicectl device install app --device <device-udid> \
  "/tmp/zenbu-dev/Build/Products/Debug-iphoneos/Zenbu Japanese.app"
```

Zenbu Dev signs in to the account with Google or an emailed code, not with Apple (Account and sync,
below).

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

## Links from the website

The app opens zenbujapanese.com's search and word URLs, and the kanji URLs the website removed,
as universal links (#568; what each opens is in the [product docs](../../apps/ios/docs/product/dictionary.md#links-from-zenbujapanesecom)).
`apps/ios/App/ZenbuJapanese.entitlements` claims `applinks:zenbujapanese.com`, and iOS opens a
link in the app only once it has fetched the site's association file, through Apple's CDN, and
found the app's ID in it ([`web.md`](web.md), Links that open the app). That takes two things
only a person can do: enable Associated Domains for the App ID `com.zenbujapanese.dictionary` in
the Apple Developer team that holds it, TSMC LLC's, and set the website's `APPLE_TEAM_ID` to that
team, `847HR8U8D9`.

SwiftUI hands a universal link to `onOpenURL` in `WebsiteLinkOpening` (`WebsiteLinkOpening.swift`),
which `SearchExperienceRootView` applies. It switches to Search from any tab, Translate included,
and `WebsiteLinkRoute.apply` puts the route on Search's stack. `WebsiteLink`
(`WebsiteLink.swift`) reads it: the website's URL shapes, decoded one path segment at a time,
and the Language Reference ID of a word URL's JMdict entry number, derived as
`apps/ios/Tools/jmdict_normalization.py` does (the first 16 bytes of the SHA-256 of
`edrdg.jmdict`, a NUL, and the number). It reads only the host and path, so a URL with any
scheme and the host `zenbujapanese.com` routes the same way.

Check it with `WebsiteLinkTests`. The Simulator sends an `https` link to Safari until the
association file is live, which would also load the site, so to see a link land in the app
before then, build without the entitlements and with a URL scheme that is never committed, added
to a copy of the app's `Info.plist` so the account service's settings stay, and open the same URL
under that scheme:

```sh
cp apps/ios/App/Info.plist /tmp/link-check.plist
plutil -insert CFBundleURLTypes -json '[{"CFBundleURLSchemes":["zenbu-check"]}]' /tmp/link-check.plist
xcodebuild -project apps/ios/ZenbuJapanese.xcodeproj -scheme ZenbuJapanese \
  -destination 'platform=iOS Simulator,id=<udid>' ONLY_ACTIVE_ARCH=YES ARCHS=arm64 \
  INFOPLIST_FILE=/tmp/link-check.plist CODE_SIGN_ENTITLEMENTS= build
xcrun simctl openurl <udid> 'zenbu-check://zenbujapanese.com/dictionary/見る-1259290/'
```

Once the file is live, check it on a device: tapping
`https://zenbujapanese.com/dictionary/見る-1259290/` in Notes or Messages opens 見る's Word
Detail, and the same link opens the website on a device without the app.

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
dictionaries a fresh install enables. It records the **Default** order: the learner's Sort By
choice (`SearchResultSortOrdering` in `SearchResultSort.swift`) re-sorts these rows in the view
afterwards, and `SearchResultSortTests` covers it. Recent searches and known words don't change
the recorded list. The suite covers queries that match
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
that change `apps/ios`, and `SearchExperienceTests`, `TranslatorCoreTests`, and the recorded-audio
check's scoring tests on a macOS runner only once the owners turn that on. Until then, run them on
a Mac, and verify ordinary app changes by also building, launching, and inspecting the real app.

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

An English query's match groups (`EnglishDictionaryPresentationRank`) are the evidence lane, the
romaji specificity for romaji-only matches, and whether a strong gloss is in a later sense; the
frequency re-sort reorders within a group, so 犬's "dog (Canis (lupus) familiaris)" competes with
ワン子's "dog" on frequency (#701). `glossRelation` counts notes in parentheses only when they run to
the end of the gloss (`endsInNote`), so "soft (and fluffy) (e.g. bed)" is "soft" and "to (take
out and) show" is a mention of "to". Within a group,
`EnglishDictionaryRank` breaks ties by JMdict priority, sense, gloss order, romaji corroboration,
headword length, and fingerprint. `EnglishSearchCommonWordTests` checks the common word leads
dog, water, cat, eat, and house on the bundled data, independent of the recorded suites.

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
still be found if its entry's ID changes. Each store reports a learner's change to the account
sync (`changeObserver`), and takes the account's changes through `applySynced`, which reports
nothing (Account and sync, below).

## Account and sync

The app signs in to the account service and syncs known words, lists, watch history, and
Translate's bookmarked sentences as the client guide says ([`account-clients.md`](account-clients.md)), as `zenbu-ios`. The code is in
`SearchExperience`: `ZenbuAccount.swift` (sign-in, signing out, deleting),
`AccountServiceConfiguration.swift`, `AccountAPI.swift` and `AccountSyncModels.swift` (the routes and
their answers), `AccountTokens.swift`, `AccountSync.swift` and `AccountSyncState.swift` (the queue
and how results and changes apply), `AccountSyncScheduler.swift` and `AccountBackgroundSync.swift`
(when), `AppleSignIn.swift`, `GoogleSignIn.swift`, and the views `AccountSignInControls.swift`,
`AccountSignInView.swift`, `ZenbuAccountView.swift`, and `DeleteAccountView.swift`.
`apps/account-api/src/test/sync-client.ts` models the same client in TypeScript, and the service's
tests prove that model against the real service.

- **Which service.** The build setting `ZENBU_ACCOUNT_API_URL` fills `ZenbuAccountServiceURL` in
  `apps/ios/App/Info.plist`: staging (`https://api-staging.zenbujapanese.com`) in Debug, Zenbu Dev
  included, and production (`https://api.zenbujapanese.com`) in Release, so a TestFlight or App
  Store build signs in to production (Sign-in in the App Store build, below). A build naming no
  service has no **Sign In to Sync** row on Account, and queues nothing: the stores' observers are
  only set by the account, and a phone that never signed in queues nothing anyway.
  `apps/ios/Tools/tests/test_account_service_settings.py` pins Release on production and Debug on
  staging, each with Google's iOS client, in the `iOS` workflow's `contracts` job. For a service on the Mac ([`account-api.md`](account-api.md), Run it), launch with
  the argument `-ZenbuAccountServiceURL http://127.0.0.1:8789` or the environment variable
  `ZENBU_ACCOUNT_API_URL`, or build with `ZENBU_ACCOUNT_API_URL=http://127.0.0.1:8789` so every
  launch, a background one too, uses it. The Simulator reaches the Mac's `127.0.0.1`, and App
  Transport Security allows plain HTTP to an IP address.
- **Apple.** `apps/ios/App/ZenbuJapanese.entitlements` asks for Sign in with Apple, which the App ID
  (`com.zenbujapanese.dictionary`) needs in Apple Developer. The app asks the service for a nonce and gives
  Apple its SHA-256 (`AppleSignIn.swift`), asking for the email and the name; Apple gives the name
  only on a learner's first sign-in, and the app sends it then as `idToken.user.name`, so a new
  account has one. Apple's token names the app's bundle ID, and the service takes only the bundle
  IDs in `apps/account-api/src/domain/clients.ts`, its `APPLE_APP_BUNDLE_IDENTIFIER`, and its
  website Services IDs, so a Zenbu Dev build (`com.zenbujapanese.dictionary.dev`) can't sign in with
  Apple. The app shows the Apple button whenever the build isn't Zenbu Dev, whatever the service
  has set up: a service without Apple answers its sign-in `404 provider_not_found`. `ZENBU_BUNDLE_ID_SUFFIX` reaches the app as
  `ZenbuBundleIDSuffix` in `apps/ios/App/Info.plist`; when it isn't empty, the sign-in sheet shows a
  note in place of the Apple button, and deleting an Apple account says to use the App Store or
  TestFlight app. Google and emailed codes work in Zenbu Dev.
- **Google** needs no SDK: `ASWebAuthenticationSession` opens Google's OAuth for iOS with PKCE, the
  nonce, and the reversed client ID as the redirect, which the session catches itself, so no URL
  type is registered. The app exchanges the code at Google's token endpoint for the ID token. The
  build setting `ZENBU_GOOGLE_IOS_CLIENT_ID` fills `ZenbuGoogleIOSClientID` in
  `apps/ios/App/Info.plist` with the iOS OAuth client's ID, which isn't secret: `881343714137-8v279fqjrkk1qeg18opnqbac41jteoqq.apps.googleusercontent.com`
  in both configurations. Without it the Google button isn't shown. Its reversed
  form, `com.googleusercontent.apps.881343714137-8v279fqjrkk1qeg18opnqbac41jteoqq`, is the
  redirect's scheme (`GoogleSignIn.redirectScheme`). The same ID is in staging's and production's
  `GOOGLE_CLIENT_IDS`, after the web client's.
- **Tokens.** The signed session token (`set-auth-token`) is kept in the Keychain (service
  `com.zenbujapanese.dictionary.account`, readable after the first unlock, on this device only), and sent
  only to `/v1/auth`. The 15-minute access token stays in memory, refreshed within a minute of its
  `exp` or after a `401`; when `/v1/auth/token` answers `401`, the app signs out and keeps its data.
  The `URLSession` keeps no cookies. A session token in the Keychain without `account-sync.json`
  (a reinstall) is deleted.
- **The queue.** `account-sync.json`, beside the stores, holds the account's ID and email, the
  queue, the cursor, the last sync, each entity's server version, and list words waiting for their
  list. A learner's change becomes a queued mutation with a new ID and, as `baseVersion`, the
  entity's last server version (or the base of a change to it still queued). A change made before
  the file loads is queued once it has.
- **Signing in and out.** Signing out forgets the session token but keeps the queue, cursor,
  versions, and waiting words under the account's user ID (`signedOutFrom`), and keeps queuing
  changes with their base versions. While signed out (`signedOutQueueStart`), a change replaces an
  earlier one to the same known word or list word from the same signed-out stretch, a list's
  renames and moves merge into its earlier `create` or `update`, and its `delete` replaces an
  earlier `update`, so the queue holds about one change per entity however long the learner stays
  signed out. Nothing queued before signing out is merged, since it may have been sent.
  Signing in to the same user ID picks them up and syncs from the kept cursor. Signing in to any other account drops them, moves Favorites to its shared ID
  (`WordLists.favoritesID`, from the oldest list if it's still named Favorites), and queues the
  phone's marks, lists, list words, Recent videos, and bookmarked sentences at version 0 before the
  first sync. Deleting the account drops everything.
- **Entities added later.** `account-sync.json` names the entities the account's first upload
  covered (`syncedEntities`; a file without it covered known words, lists, and list words). A phone
  that signed in before its app synced an entity, such as watch history, queues that entity's items
  at version 0 on its launch's first sync, and syncs from no cursor, since its cursor passed that
  entity's changes. A change the service rejects as `unknown_entity`, from a service older than the
  app, isn't undone: its entity is marked not uploaded and its other queued changes are dropped, so
  the phone stops sending them, and each launch's first sync uploads that entity again, from no
  cursor, until the service knows it.
- **Watch history.** `WatchHistory` (`WatchHistory.swift`, in `UserDefaults` under
  `watch.recent-videos.v1`) reports each `record` and swipe removal through `changeObserver`, and
  takes the account's copies through `applySynced`, which report nothing. It keeps the 50 newest
  by `watchedAt` either way, so a video dropped past 50 sends no `remove`: the account prunes its
  own. A video saved before Recent kept a time is dated from 2000-01-01 when the history loads, a
  second apart in its order, so it keeps its place on the phone and every video watched since,
  anywhere, is newer. Each `record` queues the whole video as a `watch`, dated by the phone's
  clock, and a newer change to a video replaces a queued one that isn't its first, the only one
  that can be on its way, so a waiting watch is replaced rather than joined.
  `WatchSessionView` records the video as it opens, as its captions, length, and comprehension
  arrive, and as it closes. A pulled video whose ID isn't a YouTube video ID, or isn't the
  change's, is left out. The file keeps a removed or pruned video's version for the latest 100
  (`goneVideos`), as the account remembers its latest 100.
- **Translate bookmarks.** `ConversationHistory.shared` (in `TranslatorCore`) reports each bookmark
  and un-bookmark through `bookmarkObserver`, with the sentence's text, translation, language, and
  `bookmarkedAt`, and never the conversation; deleting a conversation reports its bookmarks
  removed. `AccountSync`, in `SearchExperience`, turns those into `bookmarkedSentence` changes, so
  `TranslatorCore` still imports nothing of the app's (ADR 0011). The account's copies come in
  through `applySynced` and `applySyncedRemoval(ofBookmark:)`: a sentence in a conversation on this
  phone is marked there, and any other is kept in `Synced Bookmarks/bookmarks.json`, inside the
  conversations folder, which `ConversationHistory.bookmarks` lists beside the conversations' own,
  newest first, each sentence once. Its writes merge, so a pull of many writes the file about once.
  Sync waits for the history to load, and stops, as for an unreadable lists file, while that file
  can't be read (`bookmarksAreReadOnly`), for whatever reason, until the next launch reads it;
  Zenbu Account says so and disables **Sync Now** (`waitsForUnreadableBookmarks`). The cursor is
  saved only after the history's writes finish.
- **Favorites** has one ID in every app ([`account-clients.md`](account-clients.md), The rules, from
  your side). A second phone's `create` of it is rejected `already_exists`, which the first upload
  never undoes: the account's copy comes down, and the phone's words still add. If that copy comes
  down deleted (`accountHadFavorites`), the phone keeps its list under a new ID and uploads it with
  its words. Any other list the account deleted is deleted on the phone. A list screen open on
  the old ID follows the list: `WordLists.moveList` records each move, and `WordListView` reads
  its list through `WordLists.currentID(of:)`.
- **List order.** Lists sort by position, then by `createdAt`, then by ID, and a pulled list takes
  the account's `createdAt`, so lists that share a position, as when a first upload sends one into
  a place the account already used, show in the same order on every device.
- **A sync** sends up to 50 queued changes, at most 48 KB of them (the service takes 64 KB), and at
  most one per entity, so a second change to an entity goes after the first's result and is moved
  onto its version. An answer lost on the way is sent again unchanged. `applied` keeps the version;
  `conflict` takes `current`; `rejected` undoes the change with what it recorded (a word's earlier
  status, a list's earlier name), unless a later change to the entity is queued, and never undoes
  the first upload, so a list the account already has stays. A pulled copy of an entity with a
  change still queued is held in the file (`deferred`) until that change's result: a conflict's
  `current` replaces it, an applied result takes it only at the same version (the change changed
  nothing, so no newer copy comes), and a rejected one takes it. A list word whose list hasn't arrived is kept in the file until a sync
  reaches `hasMore: false`, even across a failed page or a relaunch, then dropped if the list never
  came. A deleted list drops its words. `410` drops the cursor and the held copies and words, and syncs
  again, still sending the queue. A sync's answer is dropped if the learner signed out or in while
  it was on the way.
- **When.** `AccountSyncScheduler` syncs a second after a local change, on becoming active (once
  the files have loaded) when changes are queued or the last sync is over 15 minutes old, in a
  `BGAppRefreshTask` (`com.zenbujapanese.dictionary.account-sync`, scheduled 15 minutes out on going to the
  background, and stopped when iOS ends it), and on **Sync Now**. Never on a timer. A network
  failure or `5xx` waits 2 seconds, doubling up to 5 minutes, at half to all of that at random, and
  retries by itself at most 10 times, only in the foreground; a local change or becoming active
  waits it out too, and **Sync Now** doesn't. `429` waits what `Retry-After` says, whatever starts
  the sync.
- **Deleting** signs in again first (Apple when `GET /v1/auth/list-accounts` lists it, keeping the
  authorization code), refuses a sign-in to another account, and signs out the session the new
  sign-in replaces. Then it calls `DELETE /v1/me` and signs out. Each attempt with Apple uses a new
  code. If the answer is lost, the app asks `/v1/auth/token`: a `401` means the account is gone.

`AccountSignInTests`, `AccountSyncTests`, `AccountSyncConflictTests`, `AccountSyncRecoveryTests`,
`AccountSyncWatchHistoryTests`, `AccountSyncBookmarkTests`, and `AccountSignedOutTests` run the client against a stub server (`StubAccountServer`, a `URLProtocol`):
sign-in, tokens and their refresh, the queue and cursor across a relaunch, retries under the same
mutation IDs, each entity's conflicts and rejections, order and paging, list words held across a
failed page, the request size, `410`, `429` and backoff, and signing out and deleting, which keep
the phone's data. `AccountSignedOutTests` runs against `FakeAccountService`, a small copy of the
service's sync rules, so two installs can share one account: changes made while signed out going
to the same account, another account starting over, and two phones ending with one Favorites.
`AccountSyncWatchHistoryTests` covers Recent's first upload, a newer watch replacing an unsent one,
pulled videos kept to the newest 50, removals both ways, a watch that lost to a removal, a
rejected watch, a phone catching up on watch history, a service that doesn't know watch history
yet, old videos' dates, the kept versions' bound, bad pulled IDs, and two phones through
`FakeAccountService`. `AccountSyncBookmarkTests` covers the first upload sending each bookmarked
sentence and nothing else said, the queue, a bookmark from another device listed on its own and
removed, an un-bookmark that lost to a newer bookmark, a rejected bookmark, deleting a
conversation, an unreadable synced bookmarks file pausing sync, a pulled ID that isn't its
change's, a service that doesn't know bookmarks yet, catching up, and two phones.

### Sign-in in the App Store build

Release builds sign in to production's account service with Apple, Google, and emailed codes, from
2.0.0 (#616). That needs production's service holding TSMC LLC's Sign in with Apple key
([`account-api.md`](account-api.md), Set up the server, Moving from the backup team): with
another team's key, Apple refuses the client secret it makes for `com.zenbujapanese.dictionary`,
so deleting an account made with Apple answers `503 apple_unavailable`, and App Review requires
deleting to work. The privacy manifest (`apps/ios/App/PrivacyInfo.xcprivacy`) lists what the
account collects, and the App Store privacy labels match it
([`app-store-privacy-labels.md`](../../apps/web/docs/app-store-privacy-labels.md)).

What a person sets up first, once, in Apple Developer on the team that holds the app (TSMC LLC,
`847HR8U8D9`), and in Google Cloud:

- **The App ID** `com.zenbujapanese.dictionary` (Certificates, Identifiers & Profiles →
  Identifiers): Sign in with Apple, enabled as a primary App ID, and Associated Domains. Xcode's
  automatic signing then makes new profiles at the next archive; until the capabilities are on, an
  archive fails to sign. Zenbu Dev's `com.zenbujapanese.dictionary.dev` needs both too, since it
  shares the entitlements, though the service takes no Apple sign-in from it.
- **The service's Apple settings:** the Sign in with Apple key and every `APPLE_*` setting
  ([`account-api.md`](account-api.md), Set up the server, step 3), before a build with the Apple
  button reaches testers.
- **Google:** the iOS OAuth client for `com.zenbujapanese.dictionary`
  ([`account-api.md`](account-api.md), Set up the server, step 3). Its client ID is Debug's
  `ZENBU_GOOGLE_IOS_CLIENT_ID` in `apps/ios/ZenbuJapanese.xcodeproj/project.pbxproj` and in the
  service's `GOOGLE_CLIENT_IDS`, and Release's too. Without it the app offers Apple and a code
  only.

### The App Store record

The app is TSMC LLC's App Store record "Zenbu Japanese" (Apple ID 6800229215, bundle ID
`com.zenbujapanese.dictionary`, team `847HR8U8D9`), the record 1.0 shipped on, so 2.0.0 is an
update to 1.0 (#616). The project sets that team and bundle ID in
both configurations, and `apps/ios/Tools/tests/test_account_service_settings.py` pins them. The
rebuilt app went to review first from a backup account (team `W3GXL2NQQP`, bundle ID
`com.zenbujapanese.app`, record 6819885342, never released), while TSMC LLC's account was being
converted to a business account; nothing ships from it.

The listing is `apps/ios/metadata/` (the name and subtitle in `app-info/`, the description, What's
New, keywords, and promotional text in `version/1.0/`), and its screenshots are
`apps/ios/screenshots/app-store/en-US/iphone-63-marketing-v2/`, made with koubou from
`koubou-v2.yaml`, and the same shots at 6.9" in `iphone-69-marketing-v2/`, which App Store
Connect requires: each scaled to 1320 × 2870 with Lanczos and cropped a pixel at the top and
bottom to 1320 × 2868.

**A TestFlight build:**

1. In a pull request, raise `CURRENT_PROJECT_VERSION` in both of the app target's configurations,
   as "Prepare build 20 of 1.0.1 for TestFlight" did, and merge it. For a new version, raise
   `MARKETING_VERSION` instead and set `CURRENT_PROJECT_VERSION` back to 1.
2. On a Mac signed in to TSMC LLC's team under Xcode → Settings → Accounts, with a checkout of
   `main`, open `apps/ios/ZenbuJapanese.xcodeproj`, pick the `ZenbuJapanese` scheme and **Any iOS
   Device (arm64)**, then Product → Archive.
3. In the Organizer: Distribute App → App Store Connect → Upload.
4. In App Store Connect, the build appears under TestFlight once it's processed, about 15 minutes
   later, with no export compliance question (both configurations set
   `ITSAppUsesNonExemptEncryption` to `NO`); add the testers.

Before submitting a version, open it in App Store Connect and check **Version Release**: choose
**Manually release this version** unless it should go live on approval.
`asc versions create --release-type MANUAL` left 2.0.0 on automatic release, so it went live as
soon as App Review approved it; `asc versions list --app 6800229215 --output json` shows each
version's `releaseType`.

Check it on a device from TestFlight: signing in with Apple, Google, and a code reaches
production's service, a change syncs to a second device, and deleting the account works.

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
- Translate's Image alert only records the choice, and the home opens the picker once the alert's
  binding turns false: on the iOS 27 Simulator, a picker presented from a `confirmationDialog`
  button's action never appeared, while one presented from this `onChange` does.
- `ImageTextImport` pushes Image Search only once its picker has finished closing (the sheets'
  `onDismiss`), so the photo library is a
  `PHPickerViewController` in a sheet (`ImagePhotoLibraryPicker`) rather than `photosPicker`,
  whose binding turns false while it is still closing. Pushed any earlier, Image Search loses its
  title and shows a Back button beside its own close button.
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
- The privacy manifest (`apps/ios/App/PrivacyInfo.xcprivacy`) declares what the Zenbu account
  collects: email, name, user IDs, synced user content, session data and a profile picture's
  address, watch history, and where each video was stopped with the share of its words known. The app's data, the App Store privacy labels, and the manifest change
  together, as the
  [App Store privacy labels](../../apps/web/docs/app-store-privacy-labels.md) say.
- `CreditsView` links the documentation of each EDRDG file (JMdict, KANJIDIC2, RADKFILE), as the
  EDRDG licence requires.

## Search manual checks

Search ordering, deinflection, and frequency-chip rules are covered by `SearchExperienceTests`.
When changing Search results or frequency dictionaries, also check in the Simulator:

- `いる` shows chips in the Enabled order (JLPT first by default). Reordering or disabling
  dictionaries under **Account → Frequency Dictionaries** re-sorts the visible results without
  resubmitting, and disabling every dictionary removes the chips.
- Under **Account → Frequency Dictionaries**, tapping download on three **Available** packs in a
  row gives each its own progress ring; tapping one ring stops only that pack, which returns to
  its download button and doesn't install, and the others install and move to **Enabled**.
- `静` keeps its Kanji row first; `日本語を勉強する` shows **Discovered Words**; `見る` offers
  Example Sentences; `sensei` offers the Japanese-reading refinement (「せんせい」).
- With a pack made unreadable in a debug container, results stay listed and the footer names
  the unavailable dictionary.
- Rapidly submitting `quiet`, `miru`, then `いる` leaves only `いる` results.
- The **Sorted by …** row on `dog`, `いる`, and `miru`: each dictionary, most common first, moves
  that dictionary's chip first and puts the words it doesn't rank last; **Known Words** moves a
  word marked known by swiping at once. The row names the order, and **Default** in its menu
  returns to the Default order. The choice survives relaunching the app, and disabling the
  chosen dictionary under **Account → Frequency Dictionaries** returns Search to **Default**.
- The menu shows only **Sort By** and **Filter**, each naming its current choice underneath. **Sort By** lists
  the sorts with no direction to choose.
- **Filter** on `dog`, `いる`, and `miru`: **Known** leaves only known words and
  **Unknown** only the rest, in the chosen order; the **Sorted by** row shows **· 1 filter** and no
  other row appears; a filter that hides every word shows **No Words Match Your Filter**; marking a
  word known from its long-press menu drops it at once while **Unknown** is chosen. The filter
  survives relaunching.

When changing Search's top bar or the shared field in `SearchField.swift`, also check:

- on **Recent**, the **Search** title and its **•••** (**Clear Recent Searches**) show above the
  field; tapping the field slides it to the top with **X** beside it, as on Player;
- submitting, a recent search, the reading refinement, a handwriting candidate, and a radical
  candidate each put the keyboard away with the query in the field and **X** beside it;
- **X** returns to **Recent** with an empty field; the clear button inside the field clears the
  text and keeps typing;
- results start with **Sorted by Default**, which opens the Sort menu, then Example Sentences;
- a website search link ([Links from the website](#links-from-the-website)) shows its query in
  the field; and
- Player's field looks and behaves the same.

When changing the Handwriting or Radicals panels (`SearchInputPanel.swift`,
`HandwritingInputView.swift`, `RadicalInputView.swift`), also check, in light and dark and at an
accessibility text size:

- the pencil and grid buttons show at the bottom left on Recent, on results, and above the
  keyboard, and each opens its panel over the field and the tab bar, with the same buttons at
  its bottom left (the current one highlighted) and a grabber at the top;
- drawing 十 shows candidate tiles with meanings, three rows deep, **Undo** leaves 一's
  candidates, and a second **Undo** empties the pad;
- selecting 女 fills the strip (女, 姦, 奴, 奸, 好…), **Undo** at the bottom right turns active,
  selecting 子 then **Undo** leaves only 女 selected, and picking 好 closes the panel and shows its
  results;
- handwriting 十, handwriting 一, then radicals 女 → 好 builds 十一好 in the field; and
- dragging the grabber down closes the panel, and a downward stroke on the pad draws instead of
  dragging.

## Image Search manual checks

`ImageTextRecognitionTests` run Vision on the images in
`Modules/Tests/SearchExperienceTests/Fixtures/ImageText`: vertical Japanese (a book-page photo,
a proverb list, and a panel with an English subtitle) and a horizontal control. When changing
text recognition, also open one vertical and one horizontal image in the Simulator's Image
Search (**Translate → Image → Photo Library**) and check:

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

## Account manual checks

The Swift tests cover the client against a stub. When changing sign-in or sync, also check the app
against a real service:

- **On the Simulator, against a service on the Mac** (Account and sync, above): sign in with an
  emailed code (the codes are at `/dev/mail`), mark a word Known, and add it to a new list. Read
  them back with `POST /v1/sync` and an access token from a `curl` sign-in, or on a second
  Simulator signed in to the same account. Make a list with `curl`, tap **Sync Now**, and see it.
  Delete the account: the app is signed out and still has its known words and lists.
- **On a device, against staging:** Sign in with Apple and with Google, and delete an account that
  signs in with Apple. A first Sign in with Apple, with an Apple ID that never signed in to the
  app's team, makes an account with the name Apple shares (`GET /v1/me`, or the website's
  account page). The Simulator can't show Apple's sign-in, which needs the App ID's capability and
  a signed build.

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
