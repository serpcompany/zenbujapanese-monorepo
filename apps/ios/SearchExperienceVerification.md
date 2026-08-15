# Search experience verification

> **Reference reset:** The fixed screenshots below are genuine Nihongo 1.34.3
> evidence, but current-version parity is provisional pending the bounded
> Nihongo 1.34.4 replay in #168. See the canonical
> [reference-authority boundary](../../docs/clone-discovery/nihongo/REFERENCE-AUTHORITY.md).
> Do not use this record alone to merge or close current parity work.

The durable user-facing regression checklist is maintained in
[`Verification/PHYSICAL-DEVICE-QA/README.md`](Verification/PHYSICAL-DEVICE-QA/README.md).
It maps each physical-device complaint to its exact automated public seam and
the remaining manual TestFlight check.

## Public journey seam

`SearchExperienceJourneyUITests.testJapaneseQueryOpensWordDetailAndBackPreservesResults`
launches into Search, enters the synthetic Japanese query `問題`, observes the Best Matches hierarchy, opens the primary Word Detail destination, navigates back, and verifies that the query and result state remain visible.

The independent reference evidence is:

- `docs/clone-discovery/nihongo/evidence/reference/screenshots/search-inventory/search-root-empty.png`
- `docs/clone-discovery/nihongo/evidence/reference/screenshots/search-inventory/fixture-rich-mondai-refined.png`
- `docs/clone-discovery/nihongo/evidence/reference/screenshots/search-inventory/edge-results-to-word-detail-mondai-settled.png`
- `docs/clone-discovery/nihongo/evidence/reference/screenshots/word-inventory/state-word-detail-mondai-top.png`

## Verification status

- Compile-time verification: passed for the app and UI-test products with Xcode 26.0.
- Runtime journey verification: passed on the iPhone 17 Pro Max iOS 26.0.1 simulator.
- Visual comparison: passed for Search results, Word Detail, and the returned-results state against the fixed screenshots. The UI test retains an XCTest screenshot at each checkpoint.
- Automated result: 55 passed, 0 failed, 0 skipped.

## Named gaps and differences

- `ENVIRONMENT-DIFFERENCE-001`: The available simulator runtime is iOS 26.0.1; the fixed reference authority is physical iPhone 17 Pro Max on iOS 26.5.2. Any observable difference must be classified before acceptance.
- `ASSET-SUBSTITUTE-001`: Toolbar, tab, search, badge, and pitch-display glyphs use SF Symbols and SwiftUI drawing. They are clean-room substitutes under the dossier's approved icon/asset variance, not copied Nihongo assets.

No unresolved parity defect or exact-fidelity blocker remains for this bounded journey.

## App-owned Language Reference Data Search

The canned `問題` query gate has been replaced by an offline Lookup client backed by the pinned official JMdict English export and a normalized app-owned SQLite artifact. The import retains all 218,382 source entries and 752,077 normalized written, reading, and romaji forms. Every output row retains its JMdict `ent_seq` as `edrdg.jmdict` provenance; source HTTP metadata, SHA-256, DTD revision, transform/tool checksum, row counts, database checksum, attribution, and monthly-update procedure are recorded under `LanguageData`.

Public Simulator verification now covers:

- ranked English `think` results and partial English `tab` results;
- Japanese `問題` and ordinary `日本` search;
- exact-query removal through real JMdict-backed navigation;
- live Best/Additional Matches, blank no-match, trailing-whitespace normalization, Cancel with retained results, and Search → Word Detail → back state preservation;
- deterministic app-owned romaji search, including `taberu` → `食べる`;
- deinflection and mixed-script Discovered Words presentation;
- an injected app-owned data failure followed by successful public Retry recovery;
- reachable JMdict/EDRDG attribution and license links.

The current full iOS UI suite passed on the iPhone 17 Pro Max iOS 26.0.1 simulator: 55 passed, 0 failed, 0 skipped. The [whole-product acceptance record](Verification/WHOLE-PRODUCT-ACCEPTANCE/README.md), retained [Search-text evidence index](Verification/JOURNEY-SEARCH-TEXT-v3/README.md), [romaji-refinement evidence index](Verification/JOURNEY-SEARCH-ROMAJI-REFINEMENT/README.md), [recent-Search evidence index](Verification/JOURNEY-RERUN-RECENT-SEARCH/README.md), [handwriting-Search evidence index](Verification/JOURNEY-SEARCH-HANDWRITING-v2/README.md), [radical-Search evidence index](Verification/JOURNEY-SEARCH-RADICAL-v2/README.md), [Word Detail evidence index](Verification/JOURNEY-INSPECT-WORD-v5/README.md), [Example Sentences evidence index](Verification/JOURNEY-READ-EXAMPLES-v2/README.md), [pronunciation evidence index](Verification/JOURNEY-HEAR-PRONUNCIATION-v2/README.md), [conjugation evidence index](Verification/JOURNEY-INSPECT-CONJUGATIONS/README.md), [word-note evidence index](Verification/JOURNEY-EDIT-NOTE/README.md), [Kanji Detail evidence index](Verification/JOURNEY-INSPECT-KANJI/README.md), [stroke-order evidence index](Verification/JOURNEY-PLAY-STROKE-ORDER/README.md), [Kanji element evidence index](Verification/JOURNEY-INSPECT-KANJI-ELEMENT/README.md), [Image Text evidence index](Verification/JOURNEY-IMAGE-FILES/README.md), and machine-readable attachment manifests cover the accepted public states. A final Release simulator build also passed.

## App-owned Image Text Flow

Search now starts a transient Image Text session from one or more real Files selections. The flow performs bounded, cancellable Apple Vision recognition; overlays selectable Japanese regions across horizontal, noisy, sparse, and vertical layouts; opens canonical gloss and Word Detail destinations with Photo attachment context; copies raw recognized lines; shares the selected image; and returns or closes through public controls. Empty OCR is page-local, while recognized Japanese without a dictionary match remains honestly recognized rather than becoming a false no-text alert.

Natural Translation is an explicit shared-capability action available only after source text loads. Settled translations survive nested Word Detail navigation within the active session, while page changes, Close, and relaunch clear transient state. The [Image Text evidence record](Verification/JOURNEY-IMAGE-FILES/README.md) retains eight final states from the exact 54/54 passing bundle plus a complete-chrome translation state from the immediately preceding 2/2 focused run of the same final product code, and names the Vision, translation, serialization, environment, privacy, asset, source-exclusion, failure, and share-sheet boundaries.

## App-owned Kanji Reference Data

Selecting the linked `静` row from `静か` now opens an offline Kanji Detail surface with source-backed stroke, grade, JLPT, meaning, Japanese reading, and visible-component facts. Real JMdict-backed word rows navigate to canonical Word Detail entries, and both Back edges restore their originating position. Unsupported optional metadata is omitted; load failure is presented separately with Retry.

The focused capability consumes a normalized KANJIDIC2/KRADFILE artifact rather than provider schema. The [Kanji Detail evidence record](Verification/JOURNEY-INSPECT-KANJI/README.md) retains five settled public states, source counts/checksum, approved source/component/environment differences, and the separately owned element-detail, origin/etymology, missing-metadata, and deep-cycle boundaries. Stroke order is implemented and verified below.

## App-owned kanji elements

Every normalized top-level element on Kanji Detail is operable. Element Detail renders app-owned structure, linked on-reading patterns, alternative forms, a standalone-kanji route, and source-backed containing-kanji roles; linked destinations and every nested Back edge preserve the surrounding viewport. Load failure is explicit and public Retry recovers through the live bundled capability.

The deterministic Kanjium adaptation contains 1,698 elements, 6,656 kanji with elements, 14,874 relationships, and 1,238 alternative relationships. The [Kanji element evidence record](Verification/JOURNEY-INSPECT-KANJI-ELEMENT/README.md) retains three settled states from the exact 49/49 passing bundle plus two settled states from the immediately preceding 3/3 run of the same final code, records source/artifact checksums and attribution, and names the open-source phonetic-model, environment, recovery, ordering, and later Kanji-note boundaries.

## App-owned kanji stroke order

Kanji Detail now loads ordered stroke diagrams from a pinned KanjiVG adaptation behind the focused `KanjiStrokeOrderClient`. The public modal draws each stroke on a grid and exposes manual Previous/Next animation, play, pause with retained progress, resume, terminal replay, and Close. Modal progress is ephemeral, and cold relaunch returns to the empty Search root.

The normalized artifact contains 6,430 ideograph diagrams and 79,180 ordered strokes. The [stroke-order evidence record](Verification/JOURNEY-PLAY-STROKE-ORDER/README.md) retains seven settled initial, paused, terminal, one-stroke, cold-relaunch, load-failure, and recovered states; records the source/artifact checksums and Ulrich Apel attribution; and names the six-versus-eight `争` source difference, renderer/environment variations, platform clipboard boundary, app-owned load recovery, and uncaptured rapid-input/background-interruption behavior.

## App-owned word notes

Word Detail now provides the dossier-captured inline Add Note editor, populated additional-note row, Done behavior, editable saved rows, deletion by clearing text, and populated Back auto-save. Ordered notes persist through navigation, immediate Done then Back, process termination, and cold relaunch while remaining isolated by each entry's unique app-owned `WordNoteID`.

The v4 note store normalizes empty/whitespace-only rows, serializes every full-array save, and makes Back await the newest scheduled write. The [word-note evidence record](Verification/JOURNEY-EDIT-NOTE/README.md) retains seven settled lifecycle states from the exact 40/40 passing bundle and names the platform-keyboard exclusion, private-storage/whitespace differences, and uncaptured validation/failure boundaries.

## App-owned Japanese conjugations

Word Detail now exposes View Conjugations for the dossier-captured Ichidan,
Godan, `する`, `来る`, i-adjective, and na-adjective representatives. Verb
destinations expose all eleven captured forms under operable Plain and Polite
controls; adjective destinations expose their captured form lists without verb
mode controls. Kanji-bearing forms render readings as furigana, and Back returns
to the originating Word Detail.

The focused capability selects independently authored typed rules from normalized
app-owned word classes and lexical forms. The [conjugation evidence record](Verification/JOURNEY-INSPECT-CONJUGATIONS/README.md)
retains eight settled screenshots from the exact 38/38 passing result bundle and
names the private-algorithm provenance gap, environment/asset differences, and
the uncaptured morphology boundary.

## Source-backed romaji refinement

An exact romaji form in Language Reference Data now offers its Dictionary-Ranked Japanese reading without a query-specific reading list. Literal Latin-script results remain visible until the learner selects the option; selection normalizes the public query and reranks it as Japanese. Public tests cover `iru` → `いる` and `sushi` → `すし` beyond the original `mondai` → `もんだい` and `nihon` → `にほん` captures. Exact `taberu` also offers `たべる` without losing its Example Sentences action, while inflected `tabeta` and `makasete` continue through deinflection.

The public tests assert the option, normalized query, Japanese result, section-aware rankings, and preserved downstream actions rather than merely checking that rows exist. The [journey evidence record](Verification/JOURNEY-SEARCH-ROMAJI-REFINEMENT/README.md) names the simulator/reference difference and approved asset substitution. The separately owned Example Sentences control is operable and verified below.

## App-owned Example Sentences

Search now counts source-backed matches and opens a dedicated scrollable Example Sentences destination. The `いる` public seam renders retained Tatoeba Japanese/English pairs, exact query links, canonical linked language items with ruby readings, source provenance, and one speech control per row. The fixed public chain selects `蝶々`, follows its Word Detail examples, and resolves inflected `見て` to canonical `見る`; nested return transitions preserve the surrounding journey. The `hello-world` seam proves punctuation-normalized, example-only results and traversal from `世界` to canonical Word Detail without inventing dictionary matches.

The [journey evidence record](Verification/JOURNEY-READ-EXAMPLES-v2/README.md) retains six populated, scrolled, nested, and example-only states. A DEBUG-only composition-root recorder verifies the exact Japanese speech requests while production continues to use offline system synthesis. The record also names the deterministic Tatoeba selection difference, synthesized-speech substitution, unified link color, and the uncaptured no-example, pagination, and speech-failure boundaries.

The historical fixed reference is Nihongo 1.34.3 (9792) on physical iPhone 17 Pro Max iOS 26.5.2. It remains the authority only for the captures already made; #168 owns current Nihongo 1.34.4 revalidation. `ENVIRONMENT-DIFFERENCE-001` remains the named environment difference for the historical run. Search result ordering and content are derived from Zenbu's pinned official JMdict snapshot and documented ranking transform rather than Nihongo's unavailable private snapshot or proprietary ranking.

## App-owned Japanese pronunciation

Word Detail headwords, Word Detail inline examples, and dedicated Example Sentences rows now invoke Apple's offline platform Speech Synthesis with a Japanese voice. A typed DEBUG-only lifecycle seam correlates each public tap to a fresh invocation and verifies the exact payload, actual Japanese (`ja*`) voice language, and matching start/finish callbacks without adding visible or durable playback state.

The [journey evidence record](Verification/JOURNEY-HEAR-PRONUNCIATION-v2/README.md) retains the settled public speaker surfaces and names the platform-audio substitution, acoustic-observability limit, simulator difference, and uncaptured interruption/route/failure boundaries.

## App-owned recent Search history

Submitting or selecting a normalized Search query now records it in a bounded, deduplicated device-local history. Focusing an empty Search field presents newest-first rows; choosing a row restores the query and the same representative ordered result set. Standard per-row swipe deletion removes only that query and survives relaunch, while Clear All requires destructive confirmation. Cancel returns to the unfocused Search root.

The [journey evidence record](Verification/JOURNEY-RERUN-RECENT-SEARCH/README.md) retains only reset, session-created synthetic history and records the reference persistence evidence gap, approved per-row deletion decision, and destructive-reference boundary. No claim is made about Nihongo's uncaptured storage location, cold-relaunch persistence, exact swipe mechanics, or destructive Clear All outcome.

## App-owned handwriting Search

Search now exposes a user-operable handwriting canvas with live offline recognition, ranked candidate selection, multi-character composition, pending-character submission, erase/recovery, Search, and durable recent-history output. Exact single-kanji input adds the observed KANJI-primary result row and traverses to Kanji detail.

Production recognition rasterizes only the completed drawing and classifies that image with the bundled DaKanji Single Kanji Recognition v1.2 model converted to Core ML. Stroke order, stroke direction, and gesture count are not classifier inputs. The exact private Nihongo recognizer remains undisclosed; this is the documented MIT-licensed substitute matching Nihongo's observed rough-shape lookup behavior.

The public tests exercise handwritten `日本`, single `丁`, `丁` plus pending `一`, live recognition without fixture arguments, the same `山` shape drawn in canonical and deliberately noncanonical stroke sequences, and a deterministic no-candidate recovery seam. The [journey evidence record](Verification/JOURNEY-SEARCH-HANDWRITING-v2/README.md) retains nine settled screenshots and names the environment, recognizer, erase, no-candidate, Radical-ownership, and asset boundaries. The current TestFlight QC matrix additionally requires physical-device evidence for the recorded and noncanonical-order `山` gestures.

## App-owned radical Search

Radical input now loads a normalized app-owned catalog from pinned official EDRDG KRADFILE/RADKFILE snapshots. KRADFILE's 6,355 visible-component records are canonical; all 25,699 memberships are checked against RADKFILE's exact inversion and its 253 stroke-counted components before the 354 KB runtime artifact is emitted. Product Experience code depends only on `RadicalCatalog` and `RadicalLookupClient`, never either provider format.

The public journey proves the unselected grouped grid, a broad single-component candidate set, multi-component narrowing, deselection broadening, dedicated removal, disabled Search before candidate choice even when entering with a populated query, `薮` selection, KANJI-primary plus one exact word row, retained ordinary single-kanji Additional Matches, a real catalog candidate with no JMdict row, mode returns, Kanji-detail traversal, and durable recent history. The [journey evidence record](Verification/JOURNEY-SEARCH-RADICAL-v2/README.md) retains seven settled screenshots and names the environment, glyph substitute, deterministic ordering, uncaptured edge states, no-dictionary fallback, populated-query recovery, and source-separation boundary.

## App-owned Word Detail

Word Detail now renders app-owned reading, selected-form commonness, exact UniDic pitch, offline pronunciation, normalized word classes, ordered senses and usage notes, written/reading alternatives, primary-headword Kanji rows, canonical related words, durable edited notes, and offline Tatoeba examples. Primary and alternative Kanji plus related entries traverse through public navigation while ordinary reading alternatives remain non-interactive text.

The normalized artifact contains 218,382 JMdict entries, 36,668 authoritative or human-reviewed relationships, 59,357 exact UniDic pitch facts, and 232,703 Tatoeba Japanese–English pairs. Qualified references navigate directly by exact target ID. All entries have unique provider-independent semantic note identities, and ambiguous homographs receive neither another entry's notes nor unverifiable form-only examples. The [journey evidence record](Verification/JOURNEY-INSPECT-WORD-v5/README.md) retains 13 settled screenshots, including primary Kanji navigation, homograph isolation, and the bundled UniDic license.
