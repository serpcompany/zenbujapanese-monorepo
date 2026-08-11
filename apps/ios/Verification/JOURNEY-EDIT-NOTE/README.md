# Edit word note journey evidence

Three public UI tests exercise the complete dossier-captured note lifecycle through Search and Word Detail:

- open the inline empty editor, enter text, observe the additional Add Note row, and finish with Done;
- retain ordered notes after navigation, immediate Done then Back, process termination, and cold relaunch;
- reopen an existing note, delete all text, finish to restore the empty Add Note state, and treat empty Done as a no-op;
- auto-save populated text through Back and keep multiple notes attached only to their app-owned `WordNoteID`.

The manifest retains seven settled 1320 x 2868 screenshots on iPhone 17 Pro Max / iOS 26.0.1. Four were exported from the exact passing complete-suite result bundle. The populated-editor, navigation-return, and restored-empty images were recaptured through the same focused public UI tests after that gate, with a stability pause, because their original XCTest attachments caught incomplete Simulator toolbar frames:

- `30826A77-925C-4548-B564-ADD8C6CA9E1F.png`: empty focused inline editor with Done.
- `2368CF22-C64D-4765-9601-EFCB46315222.png`: populated editor with Done and the additional Add Note row (settled-frame recapture).
- `1961DD4C-BE6B-4618-B88F-9FFD6712540E.png`: saved note and another Add Note row.
- `052BC3DA-7D88-4248-8F69-CEA7B0C6B9CD.png`: note retained after leaving and reopening Word Detail with the Search back control present (settled-frame recapture).
- `96A7F606-9CB2-4BA9-8DAC-8D390EE4E632.png`: note retained after cold relaunch.
- `89C6A5B5-5071-4075-A71A-7AB2E86DFCBA.png`: deleting all text restores the visible Add Note state (settled-frame recapture).
- `6E13A08D-3D53-4A51-91BC-114435CC3E20.png`: populated Back auto-save restored on reopen.

The complete iOS UI suite passed on that simulator: 40 passed, 0 failed, 0 skipped in 960.804 seconds. A Release simulator build also passed.

## Named boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification used the available iOS 26.0.1 simulator; the fixed reference authority used physical iPhone 17 Pro Max on iOS 26.5.2.
- `PLATFORM-KEYBOARD-EXCLUSION-001`: the software keyboard is platform-owned and was dismissed for settled editor captures, matching the dossier exclusion; text entry and focus remain exercised through public controls.
- `STORAGE-DIFFERENCE-NOTES-001`: Zenbu persists an ordered, normalized multi-note array in the app-owned v4 UserDefaults namespace. Nihongo's private storage mechanism is unavailable and is not claimed.
- `NORMALIZATION-DIFFERENCE-NOTES-001`: leading/trailing whitespace is removed on persistence and an empty normalized note deletes that row; the reference's exact whitespace policy was not captured.
- `UNCAPTURED-NOTE-VALIDATION-001`: maximum length, multiline limits, conflict handling, and storage-failure recovery remain outside the captured denominator.
- `ASSET-SUBSTITUTE-001`: navigation and tab glyphs use SF Symbols under the dossier's approved asset variance.

The durable output is the ordered set of learner notes keyed by the entry's unique app-owned `WordNoteID`. Pre-release v1-v3 verification namespaces were never promoted and are intentionally not migrated into the v4 store. Future Language Reference Data promotions must provide the documented reviewed old-key-to-new-key map before changing note identities.
