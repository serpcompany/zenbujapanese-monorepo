# JMdict's monthly update

EDRDG's licence asks sites that serve JMdict to update it at least once a month, and EDRDG serves
only the current day's file. So the `JMdict monthly update` workflow refreshes the snapshot on the
1st of each month, the way [`tools/README.md`](tools/README.md) says (Refresh a source snapshot),
and opens a pull request; a person finishes it on a Mac. Where and how the workflow runs, and the
token it opens the pull request with, are in
[`ci-deploys.md`](../docs/agents/ci-deploys.md#jmdict-monthly-update).

## The steps

`language-data/tools/refresh_jmdict.py` holds the steps, one command each. Every command takes
`--work <folder>`, which the steps share. The workflow runs each through uv on the Python the data
tools pin, and `rebuild` refuses any other ([`tools/README.md`](tools/README.md), Rebuild
everything):

| Command | What it does |
| --- | --- |
| `fetch` | Downloads `JMdict_e_examp.gz` and `JMdict_e.gz` into `export/` and checks they're one day's pair: each file's `JMdict created` line names the same day, the first without its example blocks is byte for byte the second, and the DTD revision is the record's. It writes the new record's fields, and prints whether the export is newer than the pinned one. An older export, or other bytes under the pinned date, fails. |
| `apply` | Writes `JMdict_e_examp-<date>.source.json` and its snapshot, deletes the previous pair, renames the snapshot in `sources/README.md` and `EDRDG-ATTRIBUTION.md`, and writes the export's evidence counts into `jmdict_entries.py`, from a pass of the importer's own entry code. |
| `rebuild` | Rebuilds everything JMdict feeds, as `rebuild_language_data.py` does but for the kanji data, which reads no JMdict. It hands the importer `main`'s database, fails if any entry that database held has another `note_identity`, pins `test_note_identity_contract.py` again, and runs the contract tests and the Jiten check. |
| `release` | Names the next release in `release.json`: `YYYY.MM.N` for the month it runs. |
| `summary` | Writes the pull request's title and body, below. |

Between `rebuild` and `summary`, the workflow records the tokenizer suite again
(`pnpm --filter zenbujapanese-dictionary-api tokenizer-suite`), records the release's retired
entries with `package.py retire`, handing it `main`'s database from the work folder
([`retired-entries.md`](retired-entries.md)), and exports the core's fixtures
(`pnpm --filter zenbujapanese-dictionary-api fixtures`).

The pull request counts the entries added, removed, and changed, with up to four examples each,
and splits the changes into meanings, number of meanings, forms, headword or reading, and common or
no longer common. It lists every removed entry with what its URL answers now: 410, or 308 to the
entry written and read the same, by `retire`'s rule. It counts each meaning's checked examples
before and after, and says what a person does before it merges.

A run fails without a pull request when the export or the import needs a person: a download
fails, EDRDG's two files disagree, the DTD moved, the importer or the contract tests refuse the
export (a JMdict code the importer doesn't map, a sense with no English gloss), or an entry would
lose its note identity. A YouTube reviewed reading fails it too when the new export changes its
entries: the reading no longer ranks the entry its row names, or would cost an entry its rank.
Review that row again in `sources/TUBELEX-ja-310-lemma-pos.reviewed-readings.json`
([`FREQUENCY_SOURCE_DECISIONS.md`](FREQUENCY_SOURCE_DECISIONS.md), #826). Fix the cause as the
refresh by hand would, then run the workflow again from the Actions tab.

## The suites

A JMdict update moves every suite recorded from `LanguageReferenceData.sqlite3`: `search-retrieval`,
`search-results`, `example-search`, `word-detail`, `kanji-detail`, `sentence-search`, and
`sentence-results`. The app records all seven, in `SearchExperienceTests` on an iPhone Simulator
([`ios.md`](../docs/agents/ios.md), Current verification boundary), so the workflow records none of
them. The two sentence suites also pin Sudachi's dictionary, which isn't among the app's files and
which the update leaves alone, so the pull request names them for `LanguageReferenceData.sqlite3`
alone. `kanji-element` reads only the kanji elements and `tokenizer` only Kuromoji's files, which
the update leaves alone; the tokenizer suite comes from kuromoji.js, the one a runner can record,
and the workflow records it each time. `romaji` is edited by hand.

A suite not yet recorded again can't pass by accident. The dictionary service's replays fail with
"The suite was recorded from other files", naming each file and both SHA-256s, and the app's with
"The suite was recorded against different artifacts"; `package.py build` refuses the release while
a suite pins another file; and `check-pin` fails until the release is pinned.

## After each monthly pull request

A person, on a Mac with the branch checked out and `git lfs pull` run:

1. Records again each suite the pull request's Status lists, with
   `TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1` and `-only-testing:` for its test class, and reviews
   each diff.
2. Runs those suites without recording, then `pnpm check` in `packages/dictionary-core` and, with
   `ZENBU_REQUIRE_ARTIFACT=1`, in `apps/dictionary-api`. A test that holds a number from the data,
   such as a word's place in a list, moves with the data, as in #999.
3. Commits, then builds and pins the release ([`README.md`](README.md#changing-the-data), steps 4
   and 5).
4. Pushes. That starts the pull request's checks and its review, which GitHub doesn't start for a
   pull request a workflow's token opened.
5. Writes what the recordings and checks showed into the pull request's Evidence and Status.
