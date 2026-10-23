# Retired entries

A word page's URL ends in its JMdict entry number (`ent_seq`), and an entry number that a
published release once held answers 410, or 308 when a replacement is recorded; any other unknown
number answers 404 ([ADR 0007](../docs/adr/0007-publish-the-dictionary-at-permanent-urls-from-the-websites-copy.md)).
So each release records the entries it retires
([issue 828](https://github.com/serpcompany/zenbujapanese-monorepo/issues/828)). The Language
Reference ID is a hash of the entry number, so a retired entry number is a retired Language
Reference ID too.

## What a release records

- **`releases/<release>/ent-seq-changes.json`** (`zenbu.ent-seq-changes.v1`), for each pinned
  release after the first, committed beside its pin: the release pinned before it
  (`previous_release`), each entry dropped since (`dropped`: its `ent_seq`, the `headword` and
  `reading` it had, and its `replacement` or `null`), and each entry added (`added`).
- **`derived/RetiredEntries.json`** (`zenbu.retired-entries.v1`), a release file: every entry a
  pinned release held that this one doesn't, each with the release that dropped it
  (`retired_in`) and its `replacement` or `null`, and the `language_data_sha256` of the database
  it was made for. It's cumulative, so a client needs only its own release's.

The dictionary service reads `RetiredEntries.json`, refusing one that isn't the pinned release's
or was made for another database, and `/v1/retired` answers it
([`dictionary-api.md`](../docs/agents/dictionary-api.md)). The website's worker turns a word URL
whose entry is listed into a 410, or a 308 to its replacement
([`web.md`](../docs/agents/web.md), Retired word URLs).

Release 2026.10.1 is the first pinned release. Releases 2026.10.2 to 2026.10.5 hold the same
entries, so they retire none.

## Which entry replaces a retired one

JMdict doesn't say where a deleted entry went. A dropped entry's replacement is the entry the new
release holds with the same headword and reading, when it holds exactly one: the usual trace of
two entries merged into one, and the rule in #828's plan. With none, or more than one, there's no
replacement, and the URL answers 410. When a replacement is dropped later, the entries it replaced
move on to its own replacement, or to none, so the website redirects in one hop. An entry that
comes back is no longer retired.

The rule needs the dropped entry's headword and reading, which only the previous release's
database holds, and CI has only the current one. So `retire` applies it when the release is made,
and the changes file records the headword and reading it matched.

## Making them

`package.py retire`, run after the files are rebuilt and `release.json` is bumped
([`README.md`](README.md#changing-the-data)), compares the working tree's language-reference
database with the one the previous pinned release pins, writes the release's changes file, then
writes `RetiredEntries.json` from every release's changes. It reads the previous database from
this checkout's Git LFS store by its oid, which is there when the checkout pulled it before the
rebuild; otherwise pass that file with `--previous-database`. When the database hasn't changed, it
reads no other.

## What the build checks

`package.py build` checks these from what the repository holds, without the bucket:

- Each pinned release after the first has a changes file that follows the release pinned before
  it, and the first has none.
- Walked back from the database it builds, each release's changes turn its entries into the
  previous release's, whose ID digest (`ids.ent_seq_sha256`) that release's pin holds. So no
  dropped or added entry is missed or invented, back to the first release.
- Every replacement is an entry its release holds, and the newest release's are exactly what the
  rule gives from the recorded headwords and readings.
- Each earlier release whose pin holds a `RetiredEntries.json` is what the changes up to it make,
  byte for byte, so a merged release's changes can't be edited later. (`check-pin --base` refuses
  any change in a merged release's folder too.)
- `RetiredEntries.json` is what the changes make, for the database it builds.
