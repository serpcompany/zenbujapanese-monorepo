import Foundation
import Testing

@testable import TranslatorCore

@MainActor
@Suite("Muting spoken translations")
struct ConversationMutingTests {
  private let tokyo = "今日は東京駅に行きます。"
  private let stairs = "この先の階段を下りてください。"
  private let platform = "三番線の電車に乗ってください。"

  @Test(
    "muted, translations still show but none waits, plays, or closes the microphone",
    arguments: TranslateMode.allCases)
  func mutedShowsWithoutPlaying(mode: TranslateMode) async {
    let harness = ConversationHarness(mode: mode)
    harness.playback.reachesMicrophone = true
    harness.session.setMuted(true)
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    harness.session.receive(.volatile(.japanese, "この先の"))
    #expect(harness.session.activity == .hearing)
    harness.session.receive(.volatile(.japanese, ""))
    await harness.pause(for: 1.3)

    #expect(harness.session.conversation.turns[0].sentences[0].translation != nil)
    #expect(harness.session.playbackQueue.isEmpty)
    #expect(harness.playback.spoken.isEmpty)
    #expect(harness.transcription.hearing.isEmpty)
  }

  @Test("muting while a turn waits for a pause drops its audio")
  func mutingDropsHeldTurn() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    await harness.hear(.japanese, tokyo)

    harness.session.setMuted(true)
    await harness.pause(for: 1.3)

    #expect(harness.session.conversation.sentences.first?.translation != nil)
    #expect(harness.playback.spoken.isEmpty)
  }

  @Test(
    "muting stops the translation playing at once, drops the queue, and keeps translating",
    arguments: TranslateMode.allCases)
  func mutingStopsPlayback(mode: TranslateMode) async {
    let harness = ConversationHarness(mode: mode)
    harness.playback.reachesMicrophone = true
    harness.playback.holdsSpeech = true
    await harness.startAndWaitForListening()
    harness.session.receive(.final(.japanese, tokyo))
    harness.session.receive(.final(.japanese, stairs))
    await harness.startSpeaking(count: 1)

    harness.session.setMuted(true)
    await harness.session.settle()

    #expect(harness.playback.stopCount == 1)
    #expect(harness.session.speakingSentenceID == nil)
    #expect(harness.transcription.hearing == [false, true])
    #expect(harness.session.status == .live)

    await harness.hear(.japanese, platform)
    await harness.pause(for: 1.3)

    #expect(harness.session.conversation.sentences.last?.translation != nil)
    #expect(harness.playback.spoken.count == 1)
  }

  @Test(
    "turning the sound back on plays what comes next, not what was skipped",
    arguments: TranslateMode.allCases)
  func unmutingPlaysWhatComesNext(mode: TranslateMode) async {
    let harness = ConversationHarness(mode: mode)
    await harness.startAndWaitForListening()
    harness.session.setMuted(true)
    await harness.hear(.japanese, tokyo)
    await harness.pause(for: 1.3)

    harness.session.setMuted(false)
    await harness.hear(.japanese, stairs)
    await harness.pause(for: 1.3)

    #expect(harness.playback.spoken.map(\.text) == translations(of: stairs))
  }

  @Test("in Conversation, a turn under way when the sound comes back plays in full when it ends")
  func unmutingMidTurnPlaysTheWholeTurn() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    harness.session.setMuted(true)
    await harness.hear(.japanese, tokyo)

    harness.session.setMuted(false)
    await harness.hear(.japanese, stairs)
    await harness.pause(for: 1.3)

    #expect(harness.playback.spoken.map(\.text) == translations(of: tokyo, stairs))
  }

  @Test("muting and unmuting while the microphone closes for a translation skips it")
  func quickMuteWhileMicrophoneCloses() async {
    let harness = ConversationHarness(mode: .listening)
    harness.playback.reachesMicrophone = true
    harness.transcription.onHearing = { isHearing in
      guard !isHearing else { return }
      harness.session.setMuted(true)
      harness.session.setMuted(false)
    }
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    #expect(harness.playback.spoken.isEmpty)

    harness.transcription.onHearing = nil
    await harness.hear(.japanese, stairs)
    #expect(harness.playback.spoken.map(\.text) == translations(of: stairs))
  }

  @Test("a muted conversation is saved as the mode it was started in", arguments: TranslateMode.allCases)
  func mutedConversationKeepsItsMode(mode: TranslateMode) async {
    let harness = ConversationHarness(mode: mode)
    await harness.startAndWaitForListening()
    harness.session.setMuted(true)
    await harness.hear(.japanese, tokyo)

    await harness.session.leave(saving: true)

    #expect(harness.archive.saved.last?.mode == mode)
  }

  private func translations(of texts: String...) -> [String] {
    texts.map { FakeTranslator.translation(of: $0, from: .japanese) }
  }
}
