import Foundation

/// How much of a text's vocabulary the learner knows, counted per word occurrence.
///
/// Only dictionary words count: particles, auxiliaries, punctuation, and text the dictionary
/// doesn't recognize are left out, so the figure reflects vocabulary rather than grammar.
struct Comprehension: Equatable, Sendable {
  let knownCount: Int
  let totalCount: Int

  /// The known share from 0 to 1, or nil when the text has no countable words.
  var fraction: Double? {
    totalCount > 0 ? Double(knownCount) / Double(totalCount) : nil
  }

  /// A whole percentage for display, such as "72%".
  var percentText: String? {
    fraction.map { $0.formatted(.percent.precision(.fractionLength(0))) }
  }

  /// The dictionary word each countable occurrence resolves to, in text order.
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
