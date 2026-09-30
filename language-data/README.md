# Language data releases

Every Zenbu app will read one versioned language-data release from R2
([ADR 0006](../docs/adr/0006-share-language-data-as-a-versioned-artifact.md),
[issue 463](https://github.com/serpcompany/zenbujapanese-monorepo/issues/463)). This folder
holds the pipeline that packages a release and publishes it to the `zenbujapanese-language-data`
R2 bucket. No app reads the bucket yet: the website switches to it in step 4 of the plan on
#463. The source data, tools, and conformance suites still live under `apps/ios` until #469
moves them.

| File | What it is |
| --- | --- |
| [`release.json`](release.json) | The release to publish (`YYYY.MM.N`). The release it follows comes from the bucket's `releases.json` when it's published. |
| [`release-inputs.json`](release-inputs.json) | What goes in the release, by repository path. Paths start with a root name from `roots`, so a move (#469) changes only `roots`. Names and paths are checked when it loads: plain relative paths only, with no `..`. |
| [`notices/`](notices/) | Notices the release needs that the app has no file for. Kanjium's is worded as the app's Credits screen words it. |
| [`schemas/language-data-manifest.v1.schema.json`](schemas/language-data-manifest.v1.schema.json) | The manifest's JSON Schema, `zenbu.language-data-manifest.v1`. |
| [`schemas/language-data-releases.v1.schema.json`](schemas/language-data-releases.v1.schema.json) | The JSON Schema of the bucket's `releases.json`, `zenbu.language-data-releases.v1`. |
| [`pipeline/package.py`](pipeline/package.py) | The packager. |
| [`pipeline/publish.py`](pipeline/publish.py) | The publisher, and the check that reads a published release back. |
| [`pipeline/tests/`](pipeline/tests/) | Tests for the packager, the publisher (against a fake bucket), and the schemas. |

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
  so it can be recomputed from any copy, such as D1.
- **`conformance`:** each conformance suite's SHA-256.
- **`core_sha256`:** the shared core's hash. `null` until the core exists (step 6).
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
  evidence and search-index counts, tool hashes, and semantic equivalence.
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

The build opens SQLite files read-only and immutable, and never writes beside the inputs.

The [`Language data build`](../.github/workflows/language-data-build.yml) workflow does the same
on pull requests, and on `main`, when language data or the pipeline changes. It has no secrets.
It keeps only `manifest.json` and a listing of the staged files (`files.tsv`) as an Actions
artifact, for 7 days. Both workflows package through the
[`package-language-data`](../.github/actions/package-language-data/action.yml) action.

## Where releases live

The `zenbujapanese-language-data` R2 bucket, in the SERP Cloudflare account. It holds:

| Key | What it is | Written |
| --- | --- | --- |
| `files/<sha256>/<name>` | A release file, content-addressed, so an unchanged file keeps one object across releases. | Once. Never overwritten. |
| `releases/<release>/manifest.json` | A release's manifest. | Once, after every file it names. Never overwritten. |
| `releases.json` | Every release, oldest first: `release`, `manifest_sha256`, `git_commit` (the manifest's), and `published_at` (UTC). The schema is `zenbu.language-data-releases.v1`. | Last. Only ever appended to. |

There's no `latest` pointer: a client pins a release ID and checks the manifest's SHA-256 against
`releases.json`, then each file's against the manifest. Each object carries its SHA-256 in
`x-amz-meta-sha256`. Files and manifests are served `immutable`, and `releases.json` `no-cache`.
The bucket has no public domain yet.

## Publishing a release

1. Bump [`release.json`](release.json) to the next ID: `YYYY.MM.N` for the month it's cut,
   counting from 1. It must come after the latest release in `releases.json`.
2. Merge to `main`. The [`Language data release`](../.github/workflows/language-data-release.yml)
   workflow runs on every push to `main` that changes `language-data/**`, or by hand
   (Actions → Language data release → Run workflow). It:
   1. fails straight away, naming them, when the `language-data-release` environment has no
      `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` secret;
   2. rebuilds the release from the commit, with the tests and every check the build makes;
   3. reads `releases.json` and fills in the manifest's `previous_release` and
      `previous_manifest_sha256` from its latest entry;
   4. uploads each file that isn't in the bucket yet, then the manifest, then the new
      `releases.json`;
   5. reads it all back: `releases.json`, the manifest's SHA-256 and links, and every file's size
      and SHA-256 (downloading and hashing each one).

Only this workflow publishes. It runs in the `language-data-release` environment, which deploys
only from `main` and has no required reviewer, by the owner's decision: add one in Settings →
Environments to review each release by hand. Its token is an R2 S3-API token for this bucket
alone, reached at `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com` through the AWS CLI.
It doesn't use the repository's `CLOUDFLARE_API_TOKEN`. Never upload from a workstation.

### Immutability

- **A file or manifest is never overwritten.** Each upload is conditional (`If-None-Match: *`)
  and carries its SHA-256, which R2 checks. When the key already exists, the object must have the
  same size and SHA-256, or the publish fails. After each upload, the object is read back for
  both.
- **A published release doesn't change.** When `releases/<release>/manifest.json` already
  exists, the new manifest must match it in everything but `git_commit` and `workflow_run`. Then
  the run is a no-op, and the published manifest stays as it is, so rerunning or merging an
  unrelated `language-data/**` change publishes nothing. When the content differs, the publish
  fails before uploading anything: bump `release.json` to publish it.
- **`releases.json` is only appended to,** under `If-Match` on the ETag it read. When another
  write got there first, the publish fails without overwriting anything; run it again. If a run
  stops after the manifest but before `releases.json`, the next run lists the release.

A change to the release's inputs outside `language-data/**`, such as `apps/ios` resources,
doesn't start a publish. The next one that runs fails until `release.json` is bumped.

## Changing what's in a release

Edit `release-inputs.json`. A new file needs its format declared, named `zenbu.<name>.v<N>`:

- in a SQLite file, a `metadata` row `artifact_schema`;
- in a JSON file, a top-level `schema` key.

When the file's bytes can't change, name its format in `release-inputs.json` instead. Bump `vN`
only for a breaking change: a removal, rename, or change of meaning.
