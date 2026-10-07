import Foundation
import Testing

@testable import TranslatorCore

@MainActor
@Suite("Live conversation")
struct LiveConversationTests {
  private let tokyo = "今日は東京駅に行きます。"
  private let shibuya = "Please meet me at Shibuya Station at three o'clock."
  private let three = "はい、三時に会いましょう。"
  private let thanks = "Thank you. See you there."

  @Test("the acceptance fixture alternates J-E-J-E with each translation spoken in the other language")
  func acceptanceFixture() async {
    let harness = ConversationHarness()
    harness.playback.reachesMicrophone = true
    await harness.startAndWaitForListening()

    for (language, text) in [
      (SpokenLanguage.japanese, tokyo), (.english, shibuya), (.japanese, three), (.english, thanks),
    ] {
      await harness.hear(language, text)
      await harness.pause(for: 1.3)
    }

    let turns = harness.session.conversation.turns
    #expect(turns.map(\.language) == [.japanese, .english, .japanese, .english])
    #expect(turns.map(\.text) == [tokyo, shibuya, three, thanks])
    #expect(
      harness.playback.spoken == [
        .init(text: FakeTranslator.translation(of: tokyo, from: .japanese), language: .english),
        .init(text: FakeTranslator.translation(of: shibuya, from: .english), language: .japanese),
        .init(text: FakeTranslator.translation(of: three, from: .japanese), language: .english),
        .init(text: FakeTranslator.translation(of: thanks, from: .english), language: .japanese),
      ])
    #expect(harness.transcription.requests.first?.languages == [.japanese, .english])
    #expect(harness.transcription.hearing == [false, true, false, true, false, true, false, true])
    #expect(harness.session.activity == .listening)
  }

  @Test("a translation waits for the speaker to pause before it plays")
  func waitsForPause() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    await harness.pause(for: 0.6)
    #expect(harness.playback.spoken.isEmpty)
    #expect(harness.session.openTurnID != nil)

    await harness.pause(for: 0.7)
    #expect(harness.playback.spoken.count == 1)
    #expect(harness.session.openTurnID == nil)
  }

  @Test("long speech groups sentences in one turn and holds their audio until the pause")
  func longSpeechHoldsAudio() async {
    let harness = ConversationHarness()
    harness.playback.reachesMicrophone = true
    await harness.startAndWaitForListening()

    let sentences = ["この先の階段を下りて、右に曲がってください。", "突き当たりに改札がありますが、出ないでください。", "そのまま五番線まで進んでください。"]
    for sentence in sentences {
      await harness.hear(.japanese, sentence)
      harness.time.advance(0.5)
      harness.session.tick()
    }
    harness.session.receive(.volatile(.japanese, "快速は"))
    #expect(harness.session.activity == .waiting(3))
    #expect(harness.playback.spoken.isEmpty)

    await harness.hear(.japanese, "快速は二分後に来ます。")
    await harness.pause(for: 1.3)

    #expect(harness.session.conversation.turns.count == 1)
    #expect(harness.session.conversation.turns[0].sentences.count == 4)
    #expect(harness.playback.spoken.map(\.language) == Array(repeating: .english, count: 4))
    #expect(harness.transcription.hearing == [false, true])
  }

  @Test("a turn stays open while anyone is still talking")
  func turnWaitsForSilence() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, "今日は東京駅に行きます。")
    harness.session.receive(.volatile(.english, "Please meet"))
    await harness.pause(for: 3)
    #expect(harness.session.openTurn != nil)
    #expect(harness.playback.spoken.isEmpty)

    harness.session.receive(.final(.english, ""))
    await harness.pause(for: 1.3)
    #expect(harness.session.openTurn == nil)
    #expect(harness.playback.spoken.map(\.language) == [.english])
  }

  @Test("a speaker who never pauses has the turn finished after about 30 seconds")
  func forceFinishesLongTurn() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    for second in 0..<31 {
      await harness.hear(.english, "Sentence \(second).")
      harness.session.receive(.volatile(.english, "And then"))
      harness.time.advance(1)
      harness.session.tick()
      await harness.session.settle()
    }

    #expect(harness.session.conversation.turns.count >= 2)
    #expect(harness.session.conversation.turns[0].sentences.count == 30)
    #expect(harness.playback.spoken.count >= 30)
  }

  @Test("Text Only shows translations without playing them or closing the microphone")
  func textOnlyPlaysNothing() async {
    let harness = ConversationHarness(mode: .textOnly)
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    await harness.pause(for: 1.3)

    #expect(harness.session.conversation.turns[0].sentences[0].translation != nil)
    #expect(harness.playback.spoken.isEmpty)
    #expect(harness.transcription.hearing.isEmpty)
  }

  @Test("Listening hears only Japanese, plays each translation as it arrives, and never closes the microphone")
  func listeningPlaysImmediately() async {
    let harness = ConversationHarness(mode: .listening)
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, "今夜までに雨は止み、明日は関東全域で晴れるでしょう。")
    #expect(harness.playback.spoken.count == 1)
    await harness.hear(.japanese, "東京の最高気温は24度の予想です。")
    #expect(harness.playback.spoken.count == 2)

    #expect(harness.transcription.requests.first == TranscriptionRequest(mode: .listening))
    #expect(harness.transcription.requests.first?.capture == .distantSound)
    #expect(harness.transcription.hearing.isEmpty)
  }

  @Test("after 2 min 50 s of silence it asks, then pauses 10 seconds later")
  func silencePromptThenPause() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    await harness.pause(for: 169)
    #expect(harness.session.silencePromptDeadline == nil)
    await harness.pause(for: 1)
    #expect(harness.session.silencePromptDeadline == harness.time.now.addingTimeInterval(10))

    await harness.pause(for: 9.9)
    #expect(harness.session.status == .live)
    await harness.pause(for: 0.1)

    #expect(harness.session.status == .paused(.silence))
    #expect(harness.session.silencePromptDeadline == nil)
    #expect(harness.transcription.stopCount == 1)
    #expect(harness.playback.stopCount == 1)
  }

  @Test("speech or Keep Listening dismisses the prompt and starts a fresh timer")
  func promptDismissal() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    await harness.pause(for: 170)
    harness.session.receive(.volatile(.english, "Hello"))
    #expect(harness.session.silencePromptDeadline == nil)
    harness.session.receive(.final(.english, ""))

    await harness.pause(for: 170)
    #expect(harness.session.silencePromptDeadline != nil)
    harness.session.keepListening()
    #expect(harness.session.silencePromptDeadline == nil)
    await harness.pause(for: 169)
    #expect(harness.session.silencePromptDeadline == nil)
    #expect(harness.session.status == .live)
  }

  @Test("pause closes the microphone and playback, ignores late speech, and resume listens again")
  func pauseAndResume() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    harness.session.receive(.volatile(.japanese, "今日は"))

    harness.session.pause()
    await harness.session.settle()
    #expect(harness.session.status == .paused(.byUser))
    #expect(harness.session.liveSentence == nil)
    #expect(harness.transcription.stopCount == 1)
    #expect(harness.playback.stopCount == 1)

    harness.session.receive(.final(.japanese, tokyo))
    #expect(harness.session.conversation.turns.isEmpty)

    await harness.startAndWaitForListening()
    for _ in 0..<100 where harness.transcription.requests.count < 2 { await Task.yield() }
    #expect(harness.session.status == .live)
    #expect(harness.transcription.requests.count == 2)
  }

  @Test("going to the background pauses")
  func backgroundPauses() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    harness.session.appMovedToBackground()

    #expect(harness.session.status == .paused(.background))
  }

  @Test("the timer counts only time spent listening")
  func elapsedCountsLiveTime() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    harness.time.advance(20)
    harness.session.pause()
    harness.time.advance(100)
    harness.session.start()
    harness.time.advance(5)

    #expect(harness.session.elapsed(at: harness.time.now) == 25)
  }

  @Test("each translated sentence is saved, and Exit Without Saving deletes the draft")
  func savesContinuouslyAndDiscards() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    #expect(harness.archive.saved.last?.sentences.first?.translation != nil)

    harness.translator.holdsTranslations = true
    harness.session.receive(.final(.english, shibuya))
    await harness.session.leave(saving: false)
    let savesBeforeLateTranslation = harness.archive.saved.count
    harness.translator.release()
    await harness.session.settle()

    #expect(harness.archive.deleted == [harness.session.conversation.id])
    #expect(harness.archive.saved.count == savesBeforeLateTranslation)
  }

  @Test("Save and Exit waits for translations still in flight")
  func saveAndExitWaitsForTranslations() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    harness.translator.holdsTranslations = true
    harness.session.receive(.final(.english, shibuya))

    let leaving = Task { await harness.session.leave(saving: true) }
    await Task.yield()
    harness.translator.release()
    await leaving.value

    #expect(harness.archive.saved.last?.sentences.first?.translation != nil)
    #expect(harness.session.status == .paused(.leaving))
  }

  @Test("muting switches to Text Only and stops what was queued")
  func mutingStopsPlayback() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    await harness.hear(.japanese, tokyo)

    harness.session.switchMode(to: .textOnly)
    await harness.pause(for: 1.3)

    #expect(harness.session.mode == .textOnly)
    #expect(harness.session.conversation.mode == .textOnly)
    #expect(harness.playback.spoken.isEmpty)

    harness.session.switchMode(to: .listening)
    #expect(harness.session.mode == .textOnly)
  }

  @Test("live speech shows a provisional translation")
  func provisionalTranslation() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    harness.session.receive(.volatile(.english, "Please meet me"))
    await harness.session.settle()

    #expect(
      harness.session.liveSentence?.provisionalTranslation
        == FakeTranslator.translation(of: "Please meet me", from: .english))
    #expect(harness.session.activity == .hearing)
  }

  @Test("speech that stalls asks the recognizer to finish the sentence once")
  func stalledSpeechFinishesUtterance() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    harness.session.receive(.volatile(.japanese, "今日は"))
    await harness.pause(for: 2.6)
    await harness.pause(for: 1)

    #expect(harness.transcription.finishCount == 1)
  }

  @Test("a sentence that can't be translated is marked and doesn't block the rest")
  func untranslatedSentence() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    harness.translator.failingTexts = [tokyo]

    await harness.hear(.japanese, tokyo)
    await harness.hear(.japanese, three)
    await harness.pause(for: 1.3)

    let firstID = harness.session.conversation.turns[0].sentences[0].id
    #expect(harness.session.untranslatedSentenceIDs == [firstID])
    #expect(harness.playback.spoken.count == 1)
  }

  @Test("a recognizer that can't start fails the conversation, and Try Again listens again")
  func startFailure() async {
    let harness = ConversationHarness()
    harness.transcription.failure = .speechRecognitionUnavailable

    harness.session.start()
    for _ in 0..<100 where harness.session.status == .live { await Task.yield() }
    #expect(harness.session.status == .failed(.speechRecognitionUnavailable))

    harness.transcription.failure = nil
    await harness.startAndWaitForListening()
    for _ in 0..<100 where harness.transcription.requests.count < 2 { await Task.yield() }
    #expect(harness.session.status == .live)
  }

  @Test("events arrive through the recognizer's stream")
  func streamDelivery() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    harness.transcription.emit(.final(.japanese, tokyo))
    for _ in 0..<100 where harness.session.conversation.turns.isEmpty { await Task.yield() }

    #expect(harness.session.conversation.turns.first?.text == tokyo)
  }

  @Test("a conversation that has been left never listens again")
  func leftConversationStaysStopped() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    await harness.hear(.japanese, tokyo)

    await harness.session.leave(saving: true)
    harness.session.start()
    await harness.session.settle()

    #expect(harness.session.status == .paused(.leaving))
    #expect(harness.transcription.requests.count == 1)
  }

  @Test("pausing while a translation plays stops it and drops the rest of the queue")
  func pauseDuringPlayback() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()
    await harness.hear(.japanese, tokyo)
    await harness.hear(.japanese, three)
    harness.playback.holdsSpeech = true

    harness.time.advance(1.3)
    harness.session.tick()
    for _ in 0..<100 where harness.playback.spoken.isEmpty { await Task.yield() }
    harness.session.pause()
    await harness.session.settle()

    #expect(harness.playback.spoken.count == 1)
    #expect(harness.session.speakingSentenceID == nil)
  }

  @Test("muting while a translation plays stops the queue and opens the microphone again")
  func muteDuringPlayback() async {
    let harness = ConversationHarness()
    harness.playback.reachesMicrophone = true
    await harness.startAndWaitForListening()
    await harness.hear(.japanese, tokyo)
    await harness.hear(.japanese, three)
    harness.playback.holdsSpeech = true

    harness.time.advance(1.3)
    harness.session.tick()
    for _ in 0..<100 where harness.playback.spoken.isEmpty { await Task.yield() }
    harness.session.switchMode(to: .textOnly)
    await harness.session.settle()

    #expect(harness.playback.spoken.count == 1)
    #expect(harness.transcription.hearing.last == true)
    #expect(harness.session.status == .live)
  }

  @Test("Listening on the speaker closes the microphone while each translation plays")
  func listeningOnSpeaker() async {
    let harness = ConversationHarness(mode: .listening)
    harness.playback.reachesMicrophone = true
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, "続いてスポーツです。")

    #expect(harness.playback.spoken.count == 1)
    #expect(harness.transcription.hearing == [false, true])
  }

  @Test("final translations get recent sentences as context")
  func translationContext() async {
    let harness = ConversationHarness()
    await harness.startAndWaitForListening()

    await harness.hear(.japanese, tokyo)
    await harness.pause(for: 1.3)
    await harness.hear(.english, shibuya)

    let finals = harness.translator.calls.filter { $0.text == shibuya }
    #expect(finals.last?.contextCount == 1)
  }
}
