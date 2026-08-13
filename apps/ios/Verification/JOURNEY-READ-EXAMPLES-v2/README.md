# Read and traverse example sentences evidence — v2

Exported from the complete passing `ZenbuJapaneseUITests` result bundle on iPhone 17 Pro Max / iOS 26.0.1. The suite executed 33 tests with 0 failures and 0 skips in 751.2 seconds. `manifest.json` retains two public test identifiers, the simulator identifier, timestamps, and original attachment names for all six distinct 1320×2868 screenshots.

## Public journeys

`testExampleSentencesCanBeOpenedScrolledSpokenAndTraversed` submits `いる`, selects **View 50+ Example Sentences**, and traverses the fixed source-backed chain: scrolled `蝶々` token → canonical `蝶々` Word Detail → its linked `見て` example token → canonical `見る` Word Detail. It exercises both nested returns and the return to Search. Speaker controls and exact Japanese speech completion are covered by the dedicated live playback journeys.

`testExampleOnlyPunctuationQueryOpensItsSourceBackedSentence` submits `hello-world`, observes an example-only result without dictionary headings, opens the retained `世界、こんにちは。` / `Hello world.` pair, verifies its speech request, and follows `世界` to canonical Word Detail.

The list is derived from the pinned Tatoeba Japanese/English export. The retained artifact has 19,414 matching `いる` pairs; the public count deliberately caps at `50+`. Selection is deterministic and source-backed. Japanese Text Analysis supplies app-owned token occurrences, preserves particles as non-links, recognizes the iteration mark in `蝶々`, and applies only the captured `見て` → `見る` recovery before exact Language Reference Data lookup. Each row exposes its retained Tatoeba sentence identifier.

## Settled states

- [Populated `いる` list](F7B2002D-E026-4888-B51B-35D20BD79288.png) — navigation, Japanese/English pairs, linked tokens, ruby readings, provenance, and speakers.
- [Scrolled `蝶々` row](A864D054-3A40-4F18-8F14-4A3B333CC96B.png) — the exact recorded linked-language-item action.
- [`蝶々` Word Detail](54777501-B10B-419B-A489-8F32BA89DB0F.png) — canonical destination reached from the sentence occurrence.
- [`蝶々` linked examples](19E5E3E4-D148-4843-9DE7-BDAA2FFF076B.png) — per-row speech, provenance, and linked `見て` occurrence.
- [`見る` Word Detail](5041B68A-B7CE-4BBA-B164-BA2ADC883607.png) — canonical destination reached from inflected `見て`.
- [`hello-world` example-only result](5D9A8870-2057-4393-BCB9-13CB2EB4BADE.png) — punctuation-normalized source pair and linked `世界` occurrence.

## Named differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification uses iOS 26.0.1 Simulator; reference authority is Nihongo 1.34.3 (9792) on physical iPhone 17 Pro Max / iOS 26.5.2.
- `SOURCE-DIFFERENCE-EXAMPLES-001`: Zenbu uses its pinned, attributed Tatoeba export and deterministic app-owned selection. Nihongo's private corpus snapshot, ordering, and pagination are unavailable and are not inferred.
- `AUDIO-SUBSTITUTE-EXAMPLES-001`: the retained Tatoeba input is text-only. Production speaker controls use offline system Japanese speech synthesis. Public tests observe the exact adapter request through a DEBUG-only composition-root recorder; they do not claim audible-output equivalence with Nihongo or Tatoeba recordings.
- `PRESENTATION-SUBSTITUTE-EXAMPLES-001`: all operable linked tokens use Zenbu's blue link accent. The reference distinguishes the searched expression with a second highlight color; that color distinction is not a semantic or navigation claim.
- `UNCAPTURED-EXAMPLES-001`: no-example recovery, pagination beyond the deterministic retained page, and speech failure/retry behavior were not captured by the fixed authority. They remain explicitly unclaimed rather than replaced with fixture-only gates.

No durable output was observed or introduced for this journey.
