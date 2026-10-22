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

## Run it on an iPhone

Done once on 2026-10-22 (iPhone 17 Pro Max, iOS 26.6, Release). `xcodebuild -allowProvisioningUpdates`
registered the App IDs with App Groups on, but can't register the group itself, so that build left the
group out (`CODE_SIGN_ENTITLEMENTS=`) and saving wasn't run. Register
`group.com.zenbujapanese.dictionary.spike947` in Xcode's Signing & Capabilities first to run saving.

```sh
xcodebuild -project SafariSpike.xcodeproj -scheme SafariSpike -configuration Release \
  -destination 'platform=iOS,id=<udid>' -derivedDataPath ../../tmp/agent/device-dd \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=847HR8U8D9 CODE_SIGN_ENTITLEMENTS= build-for-testing
python3 -m http.server 47947 --bind 0.0.0.0 --directory TestPage &
```

Then `testC2_enableFromApp`, and `testH_probe` with `TEST_RUNNER_SPIKE_BASE=http://<mac-ip>:47947`
and `TEST_RUNNER_SPIKE_URL=http://<mac-ip>:47947/index.html?probe=辞書|か`, run with
`xcodebuild test-without-building -xctestrun <the .xctestrun>`. `probe=!stress:10:400` holds 10 MB
more per message until iOS ends the native side, to find its limit. End the extension between runs
with `xcrun devicectl device process terminate`, so each run starts a fresh process. The phone must
stay unlocked.

`proof/` holds the Simulator's screenshots.
