# Issue 251 disposable iOS measurement harness

These three non-production projects retain the exact Swift sources and Xcode
project definitions used for the 2026-09-03 Simulator measurements. They do not
belong to the Zenbu app target. Large third-party dictionaries, packages, build
products, and DerivedData are intentionally not committed.

Environment used: Xcode 26.0 (`17A324`), iPhone 17 Pro Simulator
`77E6BF80-AB37-4C1B-A8FB-F65F7E5694B5`, iOS 26.0.1, Apple M3 Max host,
Release `-Os`. The committed sample file contains every retained scalar from
30 fresh processes per provider. Each process performed 20 warmups, 200
measured calls, 10 deterministic repeats, and 100 concurrent calls. The
selected Sudachi path also retained 30 checksum-validation runs and 30
deliberately corrupt-payload rejections.

## Sudachi

1. Clone `https://github.com/iasnezhkov/sudachi-swift.git` beside
   `sudachi-ios` at tag `v0.1.1`, commit
   `92f55c556ba0e6c6f25660b049072811d40f045f`.
2. Verify release ZIP SHA-256
   `5f17105e7ec602413fc8c72e6a44d273758b36fa8da17edc3f6b0cc43983984e`.
3. Fetch SudachiDict Core 20260723. Copy `system_core.dic` into
   `sudachi-ios/Resources/` and require SHA-256
   `53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f`.
4. Copy the binding Apache license/NOTICE and complete SudachiDict `LEGAL` and
   Apache license into Resources under the names referenced by the project.
5. Run `xcodegen generate --spec sudachi-ios/project.yml`, then:

```sh
xcodebuild -project sudachi-ios/Issue251Sudachi.xcodeproj \
  -scheme Issue251Sudachi -configuration Release \
  -destination 'platform=iOS Simulator,id=77E6BF80-AB37-4C1B-A8FB-F65F7E5694B5' \
  -derivedDataPath /tmp/Issue251SudachiDerived build
```

Install/launch with `xcrun simctl`, copy
`Documents/result.json` from the app container after each fresh launch, then
terminate/uninstall before the next cold sample.

The selected harness fails explicitly when `system_core.dic` is missing or its
SHA-256 differs. The checksum pass costs about 78–84 ms on this Simulator. Its
mapped `Data` remains alive for the simple probe and raises that probe's steady
RSS; production pack validation should complete atomically in the installer
before a later analysis process maps the accepted dictionary.

## Kuromoji in JavaScriptCore

1. Fetch npm `@faanau/kuromoji@0.2.1`, git head
   `380a8da1072691006b1a8c300885a04d582e80a1`; require tarball SHA-256
   `979d6d5ef7464a0b9e1461ee9f4d9ffe712874f57a7afb556e4465ed966f6b20`.
2. Replace only its `src/loader/BrowserDictionaryLoader.js` with the committed
   adapter, then run Browserify over `src/kuromoji.js` to
   `kuromoji-ios/Resources/kuromoji.js`.
3. Decompress the package's 12 `.dat.gz` files into Resources without changing
   bytes. The compressed filename+NUL+bytes aggregate must be
   `484ee6b00d145650e82421d330463809e4b7b500ba0140064efd1849544adb86`.
4. Add the Apache and complete IPADIC NAIST/ICOT notices to Resources.
5. Generate and build with the same commands, substituting
   `kuromoji-ios/project.yml`, project, scheme, and a separate DerivedData path.

The app records that iOS JavaScriptCore exposes neither `fetch` nor
`DecompressionStream`; the committed loader is therefore part of the measured
host, not upstream Kuromoji behavior.

## Native Swift Kuromoji challenger

1. Clone `https://github.com/thuongvb/kuromoji-ios.git` beside the project at
   commit `c601b3bf912babf0aa94c209a5dc74a46bd225db`.
2. Download `mecab-ipadic-2.7.0-20070801.tar.gz` only from the HTTPS endpoint
   and require SHA-256
   `b62f527d881c504576baed9c6ef6561554658b175ce6ae0096a60307e49e3523`.
3. Build its dictionary twice with the pinned Xcode/Swift toolchain. Require
   byte-identical results and canonical filename+NUL+bytes digest
   `8ce1e22cc662d5d4726a755e28ff4ec02955235f63a8ca5c0a0a8d3e7e3909c6`.
4. Generate/build from `kuromoji-native-ios/project.yml` as above.

The upstream package did not itself pin the download or include required
consumer notices. A production investigation must fix those failures and put
Apache, Atilika/change, and complete NAIST/ICOT text in the built app before it
can pass a redistribution gate.

## Raw evidence boundary

[The committed samples](../../fixtures/issue251-ios-measurement-samples-v1.json)
retain all per-process init, warm p50/p95, initial/steady RSS, and deterministic
hash fields used in the report. The harness also writes representative full
token output to each local result file; those repetitive third-party-derived
rows are reproducible and are not duplicated in Git.
