import Foundation
import Testing

@testable import TranslatorCore

@MainActor
@Suite("Conversation playback")
struct ConversationPlaybackTests {
  private let tokyo = "今日は東京駅に行きます。"
  private let stairs = "この先の階段を下りてください。"

  @Test("echo-cancelled playback keeps the microphone open")
  func echoCancelledPlaybackKeepsListening() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    await harness.pause(for: 1.3)

    #expect(harness.playback.spoken.count == 1)
    #expect(harness.transcription.hearing.isEmpty)
  }

  @Test("the app's own voice heard back never becomes a sentence")
  func ownVoiceIsIgnored() async {
    let harness = ConversationHarness()
    harness.playback.holdsSpeech = true
    await harness.startAndWaitForListening()
    let spoken = FakeTranslator.translation(of: tokyo, from: .japanese)

    await harness.hear(.japanese, tokyo)
    await harness.startSpeaking(count: 1)
    harness.session.receive(.volatile(.english, String(spoken.prefix(6))))
    #expect(harness.session.liveSentence == nil)
    harness.session.receive(.final(.english, spoken))
    harness.playback.finishSpeaking()
    await harness.session.settle()
    harness.time.advance(1)
    await harness.hear(.english, spoken)
    #expect(harness.session.conversation.turns.count == 1)

    harness.time.advance(1)
    await harness.hear(.english, spoken)
    #expect(harness.session.conversation.turns.count == 2)
  }

  @Test("playback waits while someone is talking and resumes when they finish")
  func playbackWaitsForSilence() async {
    let harness = ConversationHarness()
    harness.playback.holdsSpeech = true
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    await harness.hear(.japanese, stairs)
    await harness.startSpeaking(count: 1)
    harness.session.receive(.volatile(.english, "Excuse me"))
    harness.playback.finishSpeaking()
    await harness.session.settle()
    #expect(harness.playback.spoken.count == 1)

    await harness.hear(.english, "Excuse me.")
    #expect(harness.playback.spoken.count == 2)
    #expect(harness.playback.spoken.last?.language == .english)
  }

  @Test("a finished sentence keeps its live translation until the final one arrives")
  func provisionalCarriesOver() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    let live = "明日は朝八時に新宿駅で"
    let finished = "明日は朝八時に新宿駅で待ち合わせしましょう。"

    harness.session.receive(.volatile(.japanese, live))
    await harness.session.settle()
    harness.translator.holdsTranslations = true
    harness.session.receive(.final(.japanese, finished))

    let sentence = harness.session.conversation.turns.last?.sentences.last
    #expect(sentence?.translation == FakeTranslator.translation(of: live, from: .japanese))
    harness.translator.release()
    await harness.session.settle()
    #expect(
      harness.session.conversation.turns.last?.sentences.last?.translation
        == FakeTranslator.translation(of: finished, from: .japanese))
  }

  @Test("a sentence whose final translation fails drops its live translation and isn't spoken")
  func failedTranslationDropsProvisional() async throws {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    harness.translator.failingTexts = [tokyo]

    harness.session.receive(.volatile(.japanese, "今日は東京駅に"))
    await harness.session.settle()
    await harness.hear(.japanese, tokyo)
    await harness.pause(for: 1.3)

    let sentence = harness.session.conversation.turns.first?.sentences.first
    #expect(sentence?.translation == nil)
    #expect(harness.session.untranslatedSentenceIDs.contains(try #require(sentence?.id)))
    #expect(harness.playback.spoken.isEmpty)
  }
}
