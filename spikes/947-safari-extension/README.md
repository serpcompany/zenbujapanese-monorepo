# Spike #947: the iPhone Safari extension

Throwaway. Never merged. It answers #947 and is linked from the issue's comment.

A host app (`Safari Spike 947`, `com.zenbujapanese.dictionary.spike947`) with three parts:

- `Extension/`: a Safari Web Extension (`.safari`). `SafariWebExtensionHandler.swift` answers
  `lookUp`, `markKnown`, `addToFavorites` and `config` through
  `apps/ios/Modules/Sources/SearchExperience/Platform/SafariExtensionSpike.swift`, a spike-only file
  in the package that calls the Share extension's own reader and stores. `Web/content.js` shows the
  word popup for a selection and places "Watch in Zenbu" on YouTube embeds; `Web/background.js`
  relays to the native side, since content scripts can't.
- `Share/`: a Share extension (`.share`) that accepts a web page's URL, to test opening the app from it.
- `UITests/`: XCUITests that drive Settings and Safari in the Simulator and print what they see.

App group: `group.com.zenbujapanese.dictionary.spike947`. The dictionary isn't copied: the app links
the package's `DictionaryData` (Git LFS, so run `git lfs checkout apps/ios/Modules/Sources/DictionaryData`
in a new worktree).

## Run it in the Simulator

```sh
cd spikes/947-safari-extension
xcodegen generate
python3 -m http.server 47947 --bind 127.0.0.1 --directory TestPage &
xcodebuild -project SafariSpike.xcodeproj -scheme SafariSpike -configuration Debug \
  -destination "platform=iOS Simulator,id=$(python3 ../../apps/ios/Tools/simulator.py)" \
  -derivedDataPath ../../tmp/agent/spike-dd -only-testing SafariSpikeUITests/SpikeUITests/testC_enableByHand test
```

Then `testE_longPress` (the word popup), `testG_saveAndMore`, `testI_watchInZenbu`,
`testJ_openInZenbu`, `testK_youtubeAndShare`, and `testH_probe` with
`TEST_RUNNER_SPIKE_URL='http://localhost:47947/index.html?run=1&probe=辞書|か'` for memory.
`xcodebuild test` didn't reinstall the app after a change to `content.js`; run
`xcrun simctl install <udid> <the built .app>` after one.

## Run it on an iPhone (not done)

Needs the owner's yes. Signing with team `847HR8U8D9` and `-allowProvisioningUpdates`, which
registers the App IDs `com.zenbujapanese.dictionary.spike947`, `.spike947.safari`,
`.spike947.share` and the app group `group.com.zenbujapanese.dictionary.spike947`; the phone
connected, trusted, with Developer Mode on. Read the memory log afterwards with
`xcrun devicectl device copy from --device <udid> --domain-type appGroupDataContainer
--domain-identifier group.com.zenbujapanese.dictionary.spike947 --source
"Library/Application Support/Zenbu Japanese/share-card-memory.log" --destination memory.log`.

`proof/` holds the Simulator's screenshots.
