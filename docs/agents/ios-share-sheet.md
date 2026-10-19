# Share sheet card (iOS)

How Zenbu's card in the iPhone and iPad share sheet is built (#394). What it shows a learner, and
what is checked by hand, is in the product docs' [Share sheet](../../apps/ios/docs/product/share-sheet.md).
The decision to run the dictionary inside the extension, reading the app's own copy of its files,
is [ADR 0017](../adr/0017-show-the-share-sheets-card-from-an-extension-that-reads-the-apps-dictionary.md).

## The extension

- **The target** is `ZenbuShare`, a Share extension (`com.apple.share-services`) built from
  `apps/ios/ShareExtension/`: its `Info.plist` (text, or one image), its entitlements, and one
  file, `ShareViewController`, a subclass of `ShareCardViewController`
  (`SearchExperience/Platform/ShareCardHost.swift`). Everything else is in the package, where it's
  tested: `ShareCard.swift` decides what the card shows, `ShareCardView.swift` and
  `ShareWordCard.swift` draw it, and `ShareCardHosting.swift` reads what was shared and builds the
  extension's dictionary and stores.
- **iPhone and iPad only.** The target builds for `iphoneos` and `iphonesimulator`; the app embeds
  it ("Embed Foundation Extensions") and depends on it with an `ios` platform filter, so a Mac
  build has no extension.
- **Its bundle ID is the app's with `.share`**: `com.zenbujapanese.dictionary.share`, Zenbu Dev's
  `com.zenbujapanese.dictionary.dev.share`, the UI tests' `...uitests.share`. Its name in the
  sheet is `ZENBU_DISPLAY_NAME`, as the app's is.
- **One version for both.** `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` are set on the
  project, not on a target, because App Store Connect wants an extension's version to match its
  app's; `test_share_extension.py` checks only the project sets them, and the rest of the
  extension's settings.
- **Its own privacy manifest**, which declares the APIs it reads (file dates and its defaults) and
  that it collects nothing: App Store Connect checks each binary in the app.
- **The card ends the request.** **Done** completes it, and the card can't be swiped away
  (`isModalInPresentation`), so the share sheet never waits on an extension that's gone.
- **No Open in Zenbu.** Apple documents `NSExtensionContext.open(_:completionHandler:)` only for
  Today and iMessage extensions, so the card works without opening the app.

## The dictionary it reads

The dictionary's files are 556 MB. They're the `DictionaryData` package target, whose path is
`SearchExperience/Resources`, and only the app links it, so Xcode copies them into the app and not
into the extension (which is 38 MB, its own copy of the package's code). `BundledData`
(`BundledData.swift`) finds `ZenbuJapaneseModules_DictionaryData.bundle` where it's running: in
the app, in the app a running extension is part of (`containingApp(of:)`), or in a test bundle.
Code in `SearchExperience` asks `BundledData.bundle`, never `Bundle.module`. `Package.swift` lists each
of the target's resources by name, so `test_dictionary_data.py` checks every file in the folder is
listed or excluded.

The extension reads the app's copy in place: an extension may read its containing app's bundle,
as it loads frameworks from it. Copying the files into the App Group container instead would keep
a second 556 MB on the device, and the card wouldn't work until the app had run and copied them.

## Memory

A share extension is stopped when it uses more memory than iOS allows extensions, about 120 MB.
`DictionaryCore`'s JavaScriptCore contexts and SQLite read the files without loading them; what
counts is what the card computes. Measured in the Simulator (`phys_footprint`, beyond the
process's own), and on an iPhone 17 Pro Max in a Debug Zenbu Dev build:

| Card | Simulator | iPhone |
| --- | --- | --- |
| A word (食べた) | 15 MB | pending |
| A sentence, the first one (unpacks the tokenizer) | 25 MB | pending |
| A photo (Vision, the peak while it reads) | 130 MB peak in a test, 123 MB in the extension | pending |

- **The tokenizer is mapped, not unpacked into memory.** The app unpacks its eleven files into
  100 MB of memory. The extension unpacks each once into its own `Caches/Tokenizer` folder,
  streaming (`Gunzip.unpack`), names it by the file's CRC-32 and size so a new dictionary
  replaces it (and a half-written one is cleared), and maps it (`TokenizerFiles`): pages read from a file don't count against the
  limit. The core uses the buffers as they are, so mapping costs it nothing.
- **No Sudachi.** The extension's dictionary has no morphology (`JapaneseMorphologyClient.unavailable`),
  so it never opens Sudachi's 217 MB dictionary; sentence search, which only the results screen
  uses, is off.
- **One dictionary per process.** `ShareCardReader.onDevice` builds one `LanguageReferenceData`
  and one `DictionaryTextData` and shares them; a second text reader would map the tokenizer
  again.
- **A photo is read at 2,048 pixels** on its longer side, from the shared file
  (`SharedItemReading`, `ShareCardReader.downscaled(file:)`), so neither the original nor more than
  a 16 MB bitmap is held while Vision reads it.
- **Long text is cut.** Only text of up to 64 characters is looked up as one word, and only the
  first 2,000 characters are split into words.
- **A Debug build logs its memory**: `ShareCardMemory` appends each card's footprint and the
  process's peak to `share-card-memory.log` in the App Group container. Read it from a phone with
  `xcrun devicectl device copy from --device <udid> --domain-type appGroupDataContainer
  --domain-identifier group.com.zenbujapanese.dictionary.dev --source
  "Library/Application Support/Zenbu Japanese/share-card-memory.log" --destination <file>`. A
  card that the system stopped leaves a `JetsamEvent` report under Settings → Privacy & Security
  → Analytics Data.

## Translation and recognition in an extension

- **Apple Translation** is `NaturalTranslationClient.live`: `TranslationSession(installedSource:target:)`
  translates without a view, with the languages already downloaded. Downloading needs the app's
  `.translationTask`, so the card asks the learner to download them in Translate rather than
  offering it. The Simulator has no Apple Translation; on a device: pending.
- **Vision** reads a photo as Image Search does (`ImageTextRecognitionClient.live`), and
  `ImageTextPage` joins its lines into paragraphs.

## Saving words

The extension uses the app's own `WordLists` and `WordKnowledge`, and the app's list picker, over
copies of the app's files in the App Group `group.com.zenbujapanese.dictionary<suffix>`
(`SharedContainer`, under `Library/Application Support/Zenbu Japanese/`):

- **The app keeps the copies.** `LocalJSONFile` takes a `sharedCopy`: the app's `WordLists.shared`
  and `WordKnowledge.shared` write it each time they read or save their file, and remove it when
  the file is gone. The extension's stores read and save the copies too, so a card shows what an
  earlier card saved before the app has applied it; the app's next read or save replaces them.
- **The extension hands its changes to the app.** Its stores' `changeObserver` records each list
  made, word added or removed, and word marked known or unknown (`SharedChange`) as a file in
  `Shared Changes/`, named by time and a counter so they apply in order, and posts a Darwin
  notification. The app applies them (`SharedChanges.apply`) when a scene becomes active and when
  the notification arrives, through the stores' own methods, so `AccountSync` records them as the
  app's own changes and syncs them. A file is deleted once its store has saved the change; a change
  waits while its store can't be changed (a file from a newer version), and applying it twice
  changes nothing.
- **The UI tests' fresh state** (`ZENBU_UI_TEST_FRESH`) erases the App Group folder too.
- The app needs the App Group entitlement as the extension does; automatic signing registers
  the group and the extension's App ID the first time a team builds them.
- **Not on the Mac**, which has no extension: `AppGroupContainer` answers no container there, so
  the Mac keeps no copies and reads no changes.

## Tests

- **Package:** `ShareCardTests` (what the card shows for each kind of input, on the bundled
  dictionary and Vision), `ShareCardTranslationTests`, `SharedItemTests` (reading what the sheet
  hands over), `TokenizerFilesTests`, `SharedChangesTests`, `SharedCopyTests`, and
  `BundledDataTests`.
- **UI:** `ShareSheetUITests`, on iPhone and iPad (skipped on the Mac). A Debug harness opens the
  system share sheet over the app at launch, with `ZENBU_SHARE_TEXT=<text>` or
  `ZENBU_SHARE_IMAGE=<path>` (`ShareSheetHarness`); the test taps **Zenbu Japanese** in it, and
  the extension's card is reached through the app's accessibility tree. An app's own share sheet
  lists its extensions, so this is the real share sheet and extension. Only one Zenbu build with
  the extension may be installed on the Simulator: two show two **Zenbu Japanese** rows.
- **On a device:** the product docs' Checked by hand, in a Zenbu Dev build
  ([`ios.md`](ios.md#beside-the-testflight-app)), then the memory log above.
