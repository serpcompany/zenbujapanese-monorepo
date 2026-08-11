# Inspect a kanji entry and linked words evidence

Two public UI tests exercise the fixed `静か → 静` journey through Search, Word Detail, Kanji Detail, scrolling, linked-word navigation, and both Back edges. The first test verifies the source-backed glyph, 14 strokes, Grade 4, JLPT N2, `quiet` meaning, on/kun readings, and restoration to the originating `静か` Word Detail. The second verifies the visible-component set, scrolls the real JMdict-backed word list, opens `静寂`, and returns to the same Kanji Detail list position.

The manifest retains five unique, non-failure 1320 × 2868 screenshots on iPhone 17 Pro Max / iOS 26.0.1:

- `7522DACE-55A4-4AE1-8785-E412267452E4.png`: source-backed `静` overview, readings, elements, and leading word rows.
- `C8C0540E-54E7-4EEF-B0B3-1FF75A4449D3.png`: Kanji Back restores the originating `静か` Word Detail position.
- `838DF519-0F33-46FA-B48A-73DF3897CF12.png`: scrolled, real Language Reference Data word rows with `静寂` operable.
- `5FE16ACA-7078-4C5B-9B35-DBD870CD7131.png`: canonical `静寂` Word Detail destination with settled status/navigation chrome.
- `89B838DA-7AA4-41AD-9768-63BA158F275E.png`: Word Back restores `静寂` to the same hittable word-list viewport.

The complete iOS UI suite passed on that simulator: 42 passed, 0 failed, 0 skipped. Four screenshots were exported from that exact final passing result bundle. The `静寂` destination was recaptured afterward through the same focused public test using a warm-up snapshot because the complete-suite attachment caught incomplete Simulator chrome; that focused two-test run passed 2/2 and the retained replacement has complete status/navigation chrome. A Release simulator build also passed.

## Source and transform

The offline app-owned Kanji Reference artifact normalizes the pinned official EDRDG KANJIDIC2 snapshot dated 2026-08-10 and joins it to the separately normalized KRADFILE visible-component artifact. The generated manifest records 13,108 kanji entries, 10,384 with English meanings, 12,357 with Japanese readings, and 6,355 with visible components. Its SHA-256 is `425d44716b5429a423d97f0e70ff7bf8f7465c65fa5ebdd58c28020155816845`. Dictionary Sources exposes KANJIDIC2 attribution, snapshot, project documentation, and CC BY-SA 4.0 license terms.

## Named differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification used the available iPhone 17 Pro Max iOS 26.0.1 Simulator; the fixed reference authority used physical iPhone 17 Pro Max on iOS 26.5.2.
- `SOURCE-DIFFERENCE-KANJI-001`: Zenbu uses the pinned, attributed KANJIDIC2/KRADFILE/JMdict snapshots and app-owned deterministic ordering. Nihongo's private snapshot, selection, and ordering are unavailable and are not inferred.
- `COMPONENT-ONTOLOGY-DIFFERENCE-001`: Zenbu renders exact KRADFILE visible-component membership. The reference's private meaning/sound element-card ontology and ordering are unavailable, so no semantic-equivalence claim is made for those cards.
- `ORIGIN-ETYMOLOGY-EXCLUSION-001`: origin, history, and etymology content was excluded by issue #91 and is not synthesized.
- `JOURNEY-OWNERSHIP-STROKE-ORDER-001`: stroke-order playback and transport controls remain owned by issue #106.
- `JOURNEY-OWNERSHIP-ELEMENT-DETAIL-001`: element-detail destinations were completed by issue #107 and are verified in the separate `JOURNEY-INSPECT-KANJI-ELEMENT` evidence record; this issue's retained states establish only the issue #105 Kanji Detail entry seam.
- `UNCAPTURED-KANJI-METADATA-001`: missing grade/JLPT/meaning/reading/component combinations remain outside the captured denominator. Unsupported fields and empty sections are omitted rather than invented.
- `UNCAPTURED-KANJI-LINK-CYCLE-001`: deep word/kanji navigation cycles beyond the two captured Back edges remain unclaimed.
- `ASSET-SUBSTITUTE-001`: navigation and tab glyphs use SF Symbols under the dossier's approved asset variance.

This journey produces no durable product output. Kanji metadata and linked-word results are loaded from bundled offline Language Reference Data; explicit load failure is distinct from missing optional metadata and exposes Retry.
