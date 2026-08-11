# Complete Search and dictionary replica acceptance

Issue #109 is accepted against the exact 14 blocking journeys in `docs/clone-discovery/nihongo/scope.json`.

The definitive public iOS UI suite passed on iPhone 17 Pro Max / iOS 26.0.1: **55 passed, 0 failed, 0 skipped** in 1,174.489 seconds. Result bundle:

`/Users/devin/Library/Developer/XcodeBuildMCP/workspaces/zenbujapanese-monorepo-6e979e01018b/result-bundles/test_sim_2026-08-11T06-06-36-170Z_pid40723_3ec51ab3.xcresult`

The two whole-product tab states were recaptured by a passing 1/1 focused run after moving only the boundary screenshot to occur before alert dismissal; product behavior and product code are identical to the 55/55 bundle. Focused result bundle:

`/Users/devin/Library/Developer/XcodeBuildMCP/workspaces/zenbujapanese-monorepo-6e979e01018b/result-bundles/test_sim_2026-08-11T06-27-54-798Z_pid40723_29de0b05.xcresult`

Both retained PNGs are distinct, non-failure 1320×2868 attachments with complete status, toolbar, content, and tab chrome. `manifest.json` retains their public test identity, device, timestamps, names, and SHA-256 hashes.

## Journey closure matrix

| Blocking journey | Accepted evidence | Public coverage |
| --- | --- | --- |
| JOURNEY-SEARCH-TEXT | [Search Text](../JOURNEY-SEARCH-TEXT-v3/README.md) | Japanese/English/live/blank/failure/retry/result navigation |
| JOURNEY-SEARCH-ROMAJI-REFINEMENT | [Romaji refinement](../JOURNEY-SEARCH-ROMAJI-REFINEMENT/README.md) | literal ranking, captured refinement, direct and uncaptured classes |
| JOURNEY-RERUN-RECENT-SEARCH | [Recent Search](../JOURNEY-RERUN-RECENT-SEARCH/README.md) | create, rerun, delete, clear confirmation, relaunch |
| JOURNEY-SEARCH-HANDWRITING | [Handwriting](../JOURNEY-SEARCH-HANDWRITING-v2/README.md) | recognition, candidates, composition, erase/recovery, history |
| JOURNEY-SEARCH-RADICAL | [Radical Search](../JOURNEY-SEARCH-RADICAL-v2/README.md) | grouped grid, narrowing, candidate submission, sparse real data |
| JOURNEY-INSPECT-WORD | [Word Detail](../JOURNEY-INSPECT-WORD-v5/README.md) | source-backed facts, relationships, kanji, examples, note isolation |
| JOURNEY-READ-EXAMPLES | [Example Sentences](../JOURNEY-READ-EXAMPLES-v2/README.md) | list, speech, Japanese Text Analysis links, nested returns |
| JOURNEY-HEAR-PRONUNCIATION | [Pronunciation](../JOURNEY-HEAR-PRONUNCIATION-v2/README.md) | fresh correlated Japanese speech lifecycle at all three levels |
| JOURNEY-INSPECT-CONJUGATIONS | [Conjugations](../JOURNEY-INSPECT-CONJUGATIONS/README.md) | captured verb/adjective classes, modes, furigana, Back |
| JOURNEY-EDIT-NOTE | [Word notes](../JOURNEY-EDIT-NOTE/README.md) | add/edit/delete/multiple/autosave/navigation/cold relaunch |
| JOURNEY-INSPECT-KANJI | [Kanji Detail](../JOURNEY-INSPECT-KANJI/README.md) | metadata, readings, components, words, Retry, viewport returns |
| JOURNEY-PLAY-STROKE-ORDER | [Stroke order](../JOURNEY-PLAY-STROKE-ORDER/README.md) | manual animation, playback, pause/resume/replay, Retry, transience |
| JOURNEY-INSPECT-KANJI-ELEMENT | [Kanji elements](../JOURNEY-INSPECT-KANJI-ELEMENT/README.md) | structure, variants, roles, navigation restoration, Retry |
| JOURNEY-IMAGE-FILES | [Image Files](../JOURNEY-IMAGE-FILES/README.md) | real Files selection, OCR, links, translation, sharing, recovery |

The suite also proves ordinary `日本` and English `think` requests use the bundled app-owned Language Reference Data rather than fixture-only lookup results. Every in-scope visible control is public and operable. Search returns from nested navigation; Clippings, Flashcards, and Settings remain excluded destinations and now respond with an explicit scope-boundary alert instead of dead controls.

## Exception and provenance audit

- `ENVIRONMENT-DIFFERENCE-001`: acceptance used iOS 26.0.1 Simulator; the reference authority used physical iPhone 17 Pro Max / iOS 26.5.2.
- Zenbu-owned color, typography, layout, accessibility semantics, SF Symbols, deterministic language ordering, renderer timing, platform keyboard/speech/Vision, and Natural Translation follow the allowed-variance list in `scope.json`; individual journey records name each applied variance.
- Camera and Photo Library mechanics, share-sheet contents beyond app-owned actions, external destination contents, alternate environments, and deferred kanji etymology/Origin content remain excluded. Etymology remains tracked by issue #91.
- The three excluded tabs do not implement excluded product destinations; their public alerts state the boundary. Files-based Image Text remains fully operable.
- Both SQLite artifacts pass `PRAGMA integrity_check`. All 218,382 dictionary entries have unique durable note identities.
- Runtime artifact SHA-256 values match their generated manifests: Language Reference Data `b3a7f496…3f96`, radicals `f7c9eed0…2a3c`, Kanji Reference `425d4471…6845`, stroke data `1b9bcd25…6f76`, and kanji elements `ec160ef2…a423`.
- All five generated manifests record the current shared language-data helper SHA-256 `7a348e2a…faf0`. The Language Reference database byte change from its earlier evidence record is limited to this embedded provenance value; entries, forms, and example-sentence rows are unchanged.

## Final engineering gates

- Independent Spec review: clean after the tab-control repair; no remaining code or journey defect.
- Independent Standards review: clean; no remaining documented-standard violation or high-value smell.
- Release iOS Simulator build: passed. Build log: `/Users/devin/Library/Developer/XcodeBuildMCP/workspaces/zenbujapanese-monorepo-6e979e01018b/logs/build_sim_2026-08-11T06-29-08-836Z_pid40723_ccc3c978.log`.
- Release product audit: no DEBUG injection/reset arguments or dossier fixture PNGs; file sharing and opening documents in place are not enabled; bundled Language Reference Data hash matches the final manifest.

No unresolved in-scope replica defect, dead control, state-loss regression, fixture-only production gate, or exception-matrix mismatch remains.
