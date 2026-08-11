# Inspect Word journey evidence v5

Exported from the final passing `ZenbuJapaneseUITests` result bundle after qualified-reference, direct-ID navigation, and homograph-isolation review. The complete suite passed 31 tests with 0 failures and 0 skips in 416.8 seconds on iPhone 17 Pro Max / iOS 26.0.1. `manifest.json` retains five public test identifiers and all 13 original 1320×2868 attachments.

| Public state | Settled evidence |
|---|---|
| Common word reading, frequency, pitch, pronunciation, class, and senses | [DE52848C-436C-45D7-8970-4362ACDF36F9.png](DE52848C-436C-45D7-8970-4362ACDF36F9.png) |
| Alternatives, canonical related words, notes, and source examples | [DD9FFC48-73BA-4849-98E1-C2078DCBADB3.png](DD9FFC48-73BA-4849-98E1-C2078DCBADB3.png) |
| Exact-ID related `見える` destination | [61A999F2-6019-4DC4-BB32-AEDE54BB8D77.png](61A999F2-6019-4DC4-BB32-AEDE54BB8D77.png) |
| `問題` primary `問` and `題` Kanji rows | [2DAF2DB9-E717-455D-AC52-A5DD274DEA62.png](2DAF2DB9-E717-455D-AC52-A5DD274DEA62.png) |
| Populated note editor and restored durable note | [6486FAF8-B954-47D4-9575-D89745E382B5.png](6486FAF8-B954-47D4-9575-D89745E382B5.png), [E401BC77-B9CF-474C-B5F5-AA117EB6816C.png](E401BC77-B9CF-474C-B5F5-AA117EB6816C.png) |
| Same-spelling Moor entry has no shopping-mall note or ambiguous examples | [EE1EFC11-1883-440B-A2AD-3247874D3385.png](EE1EFC11-1883-440B-A2AD-3247874D3385.png) |
| Current-source multiple-reading and unmarked classes | [6CFE4225-B4F6-47D4-BC16-EEFC48F24AFC.png](6CFE4225-B4F6-47D4-BC16-EEFC48F24AFC.png), [29CC53CD-DA85-45AD-B5D3-F8D3E0857F9D.png](29CC53CD-DA85-45AD-B5D3-F8D3E0857F9D.png) |
| Alternative `居` Kanji destination | [CF02F1C2-DB7A-4602-B1A4-2C6C75D76301.png](CF02F1C2-DB7A-4602-B1A4-2C6C75D76301.png) |
| JMdict/KRADFILE and UniDic/Tatoeba attribution | [C8AF9D9A-3FC6-43E1-8F30-2E97A25A61CE.png](C8AF9D9A-3FC6-43E1-8F30-2E97A25A61CE.png), [9F983E8A-CF0F-442A-ADA5-2A08F8C2D7FA.png](9F983E8A-CF0F-442A-ADA5-2A08F8C2D7FA.png) |
| Full bundled UniDic New BSD notice | [8CC50158-07D8-4F9C-9ABE-52322F8F8CC4.png](8CC50158-07D8-4F9C-9ABE-52322F8F8CC4.png) |

## Source and artifact verification

- JMdict retains 218,382 entries, 752,077 forms, and 36,668 authoritative qualified cross-references or versioned human-reviewed directions. No spelling/POS/edit-distance relationship is generated.
- Cross-reference form, optional reading, optional target sense, raw value, and resolved target ID are retained. Supplied readings require an exact target reading, and navigation resolves directly by stable ID without ranked-search fallback.
- All 218,382 entries have distinct `WordNoteID` values from an app-owned semantic lexical signature. Three exact-signature groups (six entries) receive deterministic disambiguators under a database uniqueness constraint; source promotion requires a reviewed identity-migration map.
- Ambiguous form-only Tatoeba matches are omitted for same-headword/same-reading homographs instead of assigning another entry's usage. Unambiguous matches retain source IDs.
- UniDic produces 59,357 exact pitch facts and Tatoeba retains 232,703 offline pairs. The final database is 285,290,496 bytes with SHA-256 `b3a7f4964f9f924700fa669d7a7e43ca983f1a7eb1616dbac37927f1336a3f96`; every recorded source/tool/adapter/artifact hash matches. The byte change from the earlier retained evidence is limited to the embedded shared-tooling provenance hash; all entry, form, and sentence rows are unchanged.
- Source and bundled UniDic notices both hash to `770a75de30705439084f869dbcb0bc4ebcffcb7c7124c0d74f5083170318a9bb` and the complete notice is publicly reachable.

## Recorded differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: simulator iOS 26.0.1 versus physical iOS 26.5.2 reference.
- `SOURCE-SNAPSHOT-DIFFERENCE-WORD-001`: current JMdict marks `蝶々` common; source-derived `茨` proves the unmarked layout.
- `SOURCE-SNAPSHOT-DIFFERENCE-WORD-002`: public pinned snapshots replace Nihongo's unavailable private data.
- `AUDIO-SUBSTITUTE-WORD-001`: pronunciation uses approved offline Japanese Speech Synthesis.
- `EVIDENCE-GAP-WORD-001`: uncaptured missing-field and injected offline presentation remain unclaimed.
- `FOLLOWUP-BOUNDARY-WORD-001`: richer examples, conjugations, full note lifecycle, and rich Kanji metadata remain separately owned.
