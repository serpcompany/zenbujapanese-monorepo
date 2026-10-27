# The browser extension's language data

How the extension's dictionary worker downloads the language data (ADR 0006), keeps it current,
and answers from it offline. The rest of the extension is in [`extension.md`](extension.md); what
a learner sees is in its [product docs](../../apps/extension/docs/product/index.md).

## Where it comes from

The host is `languageDataOrigin` in `apps/extension/src/shared/hosts.ts`, which the build fills
in from `build/hosts.ts`: `https://data.zenbujapanese.com` for production and staging (#941's
Open question 18), and `http://language-data.localhost` for the test build, which the browser
tests map to their local server. The manifest's `host_permissions` name only it, since a learner
can narrow a content script's site access. The
bucket's layout is [`language-data/README.md`](../../language-data/README.md)'s.

The worker reads, in order (`src/worker/release.ts`, `download.ts`):

1. `releases.json`, with `cache: 'no-cache'`, newest `published_at` first.
2. Each release's `manifest.json`, checked against `releases.json`'s `manifest_sha256`. It takes
   the newest release that has every file it needs with the artifact schema it reads (the two
   sets in `release.ts`).
3. `compressed.json`, whose `manifest_sha256` must be the manifest's. A release without one (a
   404, as a new release has for a minute or so) is passed over for the newest listed release
   that has one, as [`publishing.md`](../../language-data/publishing.md) (Gzipped copies) asks;
   if none has, the update fails, to try again at the next check. A SQLite or JSON file is never
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
  background. Until it is in, a kanji request answers its rows with no strokes and
  `strokes: 'downloading'`.

## Where it is kept

Everything is in the origin-private file system, under `unlimitedStorage`, so Chrome never evicts
it (`src/worker/storage.ts`). Downloads go to `staging/` through sync access handles. The
databases are then imported into sqlite-wasm's `opfs-sahpool` pool, named by their SHA-256
(`/<sha>.sqlite3`); the JSON and Kuromoji files move to `files/<sha>/<name>`. `installed.json`,
written last, names the release and each installed file's SHA-256. It is written as
`installed.next.json` and then moved over, so a cut write leaves one whole copy, which `start`
reads.

The pool holds 16 databases and a full set uses 7. So at start and at each update, once it knows
the release, the worker deletes every pool database, `files/<sha>` folder, and staged file that
neither the installed set nor the release being installed names: a cut or refused update's files
never pile up.

## Resuming

After each whole part, the download saves where it is in `staging/<sha>.json`: the parts done, the
bytes written, and the hash's state. Once a file is checked and imported or moved, it gets
`staging/<sha>.done`, and a resumed install skips it until the set swaps. A download cut by a closed
browser or a lost connection continues from its last whole part when the worker starts again, which
the next request or the next update does, since the service worker recreates the offscreen document.

## Updates

On install (which also opens the welcome tab), on browser start (which also creates the daily alarm
again if Chrome cleared it), once a day (the `language-data-update` alarm), and when a page asks
(`checkForUpdates`), the service worker sends `update`
(`src/service-worker/language-data-updates.ts`). Files are content-addressed, so only files whose
SHA-256 changed download. The old set answers until the new one opens and checks; then
`installed.json` swaps and the old files are deleted. An update that fails keeps the installed set:
the state stays `ready`, with `updateFailed` saying why. A pool that failed to open is opened again
by the next try (`src/worker/opened-once.ts`), not kept as a failure.

## Opening it

`src/worker/open-dictionary.ts` opens the main database read-only from the pool, sets
`PRAGMA temp_store = memory`, attaches each installed attachment read-only, and runs the core's
`checkArtifact` on what is attached. The official sqlite-wasm build has no FTS4, so the worker
never calls the core's `search()`. Pages, the offscreen document, and the service worker never
load the core's lookup code or SQLite ([`extension.md`](extension.md), Layers).

## What the worker answers

Pages and content scripts ask through the helpers in `src/shared/dictionary.ts` (`readDataState`,
`checkForUpdates`, `segmentText`, `lookUpPopupCard`, `lookUpWord`, `lookUpKanji`,
`lookUpWordExamples`, `lookUpFormExamples`, `resolveWord`), each of which answers its own answer,
`not-ready`, or a failure, never a throw. Every lookup answers `not-ready` with the data's state
until the first set is in, never an empty result.

| Request | Answer |
| --- | --- |
| `state`, `update` | `state`, with the data's state (`src/shared/data-state.ts`): `checking`, `downloading` (gzipped bytes done of the total, from `compressed.json`'s part sizes, or the
manifest's for a file with no parts), `ready` or `updating` with the installed release, its size, and when it last checked for an update, or `failed` with why. An asked-for update shows `updating` at once, with a total of 0 until it knows what changed. |
| `segment` | The words in a text, with each token's reading, and the text's romaji |
| `popup` | The word popup's Word card for a Language Reference ID, with `frequency` from the learner's frequency dictionaries in their order, through `readFrequency`, and the reading's romaji (core `artifact/popup-card.ts`) |
| `word`, `kanji` | Word Detail's rows from `word()`, and the kanji details' from `kanji()`, with `strokes` saying whether the stroke data is in. An unknown entry or character answers `rows: null`. |
| `word-examples`, `form-examples` | A page of a word's examples from `from`, and of a form's, with how many the form has (`listed`). A form's examples are found by scanning the sentences, not by full-text search. |
| `resolve` | The entry written and read as a related word with no target is, through the `forms` index (core `resolveEntSeq`), or `null` |

## Checks

- `src/worker/installer.test.ts`, against `src/test/fake-language-data.ts`'s server shaped like the bucket,
  with gzipped parts made in the test: a first install, progress in gzipped bytes, Kuromoji files
  as published, resuming from the last whole part, a first install cut inside a later file
  fetching no finished file again, passing over a release with no `compressed.json` and failing
  when none has one, reading `installed.next.json` when a swap stopped before its move, a wrong part SHA-256 and a wrong manifest SHA-256 with their
  reasons, skipping a release whose schemas it can't read, opening what is installed, an unreadable `installed.json` failing with why and installing again
  on the next update, and an
  update that downloads only the changed file, answers from the old set until the swap, and
  then deletes the old one, and a cut update's files deleted before the next, so the pool never
  runs out of room. `src/worker/opened-once.test.ts`: a pool that failed to open opens again.
- `src/worker/answer.test.ts`: `not-ready` before the first set, the state, each lookup, and
  kanji rows while the stroke data downloads. `src/shared/dictionary.test.ts`: each helper's
  request, and a failure for a wrong answer or a throw. The core's `kanji.test.ts` and
  `word-cards.test.ts`: a kanji read without the stroke data, and resolving a related word. `src/service-worker/language-data-updates.test.ts`: when updates run, and the daily alarm
  created again at browser start if Chrome cleared it.
