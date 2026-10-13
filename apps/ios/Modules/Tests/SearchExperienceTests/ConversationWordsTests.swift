import Foundation
import Testing
import TranslatorCore

@testable import SearchExperience

@MainActor
@Suite("Conversation comprehension")
struct ConversationWordsTests {
  private let analysis = JapaneseTextAnalysisClient(
    availability: { .full },
    linkedTokens: { _, _, _ in [] },
    countedWords: { lines in
      lines.flatMap { $0.split(separator: " ") }.filter { $0 != "は" }
        .map { LanguageReferenceID(rawValue: String($0)) }
    })

  @Test("counts the Japanese that was spoken, without particles or translations into Japanese")
  func countsSpokenJapanese() async {
    let startedAt = Date(timeIntervalSince1970: 1_800_000_000)
    let conversation = Conversation(
      startedAt: startedAt, mode: .conversation,
      turns: [
        ConversationTurn(
          language: .japanese, startedAt: startedAt,
          sentences: [TranslatedSentence(text: "今日 は 東京駅", translation: "Today, Tokyo Station")]),
        ConversationTurn(
          language: .english, startedAt: startedAt,
          sentences: [TranslatedSentence(text: "Great.", translation: "いい です")]),
      ])
    let words = ConversationWords()
    let known: (LanguageReferenceID) -> Bool = { $0.rawValue == "今日" }

    #expect(words.comprehension(of: conversation, analysis: analysis, isKnown: known) == nil)
    for _ in 0..<50 where words.comprehension(of: conversation, analysis: analysis, isKnown: known) == nil {
      await Task.yield()
    }
    let comprehension = words.comprehension(of: conversation, analysis: analysis, isKnown: known)
    #expect(comprehension == Comprehension(knownCount: 1, totalCount: 2))
    #expect(comprehension?.percentText == "50%")
  }
}
