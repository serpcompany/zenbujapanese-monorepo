import Foundation
import Observation

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
  let examples: [LinkedExample]
  let listed: Int
  let countText: String?
}

struct ExampleBatch: Hashable, Sendable {
  let from: Int
  var limit: Int?
}

struct EntryExamples: Sendable {
  let page: ExamplePage
  let count: Int
  let truncated: Bool
}

@MainActor
@Observable
final class LoadedExamples {
  typealias Read = @MainActor (ExampleBatch) async -> ExamplePage?

  private(set) var examples: [LinkedExample] = []
  private(set) var countText: String?
  private var source: String?
  private var listed = 0
  private var firstReadFailed = false
  private var laterReadFailed = false
  private var owesRestOfPage = false
  @ObservationIgnored private var readingMoreOf: String?

  var hasMore: Bool { !laterReadFailed && examples.count < listed }

  func answers(_ source: String) -> Bool {
    self.source == source
  }

  func load(_ source: String, rowsOnScreen: Int?, read: Read) async {
    laterReadFailed = false
    if !answers(source) || firstReadFailed {
      let first = await read(ExampleBatch(from: 0, limit: rowsOnScreen))
      guard !Task.isCancelled else { return }
      self.source = source
      firstReadFailed = first == nil
      examples = first?.examples ?? []
      countText = first?.countText
      listed = first?.listed ?? 0
      owesRestOfPage = first.map { $0.examples.count == rowsOnScreen } ?? false
    }
    if owesRestOfPage { await loadMore(read: read) }
  }

  func loadMore(read: Read) async {
    guard hasMore, readingMoreOf != source else { return }
    let (source, from) = (source, examples.count)
    readingMoreOf = source
    defer { if readingMoreOf == source { readingMoreOf = nil } }
    let next = await read(ExampleBatch(from: from))
    guard !Task.isCancelled, self.source == source, examples.count == from else { return }
    guard let next, !next.examples.isEmpty else {
      laterReadFailed = true
      return
    }
    owesRestOfPage = false
    examples += next.examples
    listed = next.listed
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
