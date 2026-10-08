---
status: accepted
---

# Run the on-device recognizer on the Mac, from its own target

The code that drives Apple's two recognizers and decides when sentences end
(`BilingualRecognizer`), the speech downloads, the sentence translation client, and the Debug
diagnostics move out of `SearchExperience` into a new Swift target, `TranslatorOnDevice`. It
builds for iOS and macOS, imports only Foundation, AVFoundation, Speech, Translation, and
`TranslatorCore`, and is a library product, so the Mac tool `translate-replay`
(`apps/ios/Tools/TranslateReplay`) can feed recorded iPhone audio through the same code the app
runs. The microphone, the audio session, voice processing, playback, and the screens stay in
`SearchExperience`. This amends [ADR 0011](0011-keep-the-translators-engine-in-its-own-swift-target.md),
which kept every adapter there.

## Why

- **The recognizer is where the remaining bugs are** (#640): lost first words, dropped words in
  fast speech, and sentences ended too early or too late. They depend on Apple's recognizers, so
  `TranslatorCore`'s fakes can't show them, and checking each change on an iPhone means a person
  playing a script to a phone for every attempt.
- **Apple's recognizers and Apple Translation run on the Mac**, and they turn a recording from the
  phone into the same results the phone produced. Feeding the recording in real time through the
  app's own code, instead of a copy of it, keeps the check honest as that code changes.

## Considered

- **A copy of the recognizer's logic in a script.** That is how the first tuning was done. The
  copy drifts from the app, and the duplicate-code check refuses it.
- **A macOS test target in the app's package.** `swift test` builds every target, and
  `SearchExperience` doesn't build for macOS.
- **Driving the Simulator.** Apple Translation doesn't run there, and its microphone would need a
  virtual audio device.

## Consequences

- The package declares macOS 26 as well as iOS 26, and has two products, so Xcode names its
  package scheme `ZenbuJapaneseModules-Package`.
- `pnpm verify layers` (`tools/checks/src/layers.ts`) keeps `TranslatorOnDevice` free of SwiftUI,
  UIKit, and `SearchExperience`.
- The replay is a local check. It needs the Mac's speech models and the recordings, which aren't in
  this repository, so CI doesn't run it.
