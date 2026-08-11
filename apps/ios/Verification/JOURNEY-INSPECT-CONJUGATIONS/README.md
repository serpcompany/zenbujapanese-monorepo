# Inspect conjugations journey evidence

Four public UI tests exercise the dossier-captured conjugation denominator through
Search, Word Detail, View Conjugations, Plain/Polite selection, and Back:

- Ichidan `いる`: all eleven Plain and Polite rows plus return to its originating Word Detail.
- Godan `書く`: all eleven Plain and Polite rows, including visible source-backed readings such as `書いた` / `かいた`.
- captured irregulars `する` and `来る`: all eleven Plain and Polite rows, including `来ない` / `こない`.
- `とんでもない` and `静か`: the captured adjective form lists without verb mode controls, including `静かな` / `しずかな`.

The manifest retains eight settled 1320 x 2868 screenshots exported from the exact
passing complete-suite result bundle on iPhone 17 Pro Max / iOS 26.0.1:

- `26AAD92D-F270-4B7A-ACC9-99F08E996229.png`: Ichidan Plain.
- `F3B9B1B5-7CD8-4875-9B4D-3FFA10F43554.png`: Ichidan Polite.
- `AA2FA7AB-675C-4042-ACCA-964331ECE6C3.png`: Godan Plain with furigana.
- `83D10207-62C5-4164-8212-7F44F95A2665.png`: Godan Polite with furigana.
- `9A08D582-91C2-4370-BA88-04A51F14966C.png`: `する` Polite.
- `41D89F32-B055-41AF-9670-69E92E9E3CBA.png`: `来る` Polite with furigana.
- `65961EF5-BF86-41B9-87A3-DC65C34FA7DF.png`: i-adjective forms.
- `A44F6F7A-AEF2-4B92-A484-B6B9D8430076.png`: na-adjective forms with furigana.

The complete iOS UI suite passed on that simulator: 38 passed, 0 failed, 0 skipped
in 636.536 seconds. A Release simulator build also passed.

## Named boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification used the available iOS 26.0.1
  simulator; the fixed reference authority used physical iPhone 17 Pro Max on
  iOS 26.5.2.
- `PROVENANCE-GAP-CONJUGATION-RULES-001`: Zenbu uses independently authored,
  app-owned conjugation rules selected from normalized Language Reference Data
  word classes and lexical forms. The reference app's private morphology
  implementation is unavailable and is not claimed.
- `UNCAPTURED-CONJUGATIONS-001`: conjugation classes, lexical exceptions, missing
  forms, and mode-selection persistence beyond the six captured representatives
  remain outside the verified denominator. The implementation does not claim a
  complete Japanese morphology engine.
- `ASSET-SUBSTITUTE-001`: navigation and tab glyphs use SF Symbols under the
  dossier's approved asset variance.

This journey produces no durable product output.
