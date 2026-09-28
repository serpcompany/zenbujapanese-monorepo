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

The repository still has no CI workflow. Verify ordinary app changes by also building,
launching, and inspecting the real app.

Frequency-pack selection has one repo-local Python contract test. Run
`python3 -m unittest apps/ios/Tools/tests/test_frequency_pack_runtime_contract.py` to verify
that every selectable manifest pins a known evidence row and rank, each ordered source agrees
with the generated mapping analysis, the bundled TUBELEX artifact contains its pinned row, and
the bundled JLPT level pack matches its pinned source files and import report. Rebuild the JLPT
pack with `python3 apps/ios/Tools/import_jlpt_level_pack.py > apps/ios/LanguageData/Generated/JLPT-Waller-2025-08-26.import.json`
and copy the reported hashes into its catalog manifest.

Every frequency pack pins the SHA-256 of `LanguageReferenceData.sqlite3`. After rebuilding it
with `import_jmdict.py` (inputs are listed in `LanguageData/Sources/README.md`), also copy its
ranking contract into `DictionaryRankingArtifactContract.json`, rebuild the TUBELEX and Wikipedia
packs with `import_frequency_pack.py`, rebuild the Jiten packs with
`build_jiten_frequency_packs.py --out-dir <dir>` (it rewrites their manifests and keeps changed
ones trusted) and publish the new ZIPs, rebuild the JLPT pack, and update each catalog manifest. Move the previous manifests of downloadable
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
  dictionaries under **You → Frequency Dictionaries** re-sorts the visible results without
  resubmitting, and disabling every dictionary removes the chips.
- `静` keeps its Kanji row first; `日本語を勉強する` shows **Discovered Words**; `見る` offers
  Example Sentences; `what is your name` offers the Japanese-reading refinement.
- With a pack made unreadable in a debug container, results stay listed and the footer names
  the unavailable dictionary.
- Rapidly submitting `quiet`, `miru`, then `いる` leaves only `いる` results.

## Known words manual checks

`WordKnowledgeTests` cover known-word storage: persistence, unreadable and newer-version files,
failed writes, and backups. When changing known words, also check in the Simulator:

- Swiping a Search result right, or the **•••** menu on Word Detail, toggles **✓ Known** on
  both screens, and the mark survives a relaunch.
- **Account → Known Words** shows the count, lists the word, swipes it back to unknown, and
  opens it in Search.
- Known words live in `Application Support/Zenbu Japanese/word-knowledge.json` in the app's
  data container.
