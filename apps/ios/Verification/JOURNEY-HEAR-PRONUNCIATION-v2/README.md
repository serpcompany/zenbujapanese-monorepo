# Hear pronunciation journey evidence

`SearchReplicaJourneyUITests.testWordAndExampleSpeakersCompleteLiveJapaneseSpeech`
exercises the public Word Detail headword speaker, a source-backed inline example
speaker, and the dedicated Example Sentences speaker. Each tap is correlated to a
fresh live `AVSpeechSynthesizer` invocation and must report both `didStart` and
`didFinish` for the exact requested text with an actual Japanese (`ja*`) voice.

The manifest retains two settled 1320 x 2868 screenshots from the focused passing
run on the iPhone 17 Pro Max iOS 26.0.1 simulator:

- `059E20B4-EE4B-42E6-B0B4-C68C4C15AE91.png`: Word Detail with the headword
  speaker and inline-example speaker visible after playback settled.
- `3C528D73-EDA2-4547-9D78-4DE1168F5AED.png`: dedicated Example Sentences with
  per-row speakers visible after playback settled.

The complete existing iOS UI suite passed on the same simulator: 34 passed,
0 failed, 0 skipped in 536.466 seconds. The production adapter remains an offline
platform capability and the lifecycle observation surface is compiled only in
DEBUG builds when explicitly requested by UI tests.

## Named boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification used the available iOS 26.0.1
  simulator; the fixed reference authority used physical iPhone 17 Pro Max on
  iOS 26.5.2.
- `AUDIO-SUBSTITUTE-PRONUNCIATION-001`: Zenbu uses Apple's platform Japanese
  Speech Synthesis because the reference app's recording/provider routing is not
  available. Exact voice identity and provider routing are not claimed.
- `PLAYBACK-EVIDENCE-PRONUNCIATION-001`: XCTest cannot measure acoustic pressure,
  hardware volume, or the active route. Correlated live `didStart`/`didFinish`
  callbacks with the actual Japanese voice prove that the system synthesizer
  accepted and completed each utterance; screenshots only prove the settled UI.
- `UNCAPTURED-PRONUNCIATION-001`: playback progress, interruption, silent-mode,
  route changes, network behavior, unavailable voices, and synthesis failure
  presentation remain uncaptured and are not overclaimed.

Playback creates no durable product output and introduces no persistent playback
UI, matching the captured journey.
