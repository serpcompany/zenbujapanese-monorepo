# Radical Search journey evidence (v2)

The complete 27-test iOS UI suite passed on the iPhone 17 Pro Max iOS 26.0.1 simulator on 2026-08-10. These seven screenshots were exported from that passing result bundle and visually inspected at their original 1320×2868 resolution.

| Public state | Settled evidence |
|---|---|
| Unselected picker grouped by source stroke count; Search disabled | [D5AB8EB4-AEF3-4BDF-A7B1-AD9F4E107C03.png](D5AB8EB4-AEF3-4BDF-A7B1-AD9F4E107C03.png) |
| One selected component with the broad, scrollable candidate set | [BE02536A-8871-4B32-B5A3-D167F404A3D1.png](BE02536A-8871-4B32-B5A3-D167F404A3D1.png) |
| Second component narrows both candidates and available component groups | [1743DCEB-CDCF-4673-AA7F-6673ABB72AE4.png](1743DCEB-CDCF-4673-AA7F-6673ABB72AE4.png) |
| Choosing `薮` populates the query and enables Search | [77895FFB-B38F-4A9B-8E3C-CC54C0C5852A.png](77895FFB-B38F-4A9B-8E3C-CC54C0C5852A.png) |
| `薮` Search produces KANJI-primary rank 1 and its one exact dictionary row at rank 2 | [BE9FF2AC-4EAC-451F-B7BA-C5562ABFA61A.png](BE9FF2AC-4EAC-451F-B7BA-C5562ABFA61A.png) |
| Entering Radical mode with an existing query still requires an explicit candidate choice | [576D452B-C817-4F68-A2A8-CE7967D76F68.png](576D452B-C817-4F68-A2A8-CE7967D76F68.png) |
| Source-derived `丶` has no JMdict row but still produces KANJI-primary results and opens Kanji Detail | [955BA20E-5709-4271-8BD8-37735951ADD5.png](955BA20E-5709-4271-8BD8-37735951ADD5.png) |

The public tests additionally assert numeric candidate-set narrowing and broadening, selected/deselected accessibility state, the dedicated remove control, disabled Search before candidate choice, Handwriting/Keyboard returns, absence of Additional Matches for the sparse `薮` result, retained Additional Matches for ordinary and handwritten single-kanji Search, public Kanji-detail traversal, and durable newest-first history for both `薮` and a candidate without a dictionary row.

## Recorded differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: the available simulator is iOS 26.0.1; the fixed reference was captured on a physical iPhone 17 Pro Max running iOS 26.5.2.
- `ASSET-SUBSTITUTE-RADICAL-001`: Zenbu renders EDRDG component identities with platform text glyphs and two documented display aliases (`艾` → `艹`, `｜` → `丨`). It does not copy Nihongo's private radical-cell assets or claim exact glyph parity.
- `ORDERING-DECISION-RADICAL-001`: candidate order is app-owned and deterministic: fewest unselected source components first, then Unicode scalar order. The dossier explicitly does not require Nihongo's exact candidate ordering.
- `EVIDENCE-GAP-RADICAL-001`: the fixed evidence did not capture a zero-candidate state or controlled very-large-set ordering. Zenbu filters the component grid to choices that retain at least one candidate and uses lazy scrolling for large source-derived sets; no exact-reference claim is made for those uncaptured boundaries.
- `RECOVERY-RADICAL-POPULATED-001`: entering Radical mode with a preexisting Search query does not treat that text as a radical candidate. Search remains disabled until the user explicitly chooses a candidate.
- `FALLBACK-RADICAL-NO-DICTIONARY-001`: all 6,355 real KRADFILE candidates remain operable even when JMdict has no exact word row. A chosen single kanji still renders the app-owned KANJI-primary result, opens Kanji Detail, and enters recent history.
- `SOURCE-BOUNDARY-KANJIVG-001`: this journey consumes KRADFILE visible-component membership and RADKFILE stroke/inversion assertions. KanjiVG path and component-group assertions remain source-separated for the stroke-rendering journey; they are not silently merged into the picker ontology.

The source snapshot, HTTP metadata, checksums, exact inversion check, transform checksum, output checksum, attribution, and monthly update procedure are retained under `LanguageData`.
