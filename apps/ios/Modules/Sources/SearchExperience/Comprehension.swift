import Foundation

struct Comprehension: Equatable, Sendable {
  let knownCount: Int
  let totalCount: Int

  var fraction: Double? {
    totalCount > 0 ? Double(knownCount) / Double(totalCount) : nil
  }

  var percentText: String? {
    fraction.map { $0.formatted(.percent.precision(.fractionLength(0))) }
  }

  static let linesPerCall = 50

  static func countedWords(
    in lines: [String], analysis: JapaneseTextAnalysisClient
  ) async -> [LanguageReferenceID]? {
    var words: [LanguageReferenceID] = []
    for start in stride(from: 0, to: lines.count, by: linesPerCall) {
      let end = min(start + linesPerCall, lines.count)
      words += await analysis.countedWords(Array(lines[start..<end]))
      guard !Task.isCancelled else { return nil }
    }
    return words
  }

  init(knownCount: Int, totalCount: Int) {
    self.knownCount = knownCount
    self.totalCount = totalCount
  }

  init(words: [LanguageReferenceID], isKnown: (LanguageReferenceID) -> Bool) {
    self.init(knownCount: words.filter(isKnown).count, totalCount: words.count)
  }
}
