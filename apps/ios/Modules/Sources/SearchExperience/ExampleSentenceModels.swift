import Foundation

struct ExampleSentenceID: RawRepresentable, Hashable, Sendable {
  private static let prefix = "esp1_"
  private static let hexDigits = 32

  let rawValue: String

  init?(rawValue: String) {
    guard rawValue.count == Self.prefix.count + Self.hexDigits,
      rawValue.hasPrefix(Self.prefix),
      rawValue.dropFirst(Self.prefix.count).allSatisfy({
        ("0"..."9").contains($0) || ("a"..."f").contains($0)
      })
    else { return nil }
    self.rawValue = rawValue
  }
}

extension ExampleSentenceID: Decodable {}

struct ExampleSentence: Decodable, Hashable, Identifiable, Sendable {
  let id: ExampleSentenceID
  let japanese: String
  let english: String
}

struct ListedExamples: Decodable, Sendable {
  static let none = ListedExamples(sentences: [], countText: nil)

  let sentences: [ExampleSentence]
  let countText: String?
}

enum ExampleSentenceInvalidQueryReason: Hashable, Sendable {
  case missingEntryEvidence
}

enum ExampleSentenceRetrievalUnavailableReason: Hashable, Sendable {
  case missingBundledData
  case queryFailed
}

enum ExampleSentenceRetrievalError: Error, Hashable, Sendable {
  case invalidQuery(ExampleSentenceInvalidQueryReason)
  case retrievalUnavailable(ExampleSentenceRetrievalUnavailableReason)
}
