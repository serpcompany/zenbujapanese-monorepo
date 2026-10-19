# Frequency dictionaries working guide

A frequency dictionary says how common a word is: JLPT Levels gives it a level, and every other
one a rank. The app's code calls one a pack, and the core a list. What a learner sees is in the
app's product docs ([Look Up](../../apps/ios/docs/product/dictionary.md#look-up),
[Account](../../apps/ios/docs/product/index.md#account)); this guide is how a list's values reach
a screen, on the website and in the app.

## One reader

`readFrequency` in `packages/dictionary-core/src/artifact/frequency.ts` is the only code that
reads a list's values for a set of entries, for every client.

- **It takes the lists to read,** in the order they count. Each is its `FrequencyDictionary` (its
  ID, its kind, and what a learner reads about it) with a `rows` function that runs a statement
  where the list is, and a `schema` when the list is attached to another database; or the
  dictionary with the reason it can't be read; or no dictionary and a reason, when nothing can be
  read at all.
- **It asks each list one statement,** whatever the number of entries: a level list's
  `level_evidence.level` or a rank list's `frequency_evidence.rank`, for the IDs in one JSON
  parameter. The statement's text never changes, so a client prepares it once. It searches the
  table by its primary key, `language_reference_id`; a statement that compared `hex()` of that
  column once scanned every row instead. The reader's tests, the service's on the bundled lists,
  and the app's `FrequencyLookupPerformanceTests` read the query plan and fail on a scan
  ([Checks](#checks)).
- **It answers `FrequencyEvidence`:** the dictionaries, and for each entry one lookup a list, in
  the lists' order: its value, null when the list doesn't hold the entry, or `unavailable` with
  the reason. A list whose read fails, or answers what is no whole number, is unavailable
  (`Frequency data unavailable`), and the others are still read.

Two clients go through it:

- **The service** reads its two bundled lists, attached to its one connection as `jlpt` and
  `tubelex` (`bundledFrequency`), for a search's results, a word, and a browse page's words, and
  derives the `FrequencyRow`s its answers hold from the evidence. It fails a request rather than
  answer without a list it couldn't read.
- **The app** hands the core the learner's enabled lists through two host functions
  ([`dictionary-core.md`](dictionary-core.md#embedded)), `frequencyLists()` and
  `frequencyListRows(list, sql, parametersJSON)`. Each list is its own file on its own
  connection: SQLite attaches ten databases at most, and the catalog alone has nine lists.

## Inside the call that builds the answer

The embedded `resultsScreen`, `wordRows`, and `wordPage` read the evidence for the entries they
present (`hostFrequency` in `embedded/host.ts`), so each answer is finished: a results screen has
its order and its chips, a sheet's rows theirs, and a word page its frequency rows with their
details. Nothing is handed in, and nothing is asked a second time. `learnerResultsScreen` stays a
function tests call without a host: it is given a function that reads evidence for IDs.

- **The core keeps no evidence.** A screen asked again after a sort, a filter, a known word, or a
  change of lists reads again: one statement a list.
- **Lists that aren't ready.** A host answers null until its lists are ready: rows say
  `Frequency rank loading`, a word page has no frequency rows, and the host asks again once they
  are. A host without the two functions has no lists (`No frequency dictionary enabled`).

## In the app

`FrequencyLists` (`apps/ios/Modules/Sources/SearchExperience/FrequencyLists.swift`) is what the
presentation engine reads: the enabled lists, in the learner's order, and one read-only connection
for each that can be read. It sits behind a lock of its own, since the engine calls it while a
view is drawn and can't wait for an actor, and it never calls into the engine.

- **The manager publishes.** `FrequencyPackManager` publishes the enabled lists when it starts and
  after every download, enable, disable, reorder, and removal. Publishing closes every connection
  and opens the new lists' files. A list is published as readable only with an artifact the
  manager has checked ([Trust](#trust)).
- **Why a list can't be read.** A list whose file can't be opened is `Pack unavailable`, one
  whose read fails is `Frequency data unavailable`, and when the manager can't start at all every
  word is `Bundled frequency data unavailable`. The core puts the reason in the row, the word
  page's details, and Look Up's notice. A pack that fails its checks never gets that far: an
  installed one is dropped at launch, a bundled one stops the manager, and a download installs
  nothing. `PresentationCore` remembers a word page for one version of the lists, so a page built
  while a read failed says so until the lists are next published.
- **A file changes only while the lists are closed.** Apple's SQLite invalidates a connection
  whose file is unlinked while it is open (`vnode unlinked while in use`), and reads on it then
  fail. So the manager replaces or removes a pack's file inside `publish(_:afterClosing:)`, which
  closes every connection, changes the file, and opens the new lists in one step behind the
  lists' lock: a read waits for it, and none meets a file half changed. A download is installed
  beside the installed pack (`.staged`), checked there as a lookup used to check it, and only
  then moved into place, so a pack being updated answers from its old file until the swap, and a
  download that fails its checks installs nothing. The manager changes its own state after the
  swap: one that fails leaves the lists and the state as they were. A `.staged` file a crash left
  behind is removed when the manager next starts.
- **A search waits for the first lists.** The manager's start checks the bundled files
  ([Trust](#trust)), and `SearchExperienceRootView` starts it at launch, off the main actor.
  `ResultsScreenRequest.screen()` and `SearchView` await `FrequencyLists.ready()` before they ask
  the core, so a results list is drawn once, finished.
- **A view can't wait.** What a view asks while it is drawn (`WordPage(entry)`, a sheet's
  `rowsByEntry()`) has no frequency before the first lists, and is drawn again when they are
  published. That happens only in the moments after a cold launch.
- **Screens follow a change.** `FrequencyLists` is `Observable`: `version` counts what was
  published, and reading it, or the lists themselves, while a view is drawn registers that view.
  The results list carries the version in its request (`ResultsScreenRequest.lists`) and asks
  for its screen again when it changes; `PresentationCore` remembers a word page for one version;
  and a sheet asks for its rows in its body. So Look Up, an open word, and the word sheet show a
  change made in Account, or in the Mac's Settings window, at once.
- **What it costs.** With the JIT off, in an optimized build on the iPhone Simulator, a results
  screen of 60 rows takes about 1.5 ms with the two bundled lists and 4.9 ms with nine. Before,
  the first screen, without frequency, took 0.4 ms, and the second, with the evidence the app had
  read handed in, 1.2 ms and 3.8 ms. The manager's start takes about half a second, half of it
  hashing `LanguageReferenceData.sqlite3`, and a search made sooner after a cold launch waits
  for it ([`tech-debt.md`](../tech-debt.md)). `SearchLatencyTests` prints both
  (`measureFrequencyLists`).

## Checks

- **The reader:** `packages/dictionary-core/src/artifact/frequency.test.ts`, over SQLite files it
  writes, and `apps/dictionary-api/src/conformance/frequency.test.ts`, over the bundled lists.
- **The embedded calls:** `packages/dictionary-core/src/embedded/presentation-frequency.test.ts`,
  through a stand-in host with lists, with none, with lists that aren't ready, and with one that
  can't be read.
- **The app:** `FrequencyListsTests` (what is published, read, and observed),
  `FrequencyPackLifecycleTests` (the lists after each thing the manager does, a file that can't
  be changed, a staged download left behind, and the smoke test), `ResultsScreenTests` (a first
  screen, a word page, and a sheet's rows, finished), and `FrequencyLookupPerformanceTests`.
- **A screen is drawn once.** `SearchResultsUITests` reads every results list Look Up drew
  (`ZENBU_COUNT_DRAWS=1`) and fails when one was drawn without its chips and then again.
  `AccountUITests` turns a dictionary off with a word open and finds the word and its results
  changed, and `TranslateUITests` opens a word with several entries and finds them listed with
  their chips.

## Trust

`FrequencyPackManager` trusts a pack only while its files match what its manifest pins: the
artifact, `languageDataSHA256`, and `mappingPolicySHA256`, the bundled mapping SQL the installer
runs on the device. `FrequencyPackMappingV1.sql` matches forms only; `FrequencyPackMappingV2.sql`
also requires a row's reading when it has one, honoring JMdict's reading restrictions, and maps
rows without one as V1 does. The catalog, the `search-results.json` suite, the analysis reports,
and the language-data release all pin those files byte for byte, so never edit one in place, not
even a comment: every pack that pins it would fail verification.

A manifest's encoding also feeds the trust hashes of installed packs, so anything outside a
pack's contract stays out of it: `kind` is omitted for rank packs, and chip names (the core's
`frequencyShortName`) are matched by pack family, the ID's first three parts, so a rebuilt pack
keeps its label. A
historical manifest can share its pack version with the current one when only derived hashes
changed, as after a language-data rebuild.

An artifact's content digest (`FrequencyPackArtifactContent` in `FrequencyPackArtifact.swift`, matched by
`import_frequency_pack.py`) hashes `zenbu.frequency-pack-content.v1` and a NUL byte, then the
metadata sorted by key, each UTF-8 key and value prefixed with its byte length as an unsigned
64-bit big-endian integer; `FrequencyPackContentDigestV1.json` is a test vector. Its
`mapping_sha256` hashes every evidence row in ID order (a level pack's: each ID's 16 bytes, then
its level as an unsigned 64-bit big-endian integer), so SQLite's page layout never changes it.

Verification hashes every row, so the manager keeps each artifact it has checked, an installed
pack's from its check at launch, and publishes a list with the one it kept. A pack's smoke test
reads its manifest's pinned entry straight from the file (`validateSmokeTest`).
