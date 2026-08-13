# Language Reference Data source snapshots

## JMdict

`JMdict_e-2026-08-10.gz` is the pinned official English JMdict export downloaded directly from EDRDG. Its immutable HTTP metadata and checksum are in `JMdict_e-2026-08-10.source.json`.

The derived database is produced by `apps/ios/Tools/import_jmdict.py`. Zenbu retains JMdict `ent_seq` values as source record identifiers, normalizes written forms, readings, English glosses, part-of-speech labels, and priority markers into app-owned Language Reference Data, and records import counts plus both input and output checksums.

## KANJIDIC2

`KANJIDIC2-2026-08-10.xml.gz` is the pinned official EDRDG KANJIDIC2 export. Its immutable HTTP metadata, database version, and checksum are in `KANJIDIC2-2026-08-10.source.json`.

`apps/ios/Tools/import_kanjidic.py` normalizes the source into the app-owned `KanjiReferenceData.json` artifact. It retains the literal, classical radical number, accepted stroke counts, grade, frequency, JLPT classification, English meanings, Japanese on/kun readings, and nanori facts. It joins those facts to the separately normalized KRADFILE visible-component membership. Provider reading-status attributes, commercially restricted query-code fields, non-English meanings, non-Japanese readings, and dictionary-reference identifiers are deliberately excluded. The generated manifest records source, component-artifact, importer, shared-tooling, and output checksums plus retained/excluded fields and counts.

## UniDic

`unidic-cwj-3.1.0.zip` is the pinned official UniDic for Contemporary Written Japanese 3.1.0 archive from the National Institute for Japanese Language and Linguistics. Its immutable HTTP metadata and checksum are in `UniDic-CWJ-3.1.0.source.json`; the archive's New BSD terms are retained in `UNIDIC-NEW-BSD.txt`.

The JMdict importer joins UniDic accent type (`aType`) only on an exact normalized base form and either its pronunciation or lexical reading, then stores app-owned downstep and pronunciation-mora-count facts with source provenance. The lexical-reading fallback covers orthographic readings whose spoken form differs, such as `こんにちは` / `こんにちわ`. Entries without an exact source match retain no inferred pitch fact.

The full New BSD notice is also mirrored into the Swift package resources and exposed from Dictionary Sources so binary distributions reproduce the required copyright, conditions, and disclaimer.

## KanjiVG

`KanjiVG-2025-08-16.xml.gz` is the pinned official KanjiVG `r20250816` combined release by Ulrich Apel. Its release identity, published timestamp, copyright, required attribution, immutable GitHub release checksum, and license metadata are in `KanjiVG-2025-08-16.source.json`. The complete CC BY-SA 3.0 terms are retained in `KANJIVG-CC-BY-SA-3.0.txt`, mirrored into the Swift package resources, and exposed from Dictionary Sources.

`DaKanji-v1.2.source.json` records the offline handwriting model carried forward from the verified Nihongo clone prototype. The official DaKanji v1.2 SavedModel was converted to a 64 × 64 grayscale Core ML classifier with 6,507 Japanese character labels. Runtime code supplies only the normalized finished image, making recognition independent of stroke sequence. The MIT terms are mirrored as `DAKANJI-MIT.txt` and exposed from Dictionary Sources. Nihongo's private recognizer is not identified; DaKanji is an explicit licensed behavioral substitute, not a claim about Nihongo's internals.

`apps/ios/Tools/import_kanjivg.py` filters the release to Unicode ideographs and normalizes ordered relative/smooth SVG paths into absolute cubic geometry in the app-owned `zenbu.kanji-stroke-diagrams.v1` SQLite schema. Product Experience code receives typed `KanjiStrokeDiagram` values through the focused `KanjiStrokeOrderClient`; it never consumes KanjiVG XML or SVG commands. Component grouping, element labels, stroke labels, radical annotations, and variant SVG files remain excluded so this source is not silently merged with the separately normalized KRADFILE/RADKFILE component ontology.

The generated SQLite diagram adaptation is distributed under CC BY-SA 3.0. Dictionary Sources identifies KanjiVG, links its project and license, identifies Zenbu's modifications, and exposes the full retained terms.

## Kanjium

`Kanjium-8a0cdaa.sqlite` is the pinned Kanjium database at commit `8a0cdaa16d64a281a2048de2eee2ec5e3a440fa6`. Its immutable download, commit metadata, checksum, attribution, and license record are retained in `Kanjium-8a0cdaa.source.json`; the complete CC BY-SA 4.0 terms are retained in `KANJIUM-CC-BY-SA-4.0.txt`. Kanjium additions and modifications are attributed to Uros O., and EDRDG-derived fields retain EDRDG attribution.

`apps/ios/Tools/import_kanji_elements.py` combines Kanjium structural membership and variants with the separately normalized KANJIDIC2 meaning and on-reading summaries. It rejects a secondary Kanji Reference artifact whose checksum does not match its pinned import manifest, retains the Kanjium and KANJIDIC2 identities/snapshots as separate provenance, removes transitive leaf descendants to produce app-owned top-level elements, preserves explicit source phonetic annotations, and derives a reading-pattern role only from shared normalized on-readings. The resulting `zenbu.kanji-elements.v1` JSON is consumed through `KanjiElementLookupClient`; Product Experience code never reads Kanjium tables. Kanjium lexical, pitch-accent, provider-encoded lookup, mnemonic, and proprietary-etymology fields are excluded.

Dictionary Sources identifies the source, attribution, modifications, snapshot, and license. The scheduled update check verifies both the pinned database bytes and the latest upstream commit before a source promotion.

## Tatoeba

The three `*-2026-08-08.tsv.bz2` files are pinned official Tatoeba weekly exports for Japanese sentences, English sentences, and their translation links. Immutable HTTP metadata and checksums are in `Tatoeba-2026-08-08.source.json`. The importer retains one deterministic English translation for each linked Japanese sentence as app-owned offline example data, while preserving the Japanese sentence ID for attribution.

Tatoeba publishes these exports under CC BY 2.0 FR. The app links to the project and license from Dictionary Sources; provider record IDs remain retained provenance and are not rendered in learner-facing example rows.

## App-owned word relationships

`Zenbu-Word-Relationships-v1.json` contains versioned, human-reviewed lexical relationships. The importer resolves these explicit facts and authoritative JMdict cross-references; it does not generate relationships from spelling, kanji, reading distance, or part-of-speech similarity.

JMdict assembly, UniDic adaptation, and Tatoeba adaptation are independently implemented in `import_jmdict.py`, `unidic_adapter.py`, and `tatoeba_adapter.py`. Their checksums are recorded in the import manifest. Entry identity is a stable app-owned 128-bit SHA-256-derived identifier from immutable source provenance, so snapshot row ordering cannot change entry identity.

Durable notes use the separately app-owned `WordNoteID`: a versioned hash of the normalized app-owned lexical signature (display form, reading, written/reading forms, senses, and classification), intentionally independent of provider identity and record IDs. Exact duplicate signatures receive deterministic disambiguators and a database uniqueness constraint, so unrelated homographs never share notes. A source promotion must emit and review an explicit old-key-to-new-key identity map before changing any canonical signature or duplicate assignment; the storage namespace is bumped only with that migration. Provider coordinates remain provenance and are never the durable note key. The pre-release v1-v3 verification namespaces were never promoted to production data and are intentionally not migrated into the v4 multi-note store.

## KRADFILE / RADKFILE

`kradfile-2026-08-10.gz` and `radkfile-2026-08-10.gz` are pinned official EDRDG exports. Their immutable HTTP metadata and checksums are recorded together in `EDRDG-radicals-2026-08-10.source.json`.

`apps/ios/Tools/import_radicals.py` treats KRADFILE visible-component membership as canonical, imports RADKFILE stroke counts, and rejects the snapshot unless RADKFILE is an exact inversion of KRADFILE. The resulting app-owned artifact retains 6,355 kanji, 253 picker components, and 25,699 memberships without exposing either provider file format to Product Experience code.

The scheduled `.github/workflows/jmdict-upstream-check.yml` check downloads all pinned exports monthly and fails when a checksum or latest tracked snapshot differs. Promote a changed snapshot only after regenerating the affected artifact, reviewing its recorded counts and checksum, and passing the complete Lookup test suite.
