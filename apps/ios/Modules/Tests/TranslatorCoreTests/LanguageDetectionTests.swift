import Foundation
import Testing

@testable import TranslatorCore

@Suite("Language detection")
struct LanguageDetectionTests {
  @Test(
    "typed text is Japanese when it has kana or kanji, English when it has only Latin letters",
    arguments: [
      ("駅まで歩いて何分ですか？", SpokenLanguage.japanese),
      ("トイレはどこですか", .japanese),
      ("Suicaカードはどこで買えますか", .japanese),
      ("Where can I buy a Suica card?", .english),
      ("how much is this?", .english),
    ])
  func detectsTypedLanguage(text: String, expected: SpokenLanguage) {
    #expect(SpokenLanguage.detect(in: text) == expected)
  }

  @Test("text without letters has no language")
  func noLanguage() {
    #expect(SpokenLanguage.detect(in: "  123 ？！ ") == nil)
  }

  @Test("sentences join without spaces in Japanese and with spaces in English")
  func joining() {
    #expect(SpokenLanguage.japanese.joined(["はい。", "そうです。"]) == "はい。そうです。")
    #expect(SpokenLanguage.english.joined(["Yes.", "It is."]) == "Yes. It is.")
  }

  @Test("modes switch within a session only when they capture sound the same way")
  func modeFamilies() {
    #expect(TranslateMode.conversation.canSwitchWithinSession(to: .textOnly))
    #expect(!TranslateMode.conversation.canSwitchWithinSession(to: .listening))
    #expect(TranslateMode.listening.listensFor == [.japanese])
    #expect(TranslateMode.textOnly.playback == .never)
  }
}

@Suite("Bilingual transcript merging")
struct BilingualTranscriptMergerTests {
  private let start = Date(timeIntervalSince1970: 1_800_000_000)

  private func result(
    _ language: SpokenLanguage, _ text: String, confidence: Double?, final: Bool = true,
    end: TimeInterval
  ) -> TranscriberResult {
    TranscriberResult(
      language: language, text: text, confidence: confidence, isFinal: final, end: end)
  }

  @Test("Japanese speech wins over the English recognizer's guess")
  func japaneseSpeech() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    #expect(
      merger.receive(result(.japanese, "今日は東京駅に行きます。", confidence: 0.82, end: 2), at: start)
        .isEmpty)
    let events = merger.receive(
      result(.english, "Keo want to Kyoto a key mass", confidence: 0.31, end: 2.1), at: start)
    #expect(events == [.final(.japanese, "今日は東京駅に行きます。")])
  }

  @Test("English speech wins over a katakana transliteration")
  func englishSpeech() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(result(.japanese, "サンキュー。シーユーゼア。", confidence: 0.6, end: 1.5), at: start)
    let events = merger.receive(
      result(.english, "Thank you. See you there.", confidence: 0.55, end: 1.5), at: start)
    #expect(events == [.final(.english, "Thank you. See you there.")])
  }

  @Test("a missing counterpart is waited for briefly, and its late final is dropped")
  func pairingTimeout() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(result(.english, "Thank you.", confidence: 0.9, end: 1), at: start)
    #expect(merger.flush(at: start.addingTimeInterval(0.2)).isEmpty)
    #expect(
      merger.flush(at: start.addingTimeInterval(0.45)) == [.final(.english, "Thank you.")])
    #expect(
      merger.receive(result(.japanese, "サンキュー", confidence: 0.4, end: 1.1), at: start)
        .isEmpty)
    #expect(!merger.isWaitingForCounterpart)
  }

  @Test("a recognizer that splits a sentence in two is joined before choosing")
  func splitSegments() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    #expect(merger.receive(result(.japanese, "はい、", confidence: 0.8, end: 1), at: start).isEmpty)
    #expect(
      merger.receive(result(.english, "Hi some G knee I'm a show", confidence: 0.3, end: 2), at: start)
        .isEmpty)
    let events = merger.receive(
      result(.japanese, "三時に会いましょう。", confidence: 0.85, end: 2), at: start)
    #expect(events == [.final(.japanese, "はい、三時に会いましょう。")])
  }

  @Test("live text shows the language that scores higher")
  func volatileRanking() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.japanese, "プリーズミート", confidence: nil, final: false, end: 0.5), at: start)
    let events = merger.receive(
      result(.english, "Please meet", confidence: nil, final: false, end: 0.5), at: start)
    #expect(events == [.volatile(.english, "Please meet")])
  }

  @Test("speech that both recognizers drop clears the live text")
  func emptyResultsClear() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(result(.english, "Um", confidence: nil, final: false, end: 0.3), at: start)
    #expect(
      merger.receive(result(.english, "", confidence: nil, final: false, end: 0.4), at: start)
        == [.volatile(.japanese, "")])
    _ = merger.receive(result(.japanese, "", confidence: nil, end: 0.5), at: start)
    #expect(
      merger.receive(result(.english, "", confidence: nil, end: 0.5), at: start)
        == [.final(.japanese, "")])
  }

  @Test("a lone guess waits while the other recognizer still hears speech")
  func holdsWhileCounterpartSpeaks() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.japanese, "明日は朝八時に新宿駅で", confidence: nil, final: false, end: 10), at: start)
    #expect(
      merger.receive(
        result(.english, "Asubakasa Hachi, Jing, Jing.", confidence: 0.04, end: 11), at: start
      ).isEmpty)
    _ = merger.receive(
      result(.japanese, "明日は朝八時に新宿駅で待ち合わせして", confidence: nil, final: false, end: 12),
      at: start.addingTimeInterval(0.5))
    #expect(merger.flush(at: start.addingTimeInterval(0.9)).isEmpty)
    _ = merger.receive(
      result(.japanese, "明日は朝八時に新宿駅で待ち合わせします。", confidence: 0.81, end: 23),
      at: start.addingTimeInterval(1))
    #expect(
      merger.flush(at: start.addingTimeInterval(1.5))
        == [.final(.japanese, "明日は朝八時に新宿駅で待ち合わせします。")])
  }

  @Test("a final waits briefly for the other recognizer's unfinished sentence to settle")
  func waitsForCounterpartToSettle() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.english, "Then Osaka on", confidence: nil, final: false, end: 5.5), at: start)
    _ = merger.receive(
      result(.japanese, "Thenos on Friday。", confidence: 0.55, end: 6.1),
      at: start.addingTimeInterval(0.7))
    #expect(merger.flush(at: start.addingTimeInterval(1.2)).isEmpty)
    #expect(
      merger.receive(
        result(.english, "Then Osaka on Friday.", confidence: 0.86, end: 5.9),
        at: start.addingTimeInterval(1.6)) == [.final(.english, "Then Osaka on Friday.")])

    _ = merger.receive(
      result(.english, "Sports", confidence: nil, final: false, end: 9), at: start)
    _ = merger.receive(
      result(.japanese, "続いてスポーツです。", confidence: 0.9, end: 10),
      at: start.addingTimeInterval(1))
    #expect(merger.flush(at: start.addingTimeInterval(2)).isEmpty)
    #expect(
      merger.flush(at: start.addingTimeInterval(2.6)) == [.final(.japanese, "続いてスポーツです。")])
  }

  @Test("live text includes the sentences held for the pause")
  func liveTextIncludesHeldSentences() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.japanese, "オーケー", confidence: nil, final: false, end: 1), at: start)
    _ = merger.receive(
      result(.english, "Okay, here's the plan.", confidence: 0.9, end: 1.5), at: start)
    let events = merger.receive(
      result(.english, "We'll take the train", confidence: nil, final: false, end: 2.5), at: start)
    #expect(events == [.volatile(.english, "Okay, here's the plan. We'll take the train")])
  }

  @Test("leading punctuation is trimmed and punctuation alone is never a sentence")
  func punctuation() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(result(.japanese, "", confidence: nil, end: 2), at: start)
    #expect(
      merger.receive(result(.english, ". Please meet me.", confidence: 0.8, end: 2), at: start)
        == [.final(.english, "Please meet me.")])
    _ = merger.receive(result(.japanese, "", confidence: nil, end: 4), at: start)
    #expect(
      merger.receive(result(.english, "..", confidence: 0.8, end: 4), at: start)
        == [.final(.japanese, "")])
  }

  @Test(
    "a doubtful or one-letter result is not translated",
    arguments: [("はい", 0.26), ("い", 0.19), ("あ", 0.98)])
  func doubtfulResults(text: String, confidence: Double) {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(result(.japanese, text, confidence: confidence, end: 1), at: start)
    #expect(merger.flush(at: start.addingTimeInterval(0.5)) == [.final(.japanese, "")])
    var listening = BilingualTranscriptMerger(languages: [.japanese])
    #expect(
      listening.receive(result(.japanese, text, confidence: confidence, end: 1), at: start)
        == [.final(.japanese, "")])
  }

  @Test("one language passes straight through")
  func singleLanguage() {
    var merger = BilingualTranscriptMerger(languages: [.japanese])
    #expect(
      merger.receive(result(.japanese, "続いてスポーツです。", confidence: nil, end: 1), at: start)
        == [.final(.japanese, "続いてスポーツです。")])
    #expect(
      merger.receive(result(.english, "Sports", confidence: 0.9, end: 2), at: start).isEmpty)
  }
}
