# Language data sources

This directory contains the pinned source records, dependency notices, and local
inputs used to build or install Zenbu Japanese language data. The repository-wide
[`data sources`](../../../../docs/data-sources.md) index lists every source and its consumers;
this directory holds the iOS specifics.

The `*.source.json` files are the source of truth for upstream identity,
snapshot, download location, checksum, and import configuration. The importers under
`apps/ios/Tools/` define the transformations ([their README](../../Tools/README.md), which says how
to rebuild everything and refresh a snapshot). Generated runtime artifacts live
under `apps/ios/Modules/Sources/SearchExperience/Resources/`.

Sources published only as the latest file at a fixed URL are committed, in Git LFS, beside their
records: `JMdict_e-2026-08-10.gz`, and the `Tatoeba-2026-10-03/`, `Tatoeba-jpn-indices-2026-10-03/`,
`KANJIDIC2-2026-10-05/`, and `EDRDG-radicals-2026-08-10/` folders. Fixed upstream releases too large
to commit (UniDic, KanjiVG, and Kanjium) are downloaded by the rebuild and git-ignored.

| Data | Source record | Importer |
| --- | --- | --- |
| Dictionary entries and examples | `JMdict_e-2026-08-10.source.json`, `UniDic-CWJ-3.1.0.source.json`, `Tatoeba-2026-10-03.source.json` | `import_jmdict.py` |
| Examples for kana-headword words | `Tatoeba-jpn-indices-2026-10-03.source.json` | `import_example_word_index.py` |
| Estimated pitch for two-part compounds | `UniDic-CWJ-3.1.0.source.json` | `import_compound_pitch.py` |
| Kanji reference data | `KANJIDIC2-2026-10-05.source.json` | `import_kanjidic.py` |
| Radicals and components | `EDRDG-radicals-2026-08-10.source.json` | `import_radicals.py` |
| Kanji elements | `Kanjium-8a0cdaa.source.json` | `import_kanji_elements.py` |
| Stroke diagrams | `KanjiVG-2025-08-16.source.json` | `import_kanjivg.py` |
| Handwriting recognition | `DaKanji-v1.2.source.json` | Bundled Core ML model |
| JLPT levels | `JLPT-Waller-2025-08-26.source.json` | `import_jlpt_level_pack.py` |
| Frequency data | `TUBELEX-ja-310-lemma-pos.source.json`, `Wikipedia-ja-20221020-310-nfkc.source.json`, `Jiten-2026-09-27.source.json` (snapshots in `Jiten-2026-09-27/`); `Public-Japanese-Frequency-Catalog-2026-09-25.source.json` is historical (removed in #376) | `import_frequency_pack.py`, `build_jiten_frequency_packs.py`, on-device `FrequencyPackInstaller`; `build_ranked_lists.py` for the website's dictionary service |
| Interactive Japanese parsing | `Kuromoji-0.1.2.source.json` | Bundled JavaScriptCore engine and compressed IPADIC resources |
| App-owned word relationships | `Zenbu-Word-Relationships-v1.json` | `import_jmdict.py` |

Required notices for bundled dependencies remain beside their source records
([EDRDG](EDRDG-ATTRIBUTION.md), [MeCab IPADIC](MECAB-IPADIC-NOTICE.md)) and in the app
resources. Frequency-pack manifests contain the runtime source URL,
attribution, checksums, mapping contract, and delivery behavior. Import reports
under `apps/ios/LanguageData/Generated/` connect pinned inputs to generated
artifact checksums and remain versioned with those artifacts.

Downloadable frequency packs are fetched by the app only when a learner chooses one;
their raw archives are not stored in this repository or shipped in the app bundle. See
[`FREQUENCY_SOURCE_DECISIONS.md`](../FREQUENCY_SOURCE_DECISIONS.md) for how the current
packs were selected and for the record of the removed public-catalog packs.
