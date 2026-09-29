# Language data releases

Every Zenbu app will read one versioned language-data release from R2
([ADR 0006](../docs/adr/0006-share-language-data-as-a-versioned-artifact.md),
[issue 463](https://github.com/serpcompany/zenbujapanese-monorepo/issues/463)). This folder
holds the pipeline that packages a release. Nothing is published yet: that's step 3 of the plan
on #463. The source data, tools, and conformance suites still live under `apps/ios` until #469
moves them.

| File | What it is |
| --- | --- |
| [`release.json`](release.json) | The next release's ID (`YYYY.MM.N`) and the release it follows. |
| [`release-inputs.json`](release-inputs.json) | What goes in the release, by repository path. Paths start with a root name from `roots`, so a move (#469) changes only `roots`. |
| [`schemas/language-data-manifest.v1.schema.json`](schemas/language-data-manifest.v1.schema.json) | The manifest's JSON Schema, `zenbu.language-data-manifest.v1`. |
| [`pipeline/package.py`](pipeline/package.py) | The packager. |
| [`pipeline/tests/`](pipeline/tests/) | Tests for the packager and the schema. |

## A release

A release is a `manifest.json` plus its files. Each file is stored at `files/<sha256>/<name>`,
content-addressed, so an unchanged file keeps its object across releases. The manifest lists:

- **`files`:** each file's `name`, `sha256` (of the bytes as committed; for a Git LFS file, its
  oid), `bytes`, `depends_on` (the files whose SHA-256 it pins), `row_counts` for every
  ordinary table of a SQLite file, and `artifact_schema`, with `schema_source` saying where
  the schema comes from:
  - `file`: the file declares it (a SQLite `metadata` row, or a JSON `schema` key).
  - `plan`: the file declares none, so `release-inputs.json` names it. Today only
    `LanguageReferenceData.sqlite3`, as `zenbu.language-reference.v2`.
  - `undeclared`: nothing names one, so it's `null`. That covers the Kuromoji files, the notices,
    `KanjiReferenceData.json`, `RadicalReferenceData.json`, and
    `DictionaryRankingArtifactContract.json`, whose `schemaVersion` names the ranking it checks,
    not the file's own format.
- **`sources`:** archives that clients download from the CDN themselves, which the release names
  but doesn't contain: the Wikipedia and Jiten frequency-pack sources, from
  `FrequencyPackCatalog.json`.
- **`ids`:** the count of JMdict entry numbers (`ent_seq`) and a SHA-256 over them, sorted
  ascending, in decimal, each followed by a line feed. The digest can be recomputed from any
  copy, such as D1, since it doesn't depend on file order.
- **`conformance`:** each conformance suite's SHA-256.
- **`core_sha256`:** the shared core's hash. `null` until the core exists (step 6).
- **`release`, `git_commit`, `workflow_run`, `previous_release`, `previous_manifest_sha256`.**

Release 1 packages the committed files exactly as they are. `package.py build` refuses a file
whose bytes differ from HEAD (a Git LFS file's pointer, or any other file's blob), from any
conformance suite's pin, or from a pin in another file: a pack's `language_data_sha256`, the
ranking contract's database SHA-256, size, and row counts, or the frequency-pack catalog's
bundled pack SHA-256 and source archive SHA-256.

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
on pull requests and on `main` when language data or the pipeline changes. It has no secrets and
keeps the output as an Actions artifact for 7 days.

## Changing what's in a release

Edit `release-inputs.json`. A new file needs its format declared: a `metadata` row
`artifact_schema` in a SQLite file, or a top-level `schema` in a JSON file, named
`zenbu.<name>.v<N>`. Only when that isn't possible, name it in `release-inputs.json`. Bump `vN`
only for a breaking change: a removal, rename, or change of meaning.
