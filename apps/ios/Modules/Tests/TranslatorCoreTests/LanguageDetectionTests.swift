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

  @Test("Conversation plays each turn when it ends, and Listening plays each translation as it arrives")
  func modes() {
    #expect(TranslateMode.conversation.playback == .afterEachTurn)
    #expect(TranslateMode.listening.playback == .asTranslated)
    #expect(TranscriptionRequest(mode: .listening).languages == [.japanese, .english])
  }
}

@Suite("Bilingual transcript merging")
struct BilingualTranscriptMergerTests {
  private let start = Date(timeIntervalSince1970: 1_800_000_000)

  private func result(
    _ language: SpokenLanguage, _ text: String, confidence: Double?, final: Bool = true,
    start: TimeInterval? = nil, end: TimeInterval
  ) -> TranscriberResult {
    TranscriberResult(
      language: language, text: text, confidence: confidence, isFinal: final, start: start,
      end: end)
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
    #expect(merger.flush(at: start.addingTimeInterval(1.5)).isEmpty)
    #expect(
      merger.flush(at: start.addingTimeInterval(2.1)) == [.final(.japanese, "続いてスポーツです。")])
  }

  @Test("a recognizer's unfinished second sentence is waited for, not dropped")
  func waitsForSecondSentence() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(result(.english, "Thank you.", confidence: 0.9, end: 1), at: start)
    _ = merger.receive(
      result(.english, "See you", confidence: nil, final: false, end: 1.6), at: start)
    _ = merger.receive(
      result(.japanese, "サンキューシーユーゼア。", confidence: 0.7, end: 2.1),
      at: start.addingTimeInterval(0.7))
    #expect(merger.flush(at: start.addingTimeInterval(1.2)).isEmpty)
    #expect(
      merger.receive(
        result(.english, "See you there.", confidence: 0.9, end: 2), at: start.addingTimeInterval(1.4))
        == [.final(.english, "Thank you."), .final(.english, "See you there.")])
  }

  @Test("a late final that mostly covers speech already emitted is dropped")
  func lateOverlappingFinal() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.english, "I want to go to Kyoto tomorrow.", confidence: 0.91, start: 58.9, end: 63.9),
      at: start)
    #expect(
      merger.flush(at: start.addingTimeInterval(0.5))
        == [.final(.english, "I want to go to Kyoto tomorrow.")])
    #expect(
      merger.receive(
        result(.japanese, "Ianto Go to Koo Tomorrow", confidence: 0.63, start: 59.8, end: 65.1),
        at: start.addingTimeInterval(1)
      ).isEmpty)
    #expect(!merger.isWaitingForCounterpart)
  }

  @Test("a dropped late final takes its unfinished live text with it")
  func lateFinalClearsLiveText() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.english, "I want to go to Kyoto tomorrow.", confidence: 0.91, start: 58.9, end: 63.9),
      at: start)
    _ = merger.flush(at: start.addingTimeInterval(0.5))
    #expect(
      merger.receive(
        result(.japanese, "Ianto Go", confidence: nil, final: false, start: 59.8, end: 64.6),
        at: start.addingTimeInterval(0.6)) == [.volatile(.japanese, "Ianto Go")])
    #expect(
      merger.receive(
        result(.japanese, "Ianto Go to Koo Tomorrow", confidence: 0.63, start: 59.8, end: 65.1),
        at: start.addingTimeInterval(1)) == [.volatile(.japanese, "")])
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

  @Test("a confident one-letter guess doesn't take a real sentence's place")
  func oneLetterGuessLosesToARealSentence() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(result(.japanese, "あ", confidence: 0.98, end: 1.5), at: start)
    #expect(
      merger.receive(result(.english, "Thank you.", confidence: 0.9, end: 1.5), at: start)
        == [.final(.english, "Thank you.")])
  }

  @Test("a guess too doubtful to translate doesn't make the real sentence after it late")
  func doubtfulGuessKeepsTheRealSentence() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.japanese, "今日は東京駅に行きます。", confidence: nil, final: false, start: 0, end: 8.8),
      at: start)
    _ = merger.receive(
      result(.english, "Go back, Tokyo making ikimas.", confidence: 0.27, start: 6, end: 8.76),
      at: start.addingTimeInterval(0.9))
    #expect(merger.flush(at: start.addingTimeInterval(2.1)) == [.final(.japanese, "")])
    _ = merger.receive(
      result(.japanese, "今日は東京駅に行きます。", confidence: 0.86, start: 6, end: 11.22),
      at: start.addingTimeInterval(2.8))
    #expect(
      merger.flush(at: start.addingTimeInterval(3.3))
        == [.final(.japanese, "今日は東京駅に行きます。")])
  }

  @Test(
    "each sentence is its own final, so it's translated and played as soon as it's ready",
    arguments: [
      (
        SpokenLanguage.japanese, ["明日は朝 8時に新宿駅で待ち合わせします。吉祥寺に行きます。その後"],
        ["明日は朝 8時に新宿駅で待ち合わせします。", "吉祥寺に行きます。", "その後"]
      ),
      (.japanese, ["はい、", "三時に会いましょう。"], ["はい、三時に会いましょう。"]),
      (.japanese, ["明日は 3.5キロ走ります。"], ["明日は 3.5キロ走ります。"]),
      (.japanese, ["大丈夫?はい。"], ["大丈夫?", "はい。"]),
      (.english, ["Thank you.", "See you there."], ["Thank you.", "See you there."]),
      (.english, ["Please meet me", "at Shibuya Station."], ["Please meet me at Shibuya Station."]),
      (.english, ["Oh, Dr. Keeney, I hope you enjoyed it."], ["Oh, Dr. Keeney, I hope you enjoyed it."]),
    ])
  func sentences(language: SpokenLanguage, results: [String], expected: [String]) {
    #expect(language.sentences(in: results) == expected)
  }

  @Test("a doubtful second guess at speech already shown in the other language is dropped")
  func doubtfulGuessAtShownSpeech() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.english, "Hi, Sanjini.", confidence: 0.41, start: 31.92, end: 33.42), at: start)
    _ = merger.receive(
      result(.japanese, "はい 3時", confidence: 0.8, start: 32.1, end: 34.8),
      at: start.addingTimeInterval(1.1))
    #expect(merger.flush(at: start.addingTimeInterval(1.6)) == [.final(.japanese, "はい 3時")])
    #expect(
      merger.receive(
        result(.english, "Hi", confidence: 0.4, start: 33.42, end: 36.42),
        at: start.addingTimeInterval(2.8)
      ).isEmpty)
    #expect(merger.flush(at: start.addingTimeInterval(3.3)).isEmpty)
    _ = merger.receive(
      result(.japanese, "", confidence: nil, start: 43.8, end: 45.5), at: start.addingTimeInterval(11))
    #expect(
      merger.receive(
        result(.english, "Thank you.", confidence: 0.9, start: 43.92, end: 45.48),
        at: start.addingTimeInterval(11)) == [.final(.english, "Thank you.")])
  }

  @Test("a quick reply after the shown sentence isn't measured against the other language's guess")
  func replyAfterShownSpeech() {
    var merger = BilingualTranscriptMerger(languages: [.japanese, .english])
    _ = merger.receive(
      result(.japanese, "はい、3時に会いましょう。", confidence: 0.8, start: 32.1, end: 34.8), at: start)
    _ = merger.receive(
      result(.english, "Hi, Sanjini, my show.", confidence: 0.3, start: 31.9, end: 36),
      at: start.addingTimeInterval(0.1))
    #expect(merger.flush(at: start.addingTimeInterval(0.6)) == [.final(.japanese, "はい、3時に会いましょう。")])
    _ = merger.receive(
      result(.japanese, "", confidence: nil, start: 35.2, end: 37), at: start.addingTimeInterval(2))
    #expect(
      merger.receive(
        result(.english, "Okay, see you.", confidence: 0.5, start: 35.2, end: 37),
        at: start.addingTimeInterval(2)) == [.final(.english, "Okay, see you.")])
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
