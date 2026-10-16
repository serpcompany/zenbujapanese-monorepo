@testable import SearchExperience

extension JapaneseTextAnalysisClient {
  static let eachLineOneWord = JapaneseTextAnalysisClient(
    availability: { .reduced },
    linkedTokens: { text, _, _ in
      [
        JapaneseTextToken(
          id: 0, surface: text, entry: nil, scalarRange: 0..<text.unicodeScalars.count)
      ]
    },
    countedWords: { _ in [] })
}
