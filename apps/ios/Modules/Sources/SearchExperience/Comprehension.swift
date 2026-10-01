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

  static func countedWords(in tokens: [JapaneseTextToken]) -> [LanguageReferenceID] {
    tokens.compactMap { token in
      guard !token.isFunctionWord else { return nil }
      return token.entry?.id
    }
  }

  init(knownCount: Int, totalCount: Int) {
    self.knownCount = knownCount
    self.totalCount = totalCount
  }

  init(words: [LanguageReferenceID], isKnown: (LanguageReferenceID) -> Bool) {
    self.init(knownCount: words.filter(isKnown).count, totalCount: words.count)
  }
}
