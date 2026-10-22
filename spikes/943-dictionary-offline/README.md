# Spike #943: Zenbu's dictionary offline in Chrome

Throwaway. An unpacked MV3 extension that downloads the files lookups need into OPFS, checks each one's SHA-256 against the release manifest, and opens the reference database in a dedicated worker on OPFS synchronous access handles (`opfs-sahpool`), behind an `ArtifactDatabase`. It answers lookups through `packages/dictionary-core` from a content script and from the side panel. The findings are on #943.

## Layout

- `src/worker.ts`: the dedicated worker. It downloads, resumes with `Range`, hashes with hash-wasm, imports into the pool, opens SQLite and the core, and answers `lookup`, `segment`, `benchCore`, `traceLookup`, `memory` and `sql`.
- `src/offscreen.ts`: the offscreen document (reason `WORKERS`) that hosts the worker.
- `src/background.ts`: the service worker. It creates the offscreen document and relays messages with `target: 'dictionary'`.
- `src/content.ts`, `src/sidepanel.ts`: the word popup and the side panel, which reach the worker through `chrome.runtime.sendMessage`.
- `src/bench.ts`: the 60 words the lookup timings use.
- `src/probe*.ts`, `probe-run.mjs`, `cors-run.mjs`, `formats.mjs`: probes for FTS4, the pool, fetching from `cdn.zenbujapanese.com`, and `DecompressionStream` formats.
- `native-bench.ts`: the same core on `node:sqlite`, for comparison.
- `scripts/`: the FTS4 WebAssembly build, the gzip copies, and the page-lookup build.

## Data

Never committed. In this worktree run `git lfs checkout apps/ios/Modules/Sources/SearchExperience/Resources`. `serve.mjs` serves those files, plus `language-data/derived/RetiredEntries.json`, at `http://localhost:8943/files/<sha256>/<name>`, with the release manifest from `language-data/releases/2026.10.3/manifest.json` and a made-up `releases.json`. `RATE=<bytes per second>` throttles it.

- `bash scripts/gzip-databases.sh` writes `gzip -9` copies of the databases to `tmp/agent/gz/`, served from `/files-gz`.
- `bash scripts/page-lookup-build.sh` writes the smaller builds to `tmp/agent/lookup-build/` and prints their sizes.
- `bash scripts/build-fts4-wasm.sh` builds sqlite-wasm 3.54.1 with FTS4 into `vendor/sqlite-fts4/`. It needs emsdk 4.0.x: emsdk 6.0 emits compact imports that Chrome 153 rejects. It runs `make npm` (`-Oz`), not the default `make` (`-O0`), and uses `sqlite3-bundler-friendly.mjs`.

## Run

Chrome for Testing 153.0.8010.36 from `npx @puppeteer/browsers install chrome@153.0.8010.36` (or `CHROME=<path>`).

```sh
npm install
node serve.mjs &
node build.mjs                                      # dist: official sqlite-wasm
SQLITE=fts4 node build.mjs                          # dist-fts4
SQLITE=fts4 COMPRESSED=1 node build.mjs             # dist-fts4-gz
SQLITE=fts4 RESUME=200000000 node build.mjs         # dist-fts4-resume
VARIANT=dist node run.mjs                           # install, first lookup, restart, 60-word bench, memory
VARIANT=dist-fts4 COMPRESSED=1 node run.mjs
VARIANT=dist-fts4-resume RESUME=200000000 node run.mjs
VARIANT=dist BENCH=1 MODES=search,searchResults,segmentThenEntry MEM=1 node trace.mjs
npx esbuild native-bench.ts --bundle --platform=node --format=esm --outfile=dist-native/native-bench.mjs
node dist-native/native-bench.mjs
LRD=../../tmp/agent/lookup-build/page-lookup.sqlite3 MODES=segmentThenEntry node dist-native/native-bench.mjs
node cors-run.mjs
```

`run.mjs` writes `tmp/agent/results/<label>.json`. Profiles go to `tmp/agent/chrome-profile-*`.
