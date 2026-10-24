# Language-data tools

The Python tools here build the app's bundled language data, in
`apps/ios/Modules/Sources/SearchExperience/Resources/`, and the import reports, in
`language-data/generated/`, from the pinned sources in `language-data/sources/`
([its README](../sources/README.md)). The website's dictionary service reads the same files
([`dictionary-api.md`](../../docs/agents/dictionary-api.md)). The app's own tools stay in
`apps/ios/Tools/`: `simulator.py` ([`verification.md`](../../docs/agents/verification.md)),
`prepare_sudachi_core.py` ([`ios.md`](../../docs/agents/ios.md), Build and inspect), and the
recorded-audio check, `TranslateReplay/` ([`translate.md`](../../docs/agents/translate.md)).

## Rebuild everything

```sh
uv run --no-project --python 3.14.8 python language-data/tools/rebuild_language_data.py --download
```

Two tools don't take their paths on the command line, and find them from their own folder:
`import_frequency_pack.py` the mapping SQL (`RESOURCES`), and `build_jiten_frequency_packs.py` every
file it reads and writes, in `apps/ios/Modules/Sources/SearchExperience/Resources/`,
`language-data/sources/`, and `language-data/generated/` (#929's rebuild pointed them there after
#469's move). `rebuild_language_data.py` refuses to start, naming each path it can't find
(`tools_built_in_paths`), so a later move fails before anything is built. Each records its own
SHA-256, so moving them again belongs to a rebuild.

A checkout from before the move keeps its earlier downloads (UniDic, KanjiVG, and Kanjium) in the
app's old `LanguageData/Sources/` folder, which `apps/ios/.gitignore` still ignores so none is
committed by mistake. Move them into `language-data/sources/` to use them rather than download
them again.

`rebuild_language_data.py` runs every importer in dependency order: the radicals, KANJIDIC2, kanji
elements, and stroke diagrams; then `LanguageReferenceData.sqlite3` and its ranking contract; then
everything that pins that database's SHA-256: the example word index, compound pitch, the TUBELEX,
Wikipedia, JLPT, and Jiten packs, and the website's ranked lists. It copies each pack's import report into its manifest in
`FrequencyPackCatalog.json`, moves a downloadable pack's previous manifest into
`trustedHistoricalManifests` so packs a learner already installed stay trusted, and runs the
contract tests in `language-data/tools/tests/`. `--download` fetches the sources that are fixed upstream
releases and too large to commit (UniDic 3.1.0, KanjiVG r20250816, and Kanjium at a pinned commit),
checking each against its record.

It refuses to run on any other Python. The interpreter writes the artifacts' bytes: its SQLite
version is in every database's header, its Unicode version decides NFKC and case folding, and its
zlib decides the Jiten ZIPs' bytes. uv's standalone build pins all three, so a rebuild from the
same sources gives the same files on any Mac.

The Jiten source ZIPs are served from the CDN at URLs named by their SHA-256, so a rebuild must not
change them: the script compares them with the catalog where the branch left `origin/main`. If one
changes, it fails; run it again with `--jiten-sources <dir>` and publish them
([`ios.md`](../../docs/agents/ios.md), the frequency packs) before merging. Until the branch
merges, a rebuild still reports them, published or not. A new TUBELEX,
Wikipedia, or JLPT source fails it too, until its manifest describes the source: `sourceSHA256`,
`sourceBytes`, `sourceSnapshot`, `downloadURL` (for Wikipedia, published first), the corpus counts,
and any description that names the snapshot. On every rebuild the script copies the mapping
fields and digests from the import reports, and the smoke test and the fields the app checks
against an artifact (pack version, covered rows, token total, and policy versions) from the rank
packs' artifacts; JLPT's smoke test comes from its report.

After a rebuild, re-record the six conformance suites and review their diffs, then run
`SearchExperienceTests` ([`ios.md`](../../docs/agents/ios.md), Current verification boundary),
the dictionary service's checks with `ZENBU_REQUIRE_ARTIFACT=1`, and the language-data pipeline
([`language-data/README.md`](../README.md)).

## Refresh a source snapshot

JMdict, Tatoeba, and EDRDG's KANJIDIC2, KRADFILE, and RADKFILE are published only as the latest
file at a fixed URL, so each snapshot the data is built from is committed in Git LFS beside its
record: JMdict's as `JMdict_e_examp-<date>.gz`, and the others in a folder named like the record,
such as `Tatoeba-2026-10-03/` beside `Tatoeba-2026-10-03.source.json`. To move to a newer one:

1. Download it into a new `<Name>-<date>/` folder (JMdict: `JMdict_e_examp-<date>.gz`) and write
   `<Name>-<date>.source.json` from the previous record, with the new date, HTTP `Last-Modified`
   and `ETag`, byte count, and SHA-256.
   Tatoeba's `aggregate_sha256` is the SHA-256 of its seven files' SHA-256s, each followed by LF.
   JMdict's record also has its `export_date` (the file's `JMdict created` line) and, in
   `without_examples`, the same day's `JMdict_e.gz`: its HTTP fields, and its XML's bytes and
   SHA-256. `import_jmdict.py` refuses an export whose XML, with each `<example>` block that
   starts a line removed, isn't that file, so the examples never change an entry.
2. Delete the previous record and folder. The rebuild refuses a kind with two records, and
   replaces the previous snapshot's import report.
3. Name the new records in `language-data/sources/README.md` and, for EDRDG's files,
   `EDRDG-ATTRIBUTION.md`, which ships in the language-data release. For a new JMdict, also update
   the evidence counts in `jmdict_entries.py` to the new export's.
4. For a new JMdict, keep every existing entry's `note_identity`: the app moves the notes earlier
   versions saved under it to their word (`docs/agents/ios-local-stores.md`), and
   `test_note_identity_contract.py` fails on any changed value. The rebuild hands the importer
   `main`'s database (`--previous-database`), whose value each entry it holds keeps; a new entry
   takes its computed one, or the next free suffix. Pin the test again once, after `ATTACH
   '<previous>.sqlite3' AS old`,
   `SELECT count(*) FROM old.entries o JOIN entries e USING (id) WHERE e.note_identity <>
   o.note_identity` answers 0, and list in the pull request the entries the new JMdict drops
   (`SELECT o.id FROM old.entries o LEFT JOIN entries e USING (id) WHERE e.id IS NULL`), whose
   notes go to Notes Without a Word.
5. `test_gloss_atoms_contract.py` checks that each entry's `gloss_atoms.sense_order` values run 0
   to n−1, n being its count of senses in `senses_json`: the app and the dictionary service give
   each stored sense the glosses at its position. `jmdict_entries.py` numbers every `<sense>` but
   stores only those with an English gloss, so a new JMdict with one that has none fails it.
6. Rebuild everything, re-record the suites, and list in the pull request what changed for
   learners: entries, examples added and removed, and kanji.

For JMdict, a monthly job does all this but recording the app's suites: the `JMdict monthly update`
workflow runs `refresh_jmdict.py` and opens the pull request, and a person records the suites on a
Mac and pins the release ([`jmdict-updates.md`](../jmdict-updates.md)).

## Provenance

The importers record their own SHA-256, and some of the modules they use, in what they build, and
the contract tests, the app, and the language-data pipeline check those records, so editing a tool
means rebuilding everything it built, in the same pull request. `tests/test_tool_provenance.py`
fails until then: every tool SHA-256 an import report, the ranking contract, or a catalog pack
records must be the tool's as it is now, and every import report must be in its list. Analysis
reports (`*.analysis.json`) record the tools and data as they were when the study ran, so they
aren't checked. Not every module a tool imports is recorded:
`import_jlpt_level_pack.py` records only itself, `import_compound_pitch.py` its rule,
`compound_accent.py`, but not `unidic_adapter.py`, and `build_jiten_frequency_packs.py` not
`analyze_ordered_json_frequency_lists.py`.
`example_sentence_retrieval_index.py` records its own SHA-256 in the database's retrieval
metadata, outside the ranking contract's six. `LanguageReferenceData.sqlite3`'s metadata, its import
report, and `DictionaryRankingArtifactContract.json` record six: `import_tool_sha256`, the
`tatoeba_adapter.py`, `unidic_adapter.py`, `dictionary_ranking_adapter.py`, and
`dictionary_ranking_contract.py` hashes, and `shared_tooling_sha256` for `language_data_tools.py`.
`import_tool_sha256` covers `import_jmdict.py` and the `jmdict_*.py` modules it is split into:
the SHA-256 of each file's name and SHA-256, one per line, in `IMPORT_TOOL_FILES` order.

## What each tool does

**`import_jmdict.py`** normalizes the pinned JMdict English export into the Language Reference
Data, with UniDic pitch, Tatoeba examples, and app-owned word relationships. Its import report's
`row_delta` counts the entries added, changed, and deleted since the previous database.

- `jmdict_examples.py`: each meaning's examples (`sense_examples`). `JMdict_e_examp` gives a sense
  the Tatoeba sentences whose word index marks them a good, checked example of it, by Tatoeba
  Japanese ID. One is linked only to the bundled pair that ID names, and only when that pair's
  NFC Japanese and English are the example's; any other is counted in the report, not linked.
  Entries with the same semantic fingerprint share them, in source order.
- `jmdict_normalization.py`: every JMdict part-of-speech entity code maps to stable app-owned
  category identifiers; the wording belongs to the app's part-of-speech formatter, so stored
  identifiers never carry display text. The retired description-substring labels are reproduced
  only for the note identity, which keyed notes and photos before Language Reference IDs did; the
  app reads it to move those to their word (`docs/agents/ios-local-stores.md`), and nothing
  displays them.
  Cross-references keep JMdict's form, optional reading, and optional target sense. A Language
  Reference ID is the SHA-256 of the source identity and record ID, so a provider's key is never
  exposed, and a note identity hashes an app-owned semantic signature, never provider coordinates.
- `jmdict_entries.py`: entries, forms, priority profiles, sense and reading restrictions, gloss
  atoms, and their FTS4 indexes. The import fails unless the ranking evidence matches the counts
  it expects from the pinned export.
- `jmdict_relationships.py`: note identities, disambiguated in source order, and up to six related
  words per entry, from resolved cross-references and then the editorial relationship facts.
- `jmdict_labels.py`: every JMdict usage (`misc`), subject-field (`field`), and dialect (`dial`)
  entity code on a sense maps to a stable app-owned identifier, kept in the sense's `usage`,
  `fields`, and `dialects` (left out when empty), and an unmapped code fails the import. The app
  doesn't decode them, and shows the notes it showed before; the website's browse pages list
  words by them. They aren't in a note's identity or the semantic fingerprint, so saved notes and ranking
  don't change.

**`refresh_jmdict.py`** moves the data to EDRDG's current JMdict export one step at a time
(`fetch`, `apply`, `rebuild`, `release`, `summary`), for the monthly workflow
([`jmdict-updates.md`](../jmdict-updates.md)); its `refresh_jmdict_*.py` modules aren't the
importer's, so changing them rebuilds nothing.

**`tatoeba_adapter.py`** keeps one deterministic lowest-ID English translation per linked Japanese
sentence. A pair's identity is derived only from its NFC-normalized Japanese and English: stored
compactly, and published as an `esp1_` ID. Tatoeba's record IDs, contributors, and license classes
stay in the provenance table.

**`unidic_adapter.py`** gives each entry its own word's UniDic accent, as a downstep and the
pronunciation's mora count (#929). A row is the entry's word when its lemma, without UniDic's
`-meaning` suffix, is one of the entry's written forms (for a word written in kana, then one of its
readings), read as the entry is by the row's own word form or pronunciation, else by the lemma's
reading. Only when no lemma matches does a row spelled exactly like the entry count, and only when
that spelling and reading name one lemma; a kana spelling never brings in a proper noun. Proper
nouns count only when no common noun does. Where the word's rows disagree, those spelled like the
headword come first, and the one UniDic's word cost rates likeliest gives the accent, the first of
its `aType` values, the lower downstep breaking a tie. The choice reads only the entry's own rows,
so homophones such as 橋, 箸, and 端 never share one, and a word UniDic gives no accent, such as a
particle, has none. `tests/test_unidic_pitch.py` runs it on UniDic's real ハシ and カミ rows.

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

**`import_compound_pitch.py`** estimates pitch for compounds UniDic doesn't list whole, such as
記者会見 and クレジットカード, from their parts, with the rule in `compound_accent.py` (#825).
`tests/test_compound_pitch_rule.py` runs it on UniDic's real rows for each case below.

- **Parts.** Every UniDic row of a noun, na-adjective, prefix, or suffix is a possible part,
  matched by its spelling and its kana form (`kanaBase`), so suffix rows with no accent of their own
  (〜者, 〜官) and rendaku forms (運動ぶそく) count. A kana part needs two characters and a
  katakana one three; the only kana affixes are お, ご, 御, さん, さま, ちゃん, くん, and たち. A
  word is split when it has kanji and three characters or more, or is katakana of four or more, so
  a hiragana word such as には never is.
- **Splits.** A word splits into two to four parts. The splits with the fewest parts that give a
  value must all agree; a split that gives no value is left out. クレジットカード gets 6, though
  one of its splits, through a カード row with no combination type, gives none; 個人的 gets none,
  since its splits give 2 and 0.
- **Combining.** Parts combine left to right by UniDic's `aConType`: C1 keeps the later part's
  downstep (heiban stays heiban), C2 puts it on the later part's first mora, C3 on the earlier
  part's last mora, C4 makes the word heiban, and C5 keeps the earlier part's. A prefix combines by
  its P-type (P1, P2, P4, P6, P13, or P14). A downstep on a special mora (ん, っ, ー, or the second
  half of a long vowel or diphthong) moves one mora left, but never across a part's start:
  委員長 is いい＼んちょう, and 選挙運動 stays せんきょう＼んどう.
- **The gate.** Words are grouped by script, by the types their splits' last parts have (and
  whether a split starts with a prefix), and by their number of parts (two, or three or more).
  Only the 24 groups in `SHIPPED_GROUPS` ship: those that agreed with Kanjium's accents on at least
  90% of at least 30 uncommon words. Kanjium was only measured against, never imported, and the
  list names groups, not accents. 観光客 (C3) and 可能性 (C4) are estimated in groups below it.
- **The C2 fallback.** Where the rule gives no value, as when its splits disagree (小学校) or its
  group is below the gate (火曜日), a two-part kanji compound keeps the earlier C2 rule's: when it
  splits into two accented UniDic nouns, read by their lemma readings, and every such split's
  second part is C2, the downstep falls on that part's first mora (`two_part_c2_downstep`). The
  rule's value wins wherever it gives one, and never differs from C2's where both do.
- **Left out.** Four-character idioms (JMdict's `yojijukugo`) and words ending in the suffix 的 get
  none from the rule or the fallback, since their estimates mostly disagree with the references
  (C2 gave 弱肉強食 5; it's heiban). A word ending in the noun 目的 (多目的, 最終目的) isn't one,
  unless what precedes its 的 is a word itself (盲目的 is 盲目 and 的). Nor does a word JMdict lists
  first as an expression, particle, conjunction, interjection, auxiliary, or affix (立ち入り禁止,
  何時間), so these keep showing no pitch.

The report's `outcomes` count each step's results. On release 2026.10.5's data, 1,554 common
entries get a value (C2 gave 713): 1,495 from the rule, agreeing with Kanjium on 93.3% of 1,256
and with English Wiktionary on 91.9% of 528, and 59 from the fallback, agreeing 78.6% of 56 and
76.9% of 39. UniDic's own accents agree 96.8% and 96.6%.

**`import_frequency_pack.py`** builds a rank pack from a curated list. TUBELEX counts UniDic lemmas,
so a lemma's reading names the word it counted even where JMdict files the spelling under several
readings; lemmas UniDic files under several readings, such as 家, get none. JMdict writes katakana
words' readings in katakana and the rest in hiragana. A row gets a reading only where mapping V1
can't place it, so no entry V1 ranks loses its rank or gets a worse one. The content digest is
described in [`frequency.md`](../../docs/agents/frequency.md), Trust.

**`import_jlpt_level_pack.py`** builds the JLPT level pack from Waller's lists with stephenmk's
JMdict sequence numbers, by exact join. Rows without one are unmapped, and an entry listed at
several levels keeps the easiest. Its mapping digest is each ID's 16 bytes, then its level as a
64-bit big-endian integer, in ID order. Its `--record`, `--language-data`, and `--output` default to
the files the rebuild passes.

**`build_jiten_frequency_packs.py`** builds the downloadable Jiten pack sources: a ZIP, with a fixed
timestamp, of one JSON array of `[dictionary form, reading]` pairs in rank order. Each list's
final bucket, Jiten's unobserved words, is dropped and the rest are ranked by position. A pack of
several lists ranks pairs by mean list percentile, counting a missing pair as 1.0, so a word must
be common across all of them. It rewrites the Jiten manifests, moving changed ones into history,
and keeps each pack's mapped evidence beside its ZIP (`<packID>.sqlite3`), mapped with
`FrequencyPackMappingV2.sql` as the app's installer maps it.

**`build_ranked_lists.py`** collects the Wikipedia and Jiten packs' mapped ranks into
`RankedLists.sqlite3` (`zenbu.ranked-lists.v1`), for the website's dictionary service: each
pack's evidence must hash to the `mappingSHA256` its manifest pins, which the app checks when it
installs the pack, so the service ranks words exactly as the app does. The file sits in the app's
`Resources` beside the other artifacts but `Package.swift` leaves it out of the app. The
language-data release carries it, with Jiten's notice and Wikipedia's license
([`language-data/README.md`](../README.md));
`tests/test_ranked_lists_contract.py` checks it against the catalog and the language data.

**`analyze_frequency_candidates.py`** (#376) and **`analyze_ordered_json_frequency_lists.py`**
(#351) are the analyses behind the current packs' choice, recorded in their `generated/` reports
([`FREQUENCY_SOURCE_DECISIONS.md`](../FREQUENCY_SOURCE_DECISIONS.md)). The #376 analysis reads the
old folders, through `analyze_frequency_candidates.py`'s TUBELEX path and its plan's Jiten paths,
so re-running it needs both pointed at `language-data/sources/` first.

**`import_kanjivg.py`** encodes KanjiVG's stroke paths as numeric instructions: opcode 0 is
move(x, y) and opcode 1 is cubic(control1, control2, end). r20250816 uses only the M, C, and S
commands; any other fails the import rather than entering the artifact.

**`import_radicals.py`**, **`import_kanjidic.py`**, and **`import_kanji_elements.py`** normalize
EDRDG's radical files, KANJIDIC2, and Kanjium into the kanji reference data, in that order.
`import_kanjidic.py` also gives each kanji Jonathan Waller's JLPT level, `wallerJlptLevel`, which
**`import_jlpt_kanji_levels.py`** reads from the Internet Archive's captures of his five kanji
pages: the one table on each page whose header is Kanji, Onyomi, Kunyomi, English. A page whose
size, SHA-256, or kanji count differs from its record, or a kanji KANJIDIC2 lacks, fails the
import. The app's and the website's kanji details show it as the JLPT level, and the website's
JLPT kanji lists use it. KANJIDIC2's own `jlpt`, its pre-2010 level, stays in the file, and
nothing reads it.

**`publish_frequency_pack_sources.py`** uploads downloadable pack sources to the CDN bucket. It
matches each file to manifests by byte count and SHA-256, never by name, uploads it to the key its
manifest's `downloadURL` names, which contains its SHA-256, so objects are immutable and every
trusted historical manifest stays downloadable, and then downloads each public URL to verify it.
