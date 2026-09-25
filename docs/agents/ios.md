# iOS working guide

## Build and inspect

Use XcodeBuildMCP to discover the project, scheme, and an already-booted iOS
Simulator from the current checkout. Build and run with the `arm64` architecture,
then inspect the launched app before reporting success.

The current `sudachi-swift` binary lacks an x86_64 Simulator slice. Use
`ONLY_ACTIVE_ARCH=YES`; a generic dual-architecture Simulator build fails at
link time.

## Interactive parsing comparison harness

The app defaults to the bundled Kuromoji engine for interactive Japanese in Image Search,
Word Detail, and Example Sentences. Dictionary search segmentation continues to use Sudachi.

To compare the previous interactive parsing path, launch the app with
`ZENBU_MORPHOLOGY_ENGINE=sudachi`. Omit the variable, or use any other value, to exercise
Kuromoji. Keep `ONLY_ACTIVE_ARCH=YES` for either path.

Compare both paths with the same source text and check:

- visible word boundaries and separate underline geometry;
- dictionary resolution for surface, normalized, and dictionary forms;
- candidate selection and the explicit no-entry state;
- the large Word Detail sheet and its **Open Full Entry** route; and
- linked-word behavior in Word Detail and Example Sentences.

This switch is a local comparison harness. It does not change the TestFlight engine, which
uses the default Kuromoji path.

## Current verification boundary

This repository currently has no test targets or CI workflows. Issue [#329](https://github.com/serpcompany/zenbujapanese-monorepo/issues/329) owns the clean-slate replacement strategy. Verify ordinary changes by building and launching the real app; add test or CI infrastructure only through approved follow-up work from that strategy.

## Search frequency-ordering comparison harness

Use these fixed fixtures when changing dictionary candidate retrieval, frequency ordering, or
the Search results presentation. Run every text fixture with the included TUBELEX pack, then
install and activate Japanese Wikipedia under **You → Frequency Dictionaries** and repeat without
editing or resubmitting the visible query.

| Fixture | Query | Verify |
| --- | --- | --- |
| Japanese | `いる` | One **Results** collection; every numeric rank ascends and every `—` row follows ranked rows. |
| English | `quiet` | Relevant gloss matches remain present; numeric rank, not removed buckets, controls their order. |
| Romaji | `miru` | Romaji matches remain relevant and use the same frequency-first ordering. |
| Radical origin | Submit a sparse radical selection | One **Results** collection contains only the leading lexical-rank candidate group, frequency-ordered within that group. |
| Single kanji | `静` | The dedicated Kanji row remains first; word rows use frequency order and visible positions include the Kanji row. |
| No evidence | `齉` | The dictionary entry remains discoverable with `—` and follows any entry with mapped evidence. |
| Reading refinement | `what is your name` | The Japanese-reading refinement remains available and starts the refined search. |
| Discovered words | `日本語を勉強する` | **Discovered Words** remains distinct from ordinary ranked results. |
| Example Sentences | `見る` | The Example Sentences action remains available and opens its associated flow. |

For pack switching, record the visible headwords and ranks for `いる` under TUBELEX, activate
Japanese Wikipedia, return to Search without changing the query, and verify that rows reorder
where the displayed rank values differ. Switch back and verify the original ordering returns.

For unavailable-pack fallback, begin a search and make the active installed pack unreadable in a
debug Simulator container (or inject an unavailable `FrequencyCapability`). Verify that the same
candidate IDs remain in deterministic dictionary order, the list is not emptied, and the
non-blocking frequency-ordering disclosure appears. Restore the pack after the check.

For cancellation, rapidly submit `quiet`, `miru`, and `いる`, then switch packs while the last
query is visible. Only `いる` candidates and evidence from the newly active pack may remain.
