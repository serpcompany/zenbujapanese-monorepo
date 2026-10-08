import Testing
import TranslatorCore

@testable import TranslateReplay

private let script = Script(
  mode: .conversation,
  minimumRecall: 0.8,
  lines: [
    ScriptLine(language: .japanese, say: "今日は東京駅に行きます。"),
    ScriptLine(
      language: .english, say: "Please meet me at three o'clock.",
      heard: "Please meet me at 3 o'clock."),
  ])

@Test func aConversationHeardExactlyPasses() {
  let score = Scoring.score(
    script,
    heard: [
      [HeardSentence(language: .japanese, text: "今日は東京駅に行きます。")],
      [HeardSentence(language: .english, text: "Please meet me at 3 o'clock.")],
    ])

  #expect(score.lines.map(\.recall) == [1, 1])
  #expect(score.passes)
}

@Test func lostWordsLowerTheLinesRecall() {
  let score = Scoring.score(
    script,
    heard: [
      [HeardSentence(language: .japanese, text: "に行きます。")],
      [HeardSentence(language: .english, text: "Please meet me at 3 o'clock.")],
    ])

  #expect(score.lines[0].recall == 5.0 / 11.0)
  #expect(score.missedLines.map(\.expected) == ["今日は東京駅に行きます。"])
  #expect(!score.passes)
}

@Test func aSentenceThatIsntInTheScriptIsAPhantom() {
  let score = Scoring.score(
    script,
    heard: [
      [HeardSentence(language: .japanese, text: "今日は東京駅に行きます。")],
      [HeardSentence(language: .english, text: "Hi, Sanjini.")],
      [HeardSentence(language: .english, text: "Please meet me at 3 o'clock.")],
    ])

  #expect(score.phantoms.map(\.text) == ["Hi, Sanjini."])
  #expect(score.languagesMatch)
  #expect(!score.passes)
}

@Test func aLineHeardInTheWrongLanguageFailsItsTurnOrder() {
  let score = Scoring.score(
    script,
    heard: [
      [HeardSentence(language: .japanese, text: "今日は東京駅に行きます。")],
      [HeardSentence(language: .japanese, text: "Please meet me at 3 o'clock.")],
    ])

  #expect(score.wrongLanguageLines.map(\.language) == [.english])
  #expect(score.heardLanguages == [.japanese])
  #expect(!score.languagesMatch)
}

@Test func sentencesOfOneTurnStayTogether() {
  let score = Scoring.score(
    script,
    heard: [
      [
        HeardSentence(language: .japanese, text: "今日は"),
        HeardSentence(language: .japanese, text: "東京駅に行きます。"),
      ],
      [HeardSentence(language: .english, text: "Please meet me at 3 o'clock.")],
    ])

  #expect(score.turns.map(\.count) == [2, 1])
  #expect(score.turns[0].map(\.line) == [0, 0])
}

@Test func playbackDelayRunsFromTheVoicesEndToTheFirstSentenceSpoken() {
  let log = """
       0.00 start ["ja", "en"]
       0.50 audio starts
       3.10 ja F 0.20-2.50 c=0.81 今日は東京駅に行きます。
       3.40 pause after voice at 2.00
       4.30 speak en I'm going to Tokyo Station today.
       6.10 pause after voice at 5.10
       6.20 speak en It's a nice day.
       7.40 en F 5.20-7.30 c=0.12 , Tokyo, Tabani.
       8.10 speak en It's a nice day, again.
       9.20 pause after voice at 8.00
       9.30 en F 6.10-8.40 c=0.92 Yes.
      10.00 speak ja はい。
    """

  let delays = EventLog.playbackDelays(in: log)

  #expect(delays.map(\.text) == ["I'm going to Tokyo Station today.", "はい。"])
  #expect(delays.map(\.spokenAt) == [4.3, 10])
  #expect(zip(delays.map(\.afterSpeech), [1.8, 1.5]).allSatisfy { abs($0 - $1) < 0.001 })
}
