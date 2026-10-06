# iOS data tools

The Python tools here build the app's bundled language data, in
`apps/ios/Modules/Sources/SearchExperience/Resources/`, and the import reports beside it, in
`apps/ios/LanguageData/Generated/`, from the pinned sources in `apps/ios/LanguageData/Sources/`
([its README](../LanguageData/Sources/README.md)). The website's dictionary service reads the same
files ([`dictionary-api.md`](../../../docs/agents/dictionary-api.md)).

## Rebuild everything

```sh
uv run --no-project --python 3.14.8 python apps/ios/Tools/rebuild_language_data.py --download
```

`rebuild_language_data.py` runs every importer in dependency order: the radicals, KANJIDIC2, kanji
elements, and stroke diagrams; then `LanguageReferenceData.sqlite3` and its ranking contract; then
everything that pins that database's SHA-256: the example word index, compound pitch, the TUBELEX,
Wikipedia, JLPT, and Jiten packs. It copies each pack's import report into its manifest in
`FrequencyPackCatalog.json`, moves a downloadable pack's previous manifest into
`trustedHistoricalManifests` so packs a learner already installed stay trusted, and runs the
contract tests in `apps/ios/Tools/tests/`. `--download` fetches the sources that are fixed upstream
releases and too large to commit (UniDic 3.1.0, KanjiVG r20250816, and Kanjium at a pinned commit),
checking each against its record.

It refuses to run on any other Python. The interpreter writes the artifacts' bytes: its SQLite
version is in every database's header, its Unicode version decides NFKC and case folding, and its
zlib decides the Jiten ZIPs' bytes. uv's standalone build pins all three, so a rebuild from the
same sources gives the same files on any Mac.

The Jiten source ZIPs are served from the CDN at URLs named by their SHA-256, so a rebuild must not
change them: the script compares them with the last commit's catalog. If one changes, it fails;
run it again with `--jiten-sources <dir>` and publish them
([`ios.md`](../../../docs/agents/ios.md), the frequency packs) before merging. A new TUBELEX,
Wikipedia, or JLPT source fails it too, until its manifest describes the source: `sourceSHA256`,
`sourceBytes`, `sourceSnapshot`, `downloadURL` (for Wikipedia, published first), the corpus counts,
and any description that names the snapshot. On every rebuild the script copies the mapping
fields, digests, and smoke test from the import reports, and the fields the app checks against an
artifact (pack version, covered rows, token total, and policy versions) from the artifact itself.

After a rebuild, re-record the five conformance suites and review their diffs, then run
`SearchExperienceTests` ([`ios.md`](../../../docs/agents/ios.md), Current verification boundary),
the dictionary service's checks with `ZENBU_REQUIRE_ARTIFACT=1`, and the language-data pipeline
([`language-data/README.md`](../../../language-data/README.md)).

## Refresh a source snapshot

JMdict, Tatoeba, and EDRDG's KANJIDIC2, KRADFILE, and RADKFILE are published only as the latest
file at a fixed URL, so each snapshot the data is built from is committed in Git LFS beside its
record: JMdict's as `JMdict_e-<date>.gz`, and the others in a folder named like the record, such as
`Tatoeba-2026-10-03/` beside `Tatoeba-2026-10-03.source.json`. To move to a newer one:

1. Download it into a new `<Name>-<date>/` folder (JMdict: `JMdict_e-<date>.gz`) and write
   `<Name>-<date>.source.json` from the previous record, with the new date, HTTP `Last-Modified`
   and `ETag`, byte count, and SHA-256.
   Tatoeba's `aggregate_sha256` is the SHA-256 of its seven files' SHA-256s, each followed by LF.
2. Delete the previous record and folder. The rebuild refuses a kind with two records, and
   replaces the previous snapshot's import report.
3. Name the new records in `apps/ios/LanguageData/Sources/README.md` and, for EDRDG's files,
   `EDRDG-ATTRIBUTION.md`, which ships in the language-data release. For a new JMdict, also update
   the evidence counts in `jmdict_entries.py` to the new export's.
4. Rebuild everything, re-record the suites, and list in the pull request what changed for
   learners: entries, examples added and removed, and kanji.

## Provenance

The importers record their own SHA-256, and some of the modules they use, in what they build, and
the contract tests, the app, and the language-data pipeline check those records, so editing a tool
means rebuilding everything it built. Not every module a tool imports is recorded:
`import_jlpt_level_pack.py` records only itself, `import_compound_pitch.py` not `unidic_adapter.py`,
and `build_jiten_frequency_packs.py` not `analyze_ordered_json_frequency_lists.py`.
`example_sentence_retrieval_index.py` records its own SHA-256 in the database's retrieval
metadata, outside the ranking contract's six. `LanguageReferenceData.sqlite3`'s metadata, its import
report, and `DictionaryRankingArtifactContract.json` record six: `import_tool_sha256`, the
`tatoeba_adapter.py`, `unidic_adapter.py`, `dictionary_ranking_adapter.py`, and
`dictionary_ranking_contract.py` hashes, and `shared_tooling_sha256` for `language_data_tools.py`.
`import_tool_sha256` covers `import_jmdict.py` and the `jmdict_*.py` modules it is split into:
the SHA-256 of each file's name and SHA-256, one per line, in `IMPORT_TOOL_FILES` order.

## What each tool does

**`import_jmdict.py`** normalizes the pinned JMdict English export into the Language Reference
Data, with UniDic pitch, Tatoeba examples, and app-owned word relationships.

- `jmdict_normalization.py`: every JMdict part-of-speech entity code maps to stable app-owned
  category identifiers; the wording belongs to the app's part-of-speech formatter, so stored
  identifiers never carry display text. The retired description-substring labels are reproduced
  only for durable-note identity, since saved notes are keyed by it; nothing displays them.
  Cross-references keep JMdict's form, optional reading, and optional target sense. A Language
  Reference ID is the SHA-256 of the source identity and record ID, so a provider's key is never
  exposed, and a note identity hashes an app-owned semantic signature, never provider coordinates.
- `jmdict_entries.py`: entries, forms, priority profiles, sense and reading restrictions, gloss
  atoms, and their FTS4 indexes. The import fails unless the ranking evidence matches the counts
  it expects from the pinned export.
- `jmdict_relationships.py`: note identities, disambiguated in source order, and up to six related
  words per entry, from resolved cross-references and then the editorial relationship facts.

**`tatoeba_adapter.py`** keeps one deterministic lowest-ID English translation per linked Japanese
sentence. A pair's identity is derived only from its NFC-normalized Japanese and English: stored
compactly, and published as an `esp1_` ID. Tatoeba's record IDs, contributors, and license classes
stay in the provenance table.

**`unidic_adapter.py`** turns UniDic's accent type into a downstep and pronunciation mora count, by
exact base form and pronunciation or reading.

**`example_sentence_retrieval_index.py`** builds the example retrieval indexes in one transaction
and validates them, failing closed unless the artifact meets the v1 contract; validation runs the
bound-phrase FTS form the app uses, and a test artifact may have no rows. Its corpus checksum
hashes each pair's identity and text, not SQLite's layout. Its `--rebuild` replaces the indexes in
place without updating the import report, so rebuild everything instead.

**`dictionary_ranking_adapter.py`** and **`dictionary_ranking_contract.py`** compute the ranking
tables' integrity digest and write the app's runtime contract from the import transform.

**`import_example_word_index.py`** links examples to kana-headword entries. A kana headword such as
でも also occurs inside other words (いつでも), so substring matching can't find its examples;
Tatoeba's `jpn_indices` export lists the dictionary words each sentence uses. An index token is a
headword, then an optional (reading) or (#JMdict sequence), [sense], {surface}, and `~`. Its
headword is the entry's first written form (其れ for それ), or its kana when the word is usually
written in kana, so bare kana such as そう names an entry only when one candidate shows that kana
as its headword. Each entry keeps its best 200 sentences: Word Detail shows at most 100 and counts
past 50 as "50+".

**`import_compound_pitch.py`** estimates pitch for two-part noun compounds UniDic doesn't list
whole, such as 記者会見. When the compound splits one way into two UniDic nouns and the second has
accent-combination type C2, the downstep falls on the second part's first mora (きしゃか＼いけん).
Measured against entries UniDic does give pitch for, the rule matches 92% of two-part C2
compounds; the other types are too unreliable to ship. Candidate parts are tried in sorted order,
so the result doesn't depend on Python's hash seed.

**`import_frequency_pack.py`** builds a rank pack from a curated list. TUBELEX counts UniDic lemmas,
so a lemma's reading names the word it counted even where JMdict files the spelling under several
readings; lemmas UniDic files under several readings, such as 家, get none. JMdict writes katakana
words' readings in katakana and the rest in hiragana. A row gets a reading only where mapping V1
can't place it, so no entry V1 ranks loses its rank or gets a worse one. The content digest is
described in [`ios.md`](../../../docs/agents/ios.md), the frequency packs.

**`import_jlpt_level_pack.py`** builds the JLPT level pack from Waller's lists with stephenmk's
JMdict sequence numbers, by exact join. Rows without one are unmapped, and an entry listed at
several levels keeps the easiest. Its mapping digest is each ID's 16 bytes, then its level as a
64-bit big-endian integer, in ID order.

**`build_jiten_frequency_packs.py`** builds the downloadable Jiten pack sources: a ZIP, with a fixed
timestamp, of one JSON array of `[dictionary form, reading]` pairs in rank order. Each list's
final bucket, Jiten's unobserved words, is dropped and the rest are ranked by position. A pack of
several lists ranks pairs by mean list percentile, counting a missing pair as 1.0, so a word must
be common across all of them. It rewrites the Jiten manifests, moving changed ones into history.

**`analyze_frequency_candidates.py`** (#376) and **`analyze_ordered_json_frequency_lists.py`**
(#351) are the analyses behind the current packs' choice, recorded in their `Generated/` reports
([`FREQUENCY_SOURCE_DECISIONS.md`](../LanguageData/FREQUENCY_SOURCE_DECISIONS.md)).

**`import_kanjivg.py`** encodes KanjiVG's stroke paths as numeric instructions: opcode 0 is
move(x, y) and opcode 1 is cubic(control1, control2, end). r20250816 uses only the M, C, and S
commands; any other fails the import rather than entering the artifact.

**`import_radicals.py`**, **`import_kanjidic.py`**, and **`import_kanji_elements.py`** normalize
EDRDG's radical files, KANJIDIC2, and Kanjium into the kanji reference data, in that order.

**`publish_frequency_pack_sources.py`** uploads downloadable pack sources to the CDN bucket. It
matches each file to manifests by byte count and SHA-256, never by name, uploads it to the key its
manifest's `downloadURL` names, which contains its SHA-256, so objects are immutable and every
trusted historical manifest stays downloadable, and then downloads each public URL to verify it.

**`prepare_sudachi_core.py`** fills the Sudachi Core cache the app's build reads
([`ios.md`](../../../docs/agents/ios.md), Build and inspect).
