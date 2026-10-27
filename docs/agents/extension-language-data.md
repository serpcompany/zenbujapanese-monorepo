# The browser extension's language data

How the extension's dictionary worker downloads the language data (ADR 0006), keeps it current,
and answers from it offline. The rest of the extension is in [`extension.md`](extension.md); what
a learner sees is in its [product docs](../../apps/extension/docs/product/index.md).

## Where it comes from

The host is one constant, `languageDataHost` in `apps/extension/src/shared/language-data.ts`
(`https://data.zenbujapanese.com`, #941's Open question 18), and the manifest's
`host_permissions` name only it, since a learner can narrow a content script's site access. The
bucket's layout is [`language-data/README.md`](../../language-data/README.md)'s.

The worker reads, in order (`src/worker/release.ts`, `download.ts`):

1. `releases.json`, with `cache: 'no-cache'`, newest `published_at` first.
2. Each release's `manifest.json`, checked against `releases.json`'s `manifest_sha256`. It takes
   the newest release that has every file it needs with the artifact schema it reads (the two
   sets in `release.ts`).
3. `compressed.json`, whose `manifest_sha256` must be the manifest's. A release without one is
   downloaded whole.
4. Each file it needs, from its gzipped parts (`files/<part sha>/<name>.partN.gz`), each checked
   against its SHA-256 before it is unpacked with `DecompressionStream`, or as published
   (`files/<sha>/<name>`) where it has no parts, as the Kuromoji files don't. The whole file's
   SHA-256 is hashed as it is written (hash-wasm) and checked against the manifest's.

A wrong SHA-256 discards what it covers and fails with its reason, such as
`LanguageReferenceData.sqlite3 part 3 is …, but compressed.json pins …`.

## The two sets

- **The first set** is what a lookup needs: `LanguageReferenceData.sqlite3`, the attachments
  `compound_pitch`, `jlpt`, `tubelex`, and `word_index`, the two kanji JSON files,
  `RetiredEntries.json`, and the 11 Kuromoji files. A lookup before it is in answers `not-ready`
  with the data's state, never an empty result.
- **The later set,** `KanjiStrokeData` (`strokes`) and `RankedLists` (`ranked`), follows in the
  background. A kanji request answers that the stroke data is still downloading until it is in.

## Where it is kept

Everything is in the origin-private file system, under `unlimitedStorage`, so Chrome never evicts
it (`src/worker/storage.ts`). Downloads go to `staging/` through sync access handles. The
databases are then imported into sqlite-wasm's `opfs-sahpool` pool, named by their SHA-256
(`/<sha>.sqlite3`); the JSON and Kuromoji files move to `files/<sha>/<name>`. `installed.json`,
written last, names the release and each installed file's SHA-256.

## Resuming

After each whole part, the download saves where it is in `staging/<sha>.json`: the parts done,
the bytes written, and the hash's state. A download cut by a closed browser or a lost connection
continues from its last whole part when the worker starts again, which the next request or the
next update does, since the service worker recreates the offscreen document.

## Updates

On install (which also opens the welcome tab), on browser start, once a day (the
`language-data-update` alarm), and from Settings' Check for Updates, the service worker sends
`update` (`src/service-worker/language-data-updates.ts`). Files are content-addressed, so only
files whose SHA-256 changed download. The old set answers until the new one opens and checks;
then `installed.json` swaps and the old files are deleted. An update that fails keeps the
installed set: the state stays `ready`, with `updateFailed` saying why.

## Opening it

`src/worker/open-dictionary.ts` opens the main database read-only from the pool, sets
`PRAGMA temp_store = memory`, attaches each installed attachment read-only, and runs the core's
`checkArtifact` on what is attached. The official sqlite-wasm build has no FTS4, so the worker
never calls the core's `search()`. Pages, the offscreen document, and the service worker never
load the core's lookup code or SQLite ([`extension.md`](extension.md), Layers).

## What the worker answers

| Request | Answer |
| --- | --- |
| `state`, `update` | `state`, with the data's state: `checking`, `downloading` (bytes done of the total), `updating`, `ready`, or `failed` with why (`src/shared/data-state.ts`) |
| `segment` | The words in a text, with each token's reading, and the text's romaji |
| `popup` | The word popup's Word card for a Language Reference ID, with `frequency` from the learner's frequency dictionaries in their order, through `readFrequency`, and the reading's romaji (core `artifact/popup-card.ts`) |
| `word`, `kanji` | Word Detail's rows from `word()`, and the kanji details' from `kanji()` |

## Checks

- `src/worker/installer.test.ts`, against `src/test/fake-language-data.ts`'s server shaped like the bucket,
  with gzipped parts made in the test: a first install, progress, Kuromoji files as published,
  resuming from the last whole part, a wrong part SHA-256 and a wrong manifest SHA-256 with their
  reasons, skipping a release whose schemas it can't read, opening what is installed, an unreadable `installed.json` failing with why and installing again
  on the next update, and an
  update that downloads only the changed file, answers from the old set until the swap, and
  then deletes the old one.
- `src/worker/answer.test.ts`: `not-ready` before the first set, the state, lookups, and the
  stroke data's wait. `src/service-worker/language-data-updates.test.ts`: when updates run.
- Not yet: the browser tests on #952's local server, the conformance suites on WebAssembly, and
  the word popup's timings and query plans (#956's Done when).
