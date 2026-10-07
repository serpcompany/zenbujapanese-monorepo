---
status: accepted
---

# Keep the translator's engine in its own Swift target

The Translate tab's conversation engine, transcript merging, and History storage live in a new
Swift package target, `TranslatorCore`, which imports neither SwiftUI nor Apple's speech and
translation frameworks and can't import the app's `SearchExperience` target. Its screens and the
adapters that drive the microphone, `SpeechAnalyzer`, Apple Translation, and the system voice stay
in `SearchExperience`, next to Player.

## Why

- **The engine is where the bugs are.** Turn ends, held audio, silence, pause, the background,
  and leaving interact, and the prior Owll clone's state machine shipped untested because it was
  tangled with its SDK and views. A target with no UI or framework dependency is tested with
  fakes and a fake clock in seconds, without the app's bundled language data.
- **An Online engine is coming.** The PRD's provider choice is still open (#624). With the engine
  talking only to transcription, translation, and playback clients, an Online engine is a new set
  of clients, and the engine, its tests, and the conversation screens don't change. The start
  checks in the app's `TranslateExperience` (microphone, downloads) are on-device-specific and
  gain an Online path then.
- **The screens need the dictionary.** Every Japanese word opens Word Detail, which lives in
  `SearchExperience` with linked text, caption cards, and the word sheet. Moving the screens out
  would mean moving the tab shell and those views first, which is the larger split #516 asks about.

## Considered

- **Everything in a `Translate/` folder of `SearchExperience`**, like Player. Simpler, but nothing
  would stop the engine from depending on views or frameworks, and its tests would need the whole
  app target.
- **A `TranslateExperience` feature target with the screens too.** Cleaner, but it needs the tab
  shell out of `SearchExperience` and shared dictionary views in a target of their own first.

## Consequences

- `TranslatorCore` imports only Foundation, Observation, and OSLog, which `pnpm verify layers`
  (`tools/checks/src/layers.ts`) enforces; anything that needs another framework is an adapter
  in `SearchExperience` behind one of the core's clients.
- This is the first step of splitting the app by feature (#516), not a decision on the rest.
