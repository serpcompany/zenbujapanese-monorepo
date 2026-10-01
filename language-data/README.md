# Language data releases

Every Zenbu app will read one versioned language-data release from R2
([ADR 0006](../docs/adr/0006-share-language-data-as-a-versioned-artifact.md),
[issue 463](https://github.com/serpcompany/zenbujapanese-monorepo/issues/463)). This folder
holds the pipeline that packages a release and publishes it to the `zenbujapanese-language-data`
R2 bucket. No app reads the bucket yet. Step 4 of the plan on #463 had the website's D1 import
read it; ADR 0009's dictionary service replaced that import and reads the app's bundled files. The source data, tools, and conformance suites still live under `apps/ios` until #469
moves them.

| File | What it is |
| --- | --- |
| [`release.json`](release.json) | The release to publish (`YYYY.MM.N`). The release it follows comes from the bucket's `releases.json` when it's published. |
| [`release-inputs.json`](release-inputs.json) | What goes in the release, by repository path. Paths start with a root name from `roots`, so a move (#469) changes only `roots`. Names and paths are checked when it loads: plain relative paths only, with no `..`. |
| [`notices/`](notices/) | Notices the release needs that the app has no file for. Kanjium's is worded as the app's Credits screen words it. |
| [`schemas/language-data-manifest.v1.schema.json`](schemas/language-data-manifest.v1.schema.json) | The manifest's JSON Schema, `zenbu.language-data-manifest.v1`. |
| [`schemas/language-data-releases.v1.schema.json`](schemas/language-data-releases.v1.schema.json) | The JSON Schema of the bucket's `releases.json`, `zenbu.language-data-releases.v1`. |
| [`pipeline/package.py`](pipeline/package.py) | The packager's command line: `build`, `lfs-paths`, and `validate`. |
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
- **`core_sha256`:** the shared core's hash. `null`: the core exists (`packages/dictionary-core`),
  but releases don't record its hash until step 6.
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
  (`LookupClient.validateDictionaryRankingMetadata`): size, policy, schema version, mapping,
  evidence and search-index counts, tool hashes, and semantic equivalence. It compares the keys
  the app decodes (the `CodingKeys` in
  `apps/ios/Modules/Sources/SearchExperience/DictionaryRankingArtifactContract.swift`), since the
  app ignores any other, and counts the tables directly, as the app does.
- **The frequency-pack catalog disagrees:**
  - a bundled pack isn't a release file, or has another SHA-256;
  - a CDN source's committed archive differs from the catalog.

A refused build removes what it staged.

Metadata values are read as JSON when they parse as JSON, as `import_jmdict.py` writes them, and
as bare text otherwise, as the pack importers write them.

## Running it

```sh
git lfs pull --include="$(python3 language-data/pipeline/package.py lfs-paths)"
python3 language-data/pipeline/package.py build --out /tmp/language-data
pip install -r language-data/pipeline/requirements.txt   # for validate and the tests
python3 language-data/pipeline/package.py validate /tmp/language-data
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
on pull requests, and on `main`, when language data or the pipeline changes. It has no secrets.
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
| [`object_store.py`](pipeline/object_store.py) | The bucket, through the AWS CLI's S3 API. The publisher's tests put a fake bucket in its place. |
| [`bucket_objects.py`](pipeline/bucket_objects.py) | Object keys, content types, and cache headers, and the upload that never overwrites an object. |
| [`releases_index.py`](pipeline/releases_index.py) | Reads, checks, and writes the bucket's `releases.json`. |
| [`publish_release.py`](pipeline/publish_release.py) | Publishes a staged release (see Publishing a release). |
| [`verify_release.py`](pipeline/verify_release.py) | Reads a published release back and checks it. |
| [`refusal.py`](pipeline/refusal.py), [`locations.py`](pipeline/locations.py) | `Refusal`, the error a failed check raises, and where this folder and the repository are. |

Each test file in [`pipeline/tests/`](pipeline/tests/) is named for what it checks. Two modules
there hold what they share: `scratch_release.py` builds the scratch Git repository the packager's
tests package, and `publish_fixtures.py` holds the fake bucket and the staged releases the
publisher's tests publish.

## Where releases live

The `zenbujapanese-language-data` R2 bucket, in the SERP Cloudflare account. It holds:

| Key | What it is | Written |
| --- | --- | --- |
| `files/<sha256>/<name>` | A release file, content-addressed, so an unchanged file keeps one object across releases. | Once. Never overwritten. |
| `releases/<release>/manifest.json` | A release's manifest. | Once, after every file it names. Never overwritten. |
| `releases.json` | Every release, oldest first: `release`, `manifest_sha256`, `git_commit` (the manifest's), and `published_at` (UTC). The schema is `zenbu.language-data-releases.v1`. | Last. Only ever appended to. |

There's no `latest` pointer: a client pins a release ID and checks the manifest's SHA-256 against
`releases.json`, then each file's against the manifest. Each object also records the SHA-256 its
uploader sent in `x-amz-meta-sha256`. That's a label, not a check. Files and manifests are served
`immutable`, and `releases.json` `no-cache`.
The bucket has no public domain yet.

## Publishing a release

1. Bump [`release.json`](release.json) to the next ID: `YYYY.MM.N` for the month it's cut,
   counting from 1. It must come after the latest release in `releases.json`.
2. Merge to `main`. The [`Language data release`](../.github/workflows/language-data-release.yml)
   workflow runs on every push to `main` that changes `language-data/**` or any other root in
   `release-inputs.json` (a test keeps the two in step), or by hand (Actions → Language data
   release → Run workflow). It:
   1. fails straight away, naming them, when the `language-data-release` environment has no
      `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` secret;
   2. rebuilds the release from the commit, with the tests and every check the build makes;
   3. reads `releases.json` and fills in the manifest's `previous_release` and
      `previous_manifest_sha256` from its latest entry;
   4. uploads each file that isn't in the bucket yet, then the manifest, then the new
      `releases.json`;
   5. reads it all back: `releases.json`, the manifest's SHA-256 and links, and every file's size
      and SHA-256 (downloading and hashing each one).

Only this workflow publishes. In the job that holds the token, every action is pinned by commit
SHA, and Python packages are installed with `--require-hashes` from the hashed
[`requirements.txt`](pipeline/requirements.txt). It runs in the `language-data-release`
environment, which deploys only from `main` and has no required reviewer, by the owner's decision: add one in Settings →
Environments to review each release by hand. Its token is an R2 S3-API token for this bucket
alone, reached at `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com` through the AWS CLI.
`publish.py` takes the bucket and endpoint from `R2_BUCKET` and `R2_ENDPOINT`, and the token from
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, which the workflow sets from the
`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` secrets. It doesn't use the repository's
`CLOUDFLARE_API_TOKEN`. Never upload from a workstation.

### Immutability

- **A file or manifest is never overwritten.** Each upload is conditional (`If-None-Match: *`)
  and sends its SHA-256 (`x-amz-checksum-sha256`), which R2 checks against the bytes it
  receives. If the key already exists, the object must have the same size and SHA-256, or the
  publish fails. After each upload, the object is read back for its size and SHA-256.
  - The SHA-256 read back is R2's `ChecksumSHA256` when R2 returns one.
  - Otherwise it's the `x-amz-meta-sha256` label, which only says what was meant to be sent.
    A multipart upload's `ChecksumSHA256` is a checksum of checksums, ending in `-<parts>`, so
    it counts as none.

  The `Verify` step downloads and hashes every file, so it doesn't rely on either.
- **A published release doesn't change.** If `releases/<release>/manifest.json` already
  exists, the new manifest must match it in everything but `git_commit` and `workflow_run`.
  - If it matches, the run is a no-op and the published manifest stays as it is. So rerunning,
    or merging a change that leaves the release's content alone, publishes nothing.
  - If the content differs, including a changed input under `apps/ios`, the publish fails before
    uploading anything. Bump `release.json` to publish it.
- **`releases.json` is only appended to,** under `If-Match` on the ETag read at the start.
  - **Changed before the manifest is written:** releases.json is read again just before the
    manifest upload. If it changed, the publish stops, with only content-addressed files
    uploaded. Running it again links the manifest to the new latest release.
  - **Changed after the manifest is written:** the append fails. The manifest can't be replaced,
    and its `previous_release` may be stale, so a rerun won't list it. It stays in the bucket,
    unlisted and unused. Bump `release.json` to publish again. The workflow's concurrency group
    keeps this from happening between its own runs.
  - **Response to the append lost:** if the append succeeded but its response was lost, the run
    re-reads `releases.json`. If it lists this release with this manifest, the run succeeds.
  - **Run stopped between the manifest and `releases.json`:** the next run lists the release,
    provided no other release was listed in between.

## Changing what's in a release

Edit `release-inputs.json`. A new file needs its format declared, named `zenbu.<name>.v<N>`:

- in a SQLite file, a `metadata` row `artifact_schema`;
- in a JSON file, a top-level `schema` key.

When the file's bytes can't change, name its format in `release-inputs.json` instead. Bump `vN`
only for a breaking change: a removal, rename, or change of meaning.
