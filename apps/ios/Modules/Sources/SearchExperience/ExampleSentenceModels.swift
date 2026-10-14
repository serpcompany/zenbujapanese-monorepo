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
  let cutShort: Bool
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

  enum State: Equatable {
    case loading, failed, empty, listed
  }

  private(set) var examples: [LinkedExample] = []
  private(set) var countText: String?
  private(set) var laterReadFailed = false
  private var source: String?
  private var listed = 0
  private var firstReadFailed = false
  private var readingFirst: String?
  private var owesRestOfPage = false
  @ObservationIgnored private var loads = 0
  @ObservationIgnored private var readingMore:
    (of: String?, from: Int, read: Task<ExamplePage?, Never>)?

  var hasMore: Bool { !laterReadFailed && examples.count < listed }

  func answers(_ source: String) -> Bool {
    self.source == source
  }

  func state(of source: String) -> State {
    guard answers(source), readingFirst != source else { return .loading }
    if firstReadFailed { return .failed }
    return examples.isEmpty ? .empty : .listed
  }

  func load(_ source: String, rowsOnScreen: Int?, read: @escaping Read) async {
    loads += 1
    let thisLoad = loads
    laterReadFailed = false
    readingFirst = nil
    if !answers(source) || firstReadFailed {
      readingFirst = source
      let first = await read(ExampleBatch(from: 0, limit: rowsOnScreen))
      guard loads == thisLoad else { return }
      readingFirst = nil
      guard !Task.isCancelled else { return }
      self.source = source
      firstReadFailed = first == nil
      examples = first?.examples ?? []
      countText = first?.countText
      listed = first?.listed ?? 0
      owesRestOfPage = first?.cutShort ?? false
    }
    if owesRestOfPage { await loadMore(read: read) }
  }

  func loadMore(read: @escaping Read) async {
    guard hasMore else { return }
    let (source, from) = (source, examples.count)
    let underWay = readingMore.flatMap { $0.of == source && $0.from == from ? $0.read : nil }
    let reading = underWay ?? Task { await read(ExampleBatch(from: from)) }
    readingMore = (source, from, reading)
    let next = await reading.value
    if readingMore?.read == reading { readingMore = nil }
    guard self.source == source, examples.count == from else { return }
    guard let next, !next.examples.isEmpty else {
      laterReadFailed = true
      return
    }
    owesRestOfPage = next.cutShort
    examples += next.examples
    listed = next.listed
  }

  func readMoreAgain(read: @escaping Read) async {
    laterReadFailed = false
    await loadMore(read: read)
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
