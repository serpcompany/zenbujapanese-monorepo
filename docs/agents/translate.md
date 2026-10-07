# Translate (iOS)

How the app's Translate tab is built, tested, and checked. What it does for a learner is in
[`apps/ios/docs/product/translate.md`](../../apps/ios/docs/product/translate.md); the plan for the
rest of the translator, including an Online engine, is the epic #624.

## Code layout

The tab is split across two Swift targets in `apps/ios/Modules`
([ADR 0011](../adr/0011-keep-the-translators-engine-in-its-own-swift-target.md)):

- **`TranslatorCore`** (`apps/ios/Modules/Sources/TranslatorCore/`) holds everything that decides
  what happens during a conversation and in History, with no SwiftUI and no Apple speech or
  translation framework (`pnpm verify layers` enforces its imports):
  - `LiveConversation` is the conversation engine: turns and sentences, provisional and final
    translations, held audio, the turn-end pause (1.2 s), the 30-second cutoff, the silence prompt
    (170 s, then 10 s), pause, resume, the background, and leaving. Times are in
    `ConversationTiming`.
  - It reaches the outside only through `TranscriptionClient`, `SentenceTranslationClient`, and
    `SpeechPlaybackClient` (`TranslatorClients.swift`), structs of closures like the app's other
    clients, so an Online engine is another set of clients, not a change to the engine.
  - `BilingualTranscriptMerger` turns two recognizers' results (Japanese and English, hearing the
    same audio) into one stream. It holds a final until the other recognizer's final arrives, for
    at least 0.4 s. It keeps holding while the other recognizer still has an unfinished sentence:
    up to 1.5 s once that sentence stops changing, and up to 20 s while it's still changing,
    because the person is still talking. Then it joins each recognizer's sentences, picks the
    language with `LanguageArbiter` (confidence plus how well the text's script matches the
    language), and drops the loser's late final. Live text shows the held sentences plus the
    unfinished one. Leading punctuation is trimmed. A winner with one letter, or with a confidence
    below 0.4, becomes an empty final, which clears the live text without adding a sentence.
  - `SpeechPauseDetector` finds the end of speech from the microphone's loudness: a level three
    times the room's noise floor is voice, and 0.6 s without voice is a pause. Muted audio counts
    as silence and leaves the noise floor alone.
  - `ConversationHistory` saves each conversation as its own JSON file in
    `Application Support/Zenbu Japanese/Translate Conversations/`, so saving after every sentence
    rewrites one small file. A file this version can't read, or one from a newer version, is
    skipped and left in place.
- **`SearchExperience`** (`apps/ios/Modules/Sources/SearchExperience/Translate/`) holds the screens
  and the Apple adapters: `OnDeviceTranscriber` (an actor running `AVAudioEngine` into one
  `SpeechAnalyzer` per language, each with that language's `SpeechTranscriber`, fed copies of the
  same audio), `OnDeviceTranslation` (Apple
  Translation, one `TranslationSession` per sentence), `SystemSpeechPlayer`
  (`AVSpeechSynthesizer`), and `TranslateExperience`, which owns the session, History, the
  remembered mode, and the start checks (microphone, Apple Translation, speech assets), which
  are on-device-specific and change when an Online engine arrives. The home card is
  `TypedTranslationCard` and the mode picker `LiveModesSheet`. `SearchExperienceRootView` adds
  the tab, its navigation stack, and its word sheet, and `TranslateSessionChrome` adds the session
  bar for other tabs (`TranslateSessionAccessory`, a `tabViewBottomAccessory`, hidden while the
  conversation is on screen, where `ConversationTimerControl` in the top bar takes its place), the
  silence prompt, and the background pause to the whole `TabView`.

## Rules that aren't obvious

- Audio tap, notification, and delegate callbacks are built in `nonisolated` or `static`
  functions and hop to the actor or main actor themselves. A closure written inside an
  actor-isolated method is isolated to it, and Swift 6 crashes when the framework calls it on its
  own thread (the prior Owll clone's build 7).
- In Conversation mode, and in Listening when the output is the iPhone's speaker
  (`SpeechPlaybackClient.reachesMicrophone`), the microphone isn't stopped during playback:
  `setHearing(false)` feeds the analyzers silence instead, so their timeline stays continuous, and
  voice processing's echo cancellation stays on. It doesn't finalize: finalizing as the silence
  began made the Japanese recognizer invent a low-confidence `はい`. That became a turn, and its
  spoken "Yes" muted the microphone again, so the app looped on itself every 2 s (#637).
- Apple's two recognizers end sentences differently. English ends a sentence by itself about
  0.5–1 s after a pause. Japanese holds its sentence until the next speech begins, even across
  English speech. So at each pause `OnDeviceTranscriber` finalizes only the Japanese analyzer
  (`finishedAtPauses`), and only when it has an unfinished sentence. Finalizing the English
  analyzer garbles the sentence spoken right after it ("Then Osaka on Friday." became `....`),
  which is why each language has its own analyzer.
- A turn closes only when nobody is talking: no live sentence in either language, and
  `turnEndPause` since the last result. A wrong-language guess that becomes a turn closes the
  real one and mutes the microphone while the person is still speaking. Ducking of other audio
  is set to the minimum so the system voice stays audible.
- `TranslationSession` isn't `Sendable`, so a session is created inside each translation call
  rather than cached; `.translationTask`'s action is a `nonisolated` method for the same reason.
- `translationTask` is the only way to show Apple's download prompt, so `TranslateExperience`
  sets `translationDownload` and a hidden view runs `prepareTranslation()`.
- `OnDeviceTranscriber` numbers each start; a `stop()` that lands while a start is still awaiting
  the analyzer makes that start give up, so a quick Resume then Pause can't leave the microphone
  on. After a media-services reset it builds a new `AVAudioEngine`, and `SystemSpeechPlayer` a new
  synthesizer, since the old ones no longer work.
- A conversation that has been left refuses to start again, so a dialog closing late can't revive
  it.
- Pausing always stops the recognizer, the audio engine, playback, and the timers, and releases
  the audio session back to `.soloAmbient`, the category the rest of the app uses.
- On iOS 26.0, which lacks `tabViewBottomAccessory(isEnabled:)`, the session bar is a
  `safeAreaInset` instead.

## Tests

`TranslatorCoreTests` covers the engine with fake clients and a fake clock (the acceptance
fixture's J-E-J-E turns, held audio, the 30-second cutoff, Text Only, Listening, the silence
prompt, pause and resume, the background, leaving with and without saving, muting, provisional
translations, a stalled sentence, failures), the merger, typed-language detection, and History
storage. Run it from `apps/ios/Modules`:

```sh
xcodebuild -scheme ZenbuJapaneseModules \
  -destination 'platform=iOS Simulator,id=<booted-simulator-udid>' \
  ONLY_ACTIVE_ARCH=YES -only-testing:TranslatorCoreTests test
```

## Simulator harness

Apple Translation doesn't run in the Simulator, so the live engine can't either. A Debug build
launched with `ZENBU_TRANSLATE_SCRIPT=station` replaces the clients with a scripted station
conversation (and TV announcements in Listening), fixture translations, silent playback, and a
20-second silence prompt, so every screen can be checked:

```sh
SIMCTL_CHILD_ZENBU_TRANSLATE_SCRIPT=station xcrun simctl launch <udid> com.zenbujapanese.dictionary
```

Release builds don't contain the harness.

## Translate manual checks

In the Simulator, with the harness:

- Typing `Where can I buy a Suica card?` in the **Translate anything** card shows **English →
  Japanese**, copy, speak, and linked Japanese; tapping a word closes the keyboard and opens Word
  Detail at half height.
- The card's microphone opens **Live translation modes**; **Start** with Conversation shows the
  station conversation: an **EN → 日本語** turn, then one Japanese turn of three cards whose audio
  waits (**N waiting for a pause**), each card turning active while it plays. The pill at the top
  right has the red timer and a pause button that becomes a blue play while paused; the title's
  menu has **Play Translations Aloud** and **Change Mode…**.
- Opening a word's full entry, or another tab, shows the full-width session bar; other tabs read
  **Conversation still listening · Return**, which returns to the conversation.
- Back shows **Leave this conversation?** from the Back button; **Save and Exit** returns home, and
  History lists it with **Today, HH:MM · N turns**, a long-press menu, and the transcript.
- **Listening** leads each card with English and plays as it goes. After 20 seconds of silence,
  **Are you still there?** counts down and pauses with a card and **Resume**.
- Sending the app home pauses with **Paused while you were away**; **Exit Without Saving** leaves
  no file in `Translate Conversations`.

On an iPhone, in a **Zenbu Dev** build ([`ios.md`](ios.md), Build and inspect) so the TestFlight
app is untouched, with iPhone Mirroring closed (it silences the microphone), and without the
harness:

- The first Start asks for the microphone and downloads Apple's languages once, with progress.
- The acceptance fixture, spoken in turn: `今日は東京駅に行きます。`,
  `Please meet me at Shibuya Station at three o'clock.`, `はい、三時に会いましょう。`,
  `Thank you. See you there.` — four turns, Japanese, English, Japanese, English, each
  translation spoken in the other language, places and times intact, and no turn made of the
  app's own voice.
- Listening on the speaker never transcribes its own English; with earphones it keeps listening
  while it plays.
- Airplane Mode changes nothing once the languages are downloaded.
