@testable import SearchExperience

extension JapaneseTextAnalysisClient {
  static let eachLineOneWord = JapaneseTextAnalysisClient(
    availability: { .reduced },
    linkedTexts: { texts, _ in texts.map(JapaneseTextToken.unlinked) },
    countedWords: { _ in [] })
}
