# Verified foundation sample

Extracted 2026-09-05 from the actual bundled artifacts at base commit
`bcdceba` (`refactor/native-swiftui-components`). Both artifacts were restored
from their existing Git LFS objects and checked as SQLite databases; pointer
text was not treated as data. Artifact paths are under
`apps/ios/Modules/Sources/SearchExperience/Resources/`:

| Artifact                      | Verified SHA-256                                                 |
| ----------------------------- | ---------------------------------------------------------------- |
| LanguageReferenceData.sqlite3 | f69d66155955e4b88f8b7501965dc05665bf5bd21a0199f02cb12467c3d0d092 |
| TUBELEXFrequencyPack.sqlite3  | d4a9e84b8a2c359394015a01f82307ea68c1a61c32597b7d7cab82ee5d4a6d87 |

| Headword | Reading    | JMdict ent_seq | App LanguageReferenceID          |
| -------- | ---------- | -------------- | -------------------------------- |
| 食べる   | たべる     | 1358280        | 042e07f7052f611fed33ddddf37f55fd |
| 今日は   | こんにちは | 1289400        | 4e5300d8c3ec437367fdc5e36f09010f |
| 橋       | はし       | 1237410        | 4d23e97b17d2c2cba357382be08dac1f |
| 橋       | きょう     | 2151440        | 5db1f282105450687047aaab5026ad72 |

`samples.json` retains `sourceIdentity: edrdg.jmdict` and each source record ID.
The displayed headword and entry ID are copied exactly. The canonical app
identity is lowercase hex of the entry BLOB, per `LookupClient.selectedColumns`.
The readable route combines the headword and retained JMdict ID per #271;
resolving a wrong headword/ID pair returns 404.

The read-only selection was `entries WHERE source_record_id IN
(1358280,1289400,1237410,2151440)`. Fields were mapped exactly as
`LookupClient.decodeEntry`: `headword`, `reading`, `summary`, parsed
`parts_of_speech_json`, `written_forms_json`, `reading_forms_json`, `senses_json`,
`pitch_accent_json`, and `is_common`. Swift `PartOfSpeech` decodes a JSON string
into its `rawValue`; the TypeScript sample retains that wrapper. Private note
identity, learner records, rank scores and unused relationships are omitted.

Romaji strings come from `forms WHERE entry_id = ? AND kind = 2`, preserving
stored form order. These are reading aids/search terms from the app artifact,
not a web romanization implementation. Full-word ruby uses the supplied reading
without inventing per-kanji alignment. Pitch evidence is the stored object,
including its original UniDic source identity. For example, 食べる has downstep 2,
moraCount 3. The neutral capsule and red under-text downstep follow
`WordDetailView.PitchAccentView` and `ZenbuTheme.pitchDownstep`.

Frequency was joined by the identical app ID BLOB to `frequency_evidence` in
the TUBELEX artifact. Corpus disclosure, total tokens and corpus counts come
from the first manifest in `FrequencyPackCatalog.json`, version 2025.1.
All row evidence, mapping relation and record digest are retained. The pons
entry has no joined row and therefore has `frequency: null`; no rank is inferred.
Ranks measure the pinned YouTube corpus, not universal Japanese frequency.

## One entry-associated example

`ExampleSentenceClient.retrieveEntry` requires a unique selected written form
plus reading. Its exact uniqueness SQL returns **1** for 食べる / たべる. The
selected example is the first selected-written-form candidate under its
match-position, Japanese-length and app-pair-ID ordering:

- ID: `esp1_101c1072091d90ca232c113d205029ee`
- Japanese: `食べる？` — Tatoeba 12824508, contributor `bunbuku`
- English: `Do you want to eat?` — Tatoeba 773323, contributor `marloncori`
- Pair provenance: `tatoeba.weekly-export`, 2026-08-08, CC BY 2.0 FR
- Snapshot SHA-256: `2d262f6686050315b842b84d0e60b6d9613f6b42e431ea94d3fbe45b8e6b830e`

Read with `example_sentences JOIN example_sentence_provenance ON pair_id=id`
and `instr(japanese, '食べる') > 0`, ordered by match position, length and hex ID,
limit 1. The prefix and lowercase 16-byte hex ID follow `ExampleSentenceID`.
Other entries have no selected example in this small fixture, which does not
claim the corpus lacks examples. No runtime association engine is implemented.

## Source notices

JMdict English export snapshot 2026-08-10 is by the Electronic Dictionary
Research and Development Group, [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html).
The web JSON is a reformatted subset of the existing app artifact. Dictionary
text and its source links remain visible in page content. The Tatoeba example
links to both original contributors and its CC BY 2.0 FR license. UniDic and
TUBELEX BSD notices are retained in `public/data-notices.txt` and linked from the
sample pages. The full source manifests/licenses remain authoritative under
`apps/ios/LanguageData/Sources` and the iOS Resources directory.
