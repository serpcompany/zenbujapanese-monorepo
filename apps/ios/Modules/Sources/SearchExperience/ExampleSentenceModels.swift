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

struct ExampleSentence: Hashable, Identifiable, Sendable {
  let id: ExampleSentenceID
  let japanese: String
  let english: String
}

struct LinkedExample: Identifiable, Sendable {
  let sentence: ExampleSentence
  let words: [JapaneseTextToken]

  var id: ExampleSentenceID { sentence.id }
}

struct ExamplePage: Sendable {
  static let empty = ExamplePage(examples: [], listed: 0, countText: nil)

  let examples: [LinkedExample]
  let listed: Int
  let countText: String?
}

struct EntryExamples: Sendable {
  let page: ExamplePage
  let count: Int
  let truncated: Bool
}

struct LoadedExamples: Sendable {
  private(set) var examples: [LinkedExample] = []
  private(set) var countText: String?
  private var source: String?
  private var listed = 0

  var hasMore: Bool { examples.count < listed }

  func holds(_ source: String) -> Bool {
    self.source == source
  }

  mutating func add(_ page: ExamplePage, from: Int, of source: String) {
    if from == 0 {
      self.source = source
      examples = page.examples
      countText = page.countText
      listed = page.listed
    } else if holds(source), from == examples.count {
      examples += page.examples
      listed = page.examples.isEmpty ? examples.count : page.listed
    }
  }
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
