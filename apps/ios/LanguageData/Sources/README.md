# Language data sources

This directory contains the pinned source records, licenses, notices, and local
inputs used to build Zenbu Japanese's bundled language data.

The `*.source.json` files are the source of truth for upstream identity,
snapshot, download location, checksum, and import configuration. The importers under
`apps/ios/Tools/` define the transformations. Generated runtime artifacts live
under `apps/ios/Modules/Sources/SearchExperience/Resources/`.

| Data | Source record | Importer |
| --- | --- | --- |
| Dictionary entries and examples | `JMdict_e-2026-08-10.source.json`, `UniDic-CWJ-3.1.0.source.json`, `Tatoeba-2026-08-08.source.json` | `import_jmdict.py` |
| Kanji reference data | `KANJIDIC2-2026-08-10.source.json` | `import_kanjidic.py` |
| Radicals and components | `EDRDG-radicals-2026-08-10.source.json` | `import_radicals.py` |
| Kanji elements | `Kanjium-8a0cdaa.source.json` | `import_kanji_elements.py` |
| Stroke diagrams | `KanjiVG-2025-08-16.source.json` | `import_kanjivg.py` |
| Handwriting recognition | `DaKanji-v1.2.source.json` | Bundled Core ML model |
| Frequency data | `TUBELEX-ja-310-lemma-pos.source.json`, `Wikipedia-ja-20221020-310-nfkc.source.json`, `Public-Japanese-Frequency-Catalog-2026-09-25.source.json` | `import_frequency_pack.py`, `analyze_ordered_json_frequency_lists.py`, on-device `FrequencyPackInstaller` |
| Interactive Japanese parsing | `Kuromoji-0.1.2.source.json` | Bundled JavaScriptCore engine and compressed IPADIC resources |
| App-owned word relationships | `Zenbu-Word-Relationships-v1.json` | `import_jmdict.py` |

Full third-party terms and required notices are retained beside the source
records and mirrored into the app resources when binary distribution requires
them. Import reports under `apps/ios/LanguageData/Generated/` connect pinned
inputs to generated artifact checksums and must remain versioned with those
artifacts.

The public-catalog ordered JSON packs have an authoritative source record in this
directory plus their pinned catalog snapshot and analysis under `LanguageData/Candidates`
and `LanguageData/Generated`. Raw archives are downloaded by the app only when a user
chooses a pack and are not stored in this repository or shipped in the app bundle.
See
[`FREQUENCY_SOURCE_DECISIONS.md`](../FREQUENCY_SOURCE_DECISIONS.md) for the
runtime selection and reproducible analysis of the ten ordered-JSON packs.
