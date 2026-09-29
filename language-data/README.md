# Language data releases

Every Zenbu app will read one versioned language-data release from R2
([ADR 0006](../docs/adr/0006-share-language-data-as-a-versioned-artifact.md),
[issue 463](https://github.com/serpcompany/zenbujapanese-monorepo/issues/463)). This folder
holds the pipeline that packages a release. Nothing is published yet: that's step 3 of the plan
on #463. The source data, tools, and conformance suites still live under `apps/ios` until #469
moves them.

| File | What it is |
| --- | --- |
| [`release.json`](release.json) | The next release's ID (`YYYY.MM.N`). The release it follows will come from `releases.json`, which the publish job writes (step 3). Until then, `previous_release` and `previous_manifest_sha256` are `null`. |
| [`release-inputs.json`](release-inputs.json) | What goes in the release, by repository path. Paths start with a root name from `roots`, so a move (#469) changes only `roots`. Names and paths are checked when it loads: plain relative paths only, with no `..`. |
| [`notices/`](notices/) | Notices the release needs that the app has no file for. Kanjium's is worded as the app's Credits screen words it. |
| [`schemas/language-data-manifest.v1.schema.json`](schemas/language-data-manifest.v1.schema.json) | The manifest's JSON Schema, `zenbu.language-data-manifest.v1`. |
| [`pipeline/package.py`](pipeline/package.py) | The packager. |
| [`pipeline/tests/`](pipeline/tests/) | Tests for the packager and the schema. |

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
- **`release`, `git_commit`, `workflow_run`, `previous_release`, `previous_manifest_sha256`.**

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
artifact, for 7 days.

## Changing what's in a release

Edit `release-inputs.json`. A new file needs its format declared, named `zenbu.<name>.v<N>`:

- in a SQLite file, a `metadata` row `artifact_schema`;
- in a JSON file, a top-level `schema` key.

When the file's bytes can't change, name its format in `release-inputs.json` instead. Bump `vN`
only for a breaking change: a removal, rename, or change of meaning.
