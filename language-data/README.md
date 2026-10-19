# Language data

Every Zenbu app will read one versioned language-data release from R2
([ADR 0006](../docs/adr/0006-share-language-data-as-a-versioned-artifact.md),
[issue 828](https://github.com/serpcompany/zenbujapanese-monorepo/issues/828)). This folder
holds the pipeline that packages a release and publishes it to the `zenbujapanese-language-data`
R2 bucket, and each release's pinned manifest. No app reads the bucket: what the app bundles, and
what ADR 0009's dictionary service copies into its image, are files of the release `release.json`
names, and checks hold both to that release's pinned manifest before merge
([Pinned releases](#pinned-releases), [issue 473](https://github.com/serpcompany/zenbujapanese-monorepo/issues/473)).
It also holds what every client's data is built from and checked against: the pinned sources, the
tools that build the app's bundled files from them, and the conformance suites (#469 moved them
here from `apps/ios`). The built files stay in the app's bundle,
`apps/ios/Modules/Sources/SearchExperience/Resources/`.

| File | What it is |
| --- | --- |
| [`sources/`](sources/) | The pinned source records, the snapshots committed in Git LFS, and their notices ([its README](sources/README.md)). |
| [`tools/`](tools/) | The importers and builders that write the app's bundled data and the import reports, and their contract tests in `tools/tests/` ([their README](tools/README.md): rebuilding everything, refreshing a snapshot, and provenance). |
| [`generated/`](generated/) | The import reports, which tie each built file to its inputs and tools by SHA-256, and the frequency analyses. |
| [`candidates/`](candidates/), [`FREQUENCY_SOURCE_DECISIONS.md`](FREQUENCY_SOURCE_DECISIONS.md) | The frequency lists considered, and how the current packs were chosen. |
| [`conformance/`](conformance/) | The conformance suites every client is held to (ADR 0006), recorded from the app; the app's, the service's, and the website's tests replay them. |
| [`release.json`](release.json) | The release the app and the service's image hold, and the next to publish (`YYYY.MM.N`). The release it follows comes from the bucket's `releases.json` when it's published. |
| [`release-inputs.json`](release-inputs.json) | What goes in the release, by repository path, and what holds it: `app_bundles` (the roots the app bundles), `images` (the Dockerfiles that copy it), and `not_released` (what those hold that isn't language data, each with why). `retired_entries` names the release's retired-entries file, and `core` the shared core and the app's bundle of it. Paths start with a root name from `roots`, so a move changes only `roots`, as #469's did. Names and paths are checked when it loads: plain relative paths only, with no `..`. |
| [`releases/`](releases/) | Each release's pinned manifest, `releases/<release>/manifest.json` ([Pinned releases](#pinned-releases)), and, after the first, its entry changes, `ent-seq-changes.json`. |
| [`derived/`](derived/) | Release files the pipeline writes: `RetiredEntries.json`. |
| [`retired-entries.md`](retired-entries.md) | How a release records the entries it retires, and which replaces each. |
| [`publishing.md`](publishing.md) | Where releases live in the bucket, and how a release is published there. |
| [`notices/`](notices/) | Notices the release needs that the app has no file for: Kanjium's, Jiten's (for `RankedLists.sqlite3`), and Waller's JLPT kanji levels' (for `KanjiReferenceData.json`), each worded as the app's Credits screen worded it when the notice was written. The credits every client shows now are the core's list ([`data-sources.md`](../docs/data-sources.md)). |
| [`word-cards.md`](word-cards.md) | The word-card format (`zenbu.word-cards.v1`) an app without the language data ships and fetches, and the command that exports cards. |
| [`schemas/language-data-manifest.v1.schema.json`](schemas/language-data-manifest.v1.schema.json) | The manifest's JSON Schema, `zenbu.language-data-manifest.v1`. |
| [`schemas/language-data-releases.v1.schema.json`](schemas/language-data-releases.v1.schema.json) | The JSON Schema of the bucket's `releases.json`, `zenbu.language-data-releases.v1`. |
| [`pipeline/package.py`](pipeline/package.py) | The packager's command line: `build`, `lfs-paths`, `validate`, `retire`, `pin`, and `check-pin`. |
| [`pipeline/publish.py`](pipeline/publish.py) | The publisher's command line: `publish`, and `verify`, the check that reads a published release back. |
| [`pipeline/`](pipeline/) | The modules the two command lines run, one for each job (see [The pipeline](#the-pipeline)). |
| [`pipeline/tests/`](pipeline/tests/) | Tests for the packager (on a scratch Git repository with its LFS files committed as pointers, as after `git lfs pull`), the publisher (against a fake bucket), the schemas, and the committed inputs. |

## A release

A release is a `manifest.json` plus its files. Each file is stored at `files/<sha256>/<name>`,
content-addressed, so an unchanged file keeps its object across releases. The manifest lists:

- **`files`:** for each file:
  - `name`, `sha256` (of the bytes as committed; for a Git LFS file, its oid), and `bytes`.
  - `depends_on`: the files whose SHA-256 it pins.
  - `row_counts`, for a SQLite file: every ordinary table, plus each full-text table's document
    count from its `_docsize` or `_content` table. The other full-text storage tables are left
    out.
  - `artifact_schema`, with `schema_source` saying where it comes from:
    - `file`: the file declares it, in a SQLite `metadata` row `artifact_schema` or a JSON
      `schema` key.
    - `plan`: the file declares none, so `release-inputs.json` names it without changing its
      bytes:
      - `LanguageReferenceData.sqlite3`: `zenbu.language-reference.v2`
      - `KanjiReferenceData.json`: `zenbu.kanji-reference.v1`
      - `RadicalReferenceData.json`: `zenbu.radical-reference.v1`
      - `DictionaryRankingArtifactContract.json`: `zenbu.dictionary-ranking-contract.v1`. Its own
        `schemaVersion` names the ranking it checks, not the file's format.
    - `undeclared`: nothing names one, so it's `null`. This covers the Kuromoji files, the
      notices, the frequency-pack catalog, and its mapping SQL.
- **`sources`:** archives that clients download from the CDN themselves. The release names them
  but doesn't contain them: the Wikipedia and Jiten frequency-pack sources, from
  `FrequencyPackCatalog.json`.
- **`ids`:** the count of JMdict entry numbers (`ent_seq`), and a SHA-256 over them, sorted
  ascending, in decimal, each followed by a line feed. The digest doesn't depend on file order,
  so it can be recomputed from any copy, such as the one in the dictionary service's image.
- **`conformance`:** each conformance suite's SHA-256.
- **`core_sha256`, `core`:** the shared core the release was built beside. `core_sha256` is the
  SHA-256 of the app's bundle of it (`dictionary-core.js`, what the app runs), and `core` names
  that file and hashes the core's source, which the dictionary service bundles: every file git
  tracks under `packages/dictionary-core`, as `sha256sum` lines sorted by path. They record what
  the release was built beside, like `git_commit`, rather than what it holds: data versions are
  independent of clients (ADR 0006), so a core change needs no new release, and they aren't
  pinned. A release built before they were recorded has `core_sha256` `null` and no `core`.
- **`release`, `git_commit`, `workflow_run`.**
- **`previous_release`, `previous_manifest_sha256`:** the latest release in the bucket's
  `releases.json` when this one was published. `build` leaves them `null`; `publish.py` fills
  them in before it uploads anything.

Release 1 packages the committed files exactly as they are. `package.py build` refuses the build
when:

- **A file differs from HEAD:** a Git LFS file from its pointer, or any other file from its blob.
- **A conformance pin disagrees:** a suite pins any file the packager reads, packaged or not, at
  another SHA-256.
- **A language-reference pin names another file:** a pack's `language_data_sha256`, the
  catalog's `languageDataSHA256`, or the ranking contract's `databaseSHA256`.
- **The ranking contract disagrees with the database** in anything the app checks at launch
  (`LanguageReferenceData.validateDictionaryRankingMetadata`, in `LookupDatabase.swift`): size, policy, schema version, mapping,
  evidence and search-index counts, tool hashes, and semantic equivalence. It compares the keys
  the app decodes (the `CodingKeys` in
  `apps/ios/Modules/Sources/SearchExperience/DictionaryRankingArtifactContract.swift`), since the
  app ignores any other, and counts the tables directly, as the app does.
- **The frequency-pack catalog disagrees:**
  - a bundled pack isn't a release file, or has another SHA-256;
  - a CDN source's committed archive differs from the catalog.
- **The retired entries disagree** with the releases' entry changes, or the changes with the
  pinned releases' entries ([`retired-entries.md`](retired-entries.md), What the build checks).

A refused build removes what it staged.

Metadata values are read as JSON when they parse as JSON, as `import_jmdict.py` writes them, and
as bare text otherwise, as the pack importers write them.

## Pinned releases

Each release's manifest is committed as `releases/<release>/manifest.json`, which `package.py pin`
writes from a build. It's the build's manifest without the fields that don't come from the files:
`git_commit`, `workflow_run`, `core_sha256`, and `core`, which record what it was built beside, and
`previous_release` and `previous_manifest_sha256`, which the bucket supplies at publish. They're
left out rather than set to `null`, which would claim a build outside Git or a first release. So any
commit holding the same files builds the pinned release.

What the app bundles, and what the dictionary service's image copies, are files of the release
`release.json` names. These hold them to its pin, so CI never reads the bucket:

- **`package.py check-pin`**, in the `pins` job of `Language data build`, without Git LFS. It
  fails when:
  - a release file at HEAD differs from its pinned `sha256` and `bytes`: a Git LFS file by its
    pointer's oid and size, any other by its bytes. The release's names and the pin's must match.
  - a conformance suite in `release-inputs.json` differs from its pinned `sha256` and `bytes`, or
    the suites it names and the pin's differ, so a re-recorded suite fails here, not only after a
    build;
  - the app bundles a file, under a root in `app_bundles`, that is neither a release file nor in
    `not_released`;
  - a Dockerfile in `images` copies such a file from under any root;
  - `release.json` names a release earlier than one already pinned;
  - with `--base`, a pull request's base: the pull request changes, deletes, or adds a file in
    a release folder whose pin the base holds. A merged pin never changes, since it may already be
    published.
- **`package.py check-pin --built OUT`**, in the shared action after each build: the built
  manifest equals the pin, but for the fields above. The build has checked every file's bytes
  against HEAD, so the app, the image, and the release hold byte-identical files.
- **`publish.py`:** `publish` refuses a staged release that isn't its pin before uploading
  anything, and `verify` refuses a published manifest that isn't.
- **The dictionary service** refuses to start when a file a word card is read from isn't the
  pinned release's, by its SHA-256 ([`dictionary-api.md`](../docs/agents/dictionary-api.md), How
  it runs).

## Running it

```sh
git lfs pull --include="$(python3 language-data/pipeline/package.py lfs-paths)"
python3 language-data/pipeline/package.py build --out /tmp/language-data
pip install -r language-data/pipeline/requirements.txt   # for validate and the tests
python3 language-data/pipeline/package.py validate /tmp/language-data
python3 language-data/pipeline/package.py check-pin --built /tmp/language-data
python3 -m unittest discover -s language-data/pipeline/tests
```

The build opens SQLite files read-only and immutable, and never writes beside the inputs. It needs
only the standard library; `validate`, `publish.py`, and the tests need `jsonschema`. To change a
pin in the hashed [`requirements.txt`](pipeline/requirements.txt), regenerate it from a file of
bare pins (such as `jsonschema==4.26.0`), writing the output, which has no comments, over it:

```sh
uv pip compile <pins> --generate-hashes --python-version 3.12 --universal --no-header --no-annotate
```

The [`Language data build`](../.github/workflows/language-data-build.yml) workflow does the same
on pull requests, and on `main`, when language data, the pipeline, or a Dockerfile in `images`
changes, after `check-pin` passes. It has no secrets.
It keeps only `manifest.json` and a listing of the staged files (`files.tsv`) as an Actions
artifact, for 7 days. Both workflows package through the
[`package-language-data`](../.github/actions/package-language-data/action.yml) action.

## The pipeline

`package.py` and `publish.py` only read their arguments and call the modules beside them, which
import one another by name:

| Module | What it does |
| --- | --- |
| [`release_inputs.py`](pipeline/release_inputs.py) | Loads `release-inputs.json` and `release.json`, checking their names, paths, and release ID. |
| [`committed_files.py`](pipeline/committed_files.py) | Reads what HEAD commits (blobs and Git LFS pointers), and stages each file, checked against it. |
| [`sqlite_files.py`](pipeline/sqlite_files.py) | Opens a SQLite file read-only and immutable, for its row counts, its metadata, and its JMdict entry numbers. |
| [`ranking_contract.py`](pipeline/ranking_contract.py) | Checks the ranking contract against the language-reference database. |
| [`conformance_suites.py`](pipeline/conformance_suites.py) | Reads the SHA-256 each conformance suite pins. |
| [`frequency_catalog.py`](pipeline/frequency_catalog.py) | Checks the frequency-pack catalog against the release, and lists its CDN sources. |
| [`release_build.py`](pipeline/release_build.py) | Builds a release: stages its files, makes every check above, and writes its manifest. |
| [`release_manifest.py`](pipeline/release_manifest.py) | Writes `manifest.json`, and validates it against its schema and the staged files. |
| [`pinned_release.py`](pipeline/pinned_release.py) | Writes and reads a release's pin, and compares a manifest with it. |
| [`pinned_files.py`](pipeline/pinned_files.py) | Holds the committed files, what the app bundles, and what the images copy to the pin, and keeps merged pins unchanged. |
| [`retired_entries.py`](pipeline/retired_entries.py) | Reads each release's entry changes, makes the retired-entries file from them, and checks them against the pins. |
| [`retirement.py`](pipeline/retirement.py) | `retire`: compares the database with the previous release's, and writes the changes and the retired entries. |
| [`core_provenance.py`](pipeline/core_provenance.py) | Hashes the core's bundle and source as HEAD commits them, for `core_sha256` and `core`. |
| [`object_store.py`](pipeline/object_store.py) | The bucket, through the AWS CLI's S3 API. The publisher's tests put a fake bucket in its place. |
| [`bucket_objects.py`](pipeline/bucket_objects.py) | Object keys, content types, and cache headers, and the upload that never overwrites an object. |
| [`releases_index.py`](pipeline/releases_index.py) | Reads, checks, and writes the bucket's `releases.json`. |
| [`publish_release.py`](pipeline/publish_release.py) | Publishes a staged release ([`publishing.md`](publishing.md)). |
| [`verify_release.py`](pipeline/verify_release.py) | Reads a published release back and checks it. |
| [`refusal.py`](pipeline/refusal.py), [`locations.py`](pipeline/locations.py) | `Refusal`, the error a failed check raises, and where this folder and the repository are. |

Each test file in [`pipeline/tests/`](pipeline/tests/) is named for what it checks. Two modules
there hold what they share: `scratch_release.py` builds the scratch Git repository the packager's
tests package, and `publish_fixtures.py` holds the fake bucket and the staged releases the
publisher's tests publish.

## Publishing

Where releases live in the bucket, how the `Language data release` workflow publishes one, and
why nothing published is overwritten are in [`publishing.md`](publishing.md).

## Changing the data

A pinned release's content never changes, so new data is a new release:

1. Rebuild the files and record the conformance suites again (`language-data/tools/README.md`).
2. Bump [`release.json`](release.json) to the next ID: `YYYY.MM.N` for the month it's cut,
   counting from 1. It must come after every pinned release and every release in
   `releases.json`.
3. Record the entries it drops, with `python3 language-data/pipeline/package.py retire`
   ([`retired-entries.md`](retired-entries.md)), and review the changes file it writes.
4. Commit, since the build packages only what HEAD holds, then build and pin:

   ```sh
   python3 language-data/pipeline/package.py build --out /tmp/language-data
   python3 language-data/pipeline/package.py pin /tmp/language-data
   ```

5. Commit `releases/<release>/manifest.json`. Its diff names each file whose bytes changed.

Until it merges, a release can be pinned again under the same ID. Merging it publishes it.

## Changing what's in a release

Edit `release-inputs.json`, then pin a new release (Changing the data). A new file needs its
format declared, named `zenbu.<name>.v<N>`:

- in a SQLite file, a `metadata` row `artifact_schema`;
- in a JSON file, a top-level `schema` key.

When the file's bytes can't change, name its format in `release-inputs.json` instead. Bump `vN`
only for a breaking change: a removal, rename, or change of meaning.
