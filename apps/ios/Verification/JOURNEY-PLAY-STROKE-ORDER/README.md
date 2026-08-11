# Step through kanji stroke order evidence

Four public UI tests exercise the fixed stroke-order journey through Search and Kanji Detail. They verify manual Next/Previous, play, pause with retained progress, resume, completion, Close restoration, a one-stroke terminal state, a cold relaunch to the empty Search root, and app-owned source-failure Retry recovery to the real diagram.

The manifest retains seven unique, non-failure 1320 × 2868 screenshots on iPhone 17 Pro Max / iOS 26.0.1:

- `FF700FE6-8F4B-4F08-80A3-BBE0DFC1DEE5.png`: `争` returns to its initial state after Next then Previous.
- `D840B9E6-32EA-4770-865B-9EBACDC3ABA4.png`: `鬱` paused on stroke seven with partial active-stroke progress retained.
- `E43A3D2F-7CB9-4CD2-82D0-79B5E3AF72A3.png`: `鬱` completed at 29 of 29 strokes with an operable replay control restored.
- `3D1BA180-3509-44A0-B3C8-377028C24A46.png`: one-stroke `一` completed at 1 of 1 with replay available.
- `E58112AD-9D3C-4EA9-9CA6-0A8D0A0BCD04.png`: cold relaunch returns to the empty Search root without a retained modal or Kanji Detail route.
- `C24658FD-0E97-4A9D-BA17-72C7763E7216.png`: an injected source failure is distinct from missing source coverage and exposes Retry.
- `C27F204E-4A91-49E0-BFBA-D09EBEFEAC79.png`: Retry recovers the real six-stroke `争` diagram and opens its initialized overlay.

The public stroke-order tests pass individually and in focused runs. They prove that manual Next spends time drawing one stroke before it settles, and that terminal Play begins a fresh sequence. Simulator frames that initially caught incomplete chrome were replaced through passing focused reruns of the same public tests after repeated warm-up snapshots; the retained files show complete relevant controls and chrome. The complete-suite and Release-build results are recorded in `ReplicaVerification.md`.

## Source and transform

The offline app-owned stroke artifact normalizes the pinned official KanjiVG 2025-08-16 release by Ulrich Apel into absolute move and cubic-path commands behind `KanjiStrokeOrderClient`. The artifact contains 6,430 ideograph diagrams and 79,180 ordered strokes; its SHA-256 is `1b9bcd2546759e09e6dd9d9f461fd2e2a89ca739032aac3ebb06e3fde6566f76`. Source identity, attribution, copyright, release URL, source/license/importer checksums, retained fields, exclusions, transform description, counts, and artifact checksum are recorded in `LanguageData`.

Dictionary Sources exposes KanjiVG attribution, the pinned release, project/license links, the transformation summary, and the bundled CC BY-SA 3.0 notice. The original compressed XML remains source provenance and is not a runtime Product Experience model.

## Named differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification used the available iPhone 17 Pro Max iOS 26.0.1 Simulator; the fixed reference authority used physical iPhone 17 Pro Max on iOS 26.5.2.
- `SOURCE-DIFFERENCE-STROKE-COUNT-001`: pinned KanjiVG has six ordered strokes for `争`; the fixed private reference shows eight. Zenbu presents the attributed current source without inventing strokes.
- `RENDERER-VARIANCE-STROKE-001`: Zenbu draws normalized KanjiVG centerlines with SwiftUI. Exact brush weight, marker geometry, path timing, overlay sizing, and typography differ from the unavailable private renderer under the approved renderer/layout variance.
- `ENVIRONMENT-BOUNDARY-STROKE-CLIPBOARD-001`: the fixed universal-clipboard Cancel interruption is system-owned and no corresponding cross-device payload is available in the Simulator. The app-owned overlay remains non-destructively initialized; no parity claim is made for the unavailable platform interruption.
- `UNCAPTURED-STROKE-PLAYBACK-001`: exact autoplay timing, rapid repeated transport input, background interruption, and playback failure behavior remain outside the captured denominator.
- `APP-OWNED-STROKE-LOAD-RECOVERY-001`: exact Nihongo load-failure presentation is uncaptured. Zenbu distinguishes corrupt/unreadable Language Reference Data from legitimate missing KanjiVG coverage and exposes an app-owned Retry action; a DEBUG-only fail-once composition seam verifies public recovery without changing production behavior.
- `SOURCE-COVERAGE-STROKE-001`: only the 6,430 characters present in the pinned KanjiVG artifact expose the control. Missing source data is omitted rather than replaced by an invented diagram.
- `JOURNEY-OWNERSHIP-ELEMENT-DETAIL-001`: element-detail navigation remains owned by issue #107.
- `JOURNEY-OWNERSHIP-KANJI-NOTES-001`: Kanji-note behavior remains owned by issue #108.

This journey creates no durable product output. Playback state is local to the presented modal and is discarded when it closes or the process terminates.
