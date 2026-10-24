import Foundation
import SQLite3

struct ResultsExamplesRequest: Encodable, Sendable {
  let query: String
  let primaryEntry: String?
  let usesPrimaryEntryExamples: Bool
  var batch = ExampleBatch(from: 0)

  private enum CodingKeys: String, CodingKey {
    case query
    case primaryEntry
    case usesPrimaryEntryExamples
    case from
    case limit
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(query, forKey: .query)
    try container.encode(primaryEntry, forKey: .primaryEntry)
    try container.encode(usesPrimaryEntryExamples, forKey: .usesPrimaryEntryExamples)
    try container.encode(batch.from, forKey: .from)
    try container.encodeIfPresent(batch.limit, forKey: .limit)
  }
}

private struct EntryExamplesRequest: Encodable {
  let id: String
  let from: Int
  let limit: Int?
}

private struct MeaningExamplesRequest: Encodable {
  let id: String
}

private struct FormExamplesRequest: Encodable {
  let form: String
  let from: Int
  let limit: Int?
}

struct LinkedExamples: Decodable, Sendable {
  struct Example: Decodable, Sendable {
    let id: ExampleSentenceID
    let japanese: String
    let english: String
    let words: [LinkedWord]
  }

  let examples: [Example]
  let listed: Int
  let cutShort: Bool
  let countText: String?
}

struct LinkedMeaningExample: Decodable, Sendable {
  let number: Int
  let example: LinkedExamples.Example
}

struct LinkedEntryExamples: Decodable, Sendable {
  let page: LinkedExamples
  let count: Int
  let truncated: Bool

  private enum CodingKeys: String, CodingKey {
    case count
    case truncated
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    page = try LinkedExamples(from: decoder)
    count = try container.decode(Int.self, forKey: .count)
    truncated = try container.decode(Bool.self, forKey: .truncated)
  }
}

struct LinkedText: Encodable, Sendable {
  let text: String
  let query: String
  let highlightedEntry: String?

  private enum CodingKeys: String, CodingKey {
    case text
    case query
    case highlightedEntry
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(text, forKey: .text)
    try container.encode(query, forKey: .query)
    try container.encode(highlightedEntry, forKey: .highlightedEntry)
  }
}

struct LinkedWord: Decodable, Sendable {
  let surface: String
  let start: Int
  let end: Int
  let reading: String?
  let isFunctionWord: Bool
  let entry: String?
  let candidates: [String]
  let furigana: String?
  let ruby: [JapaneseRubySegment]?
  let accent: JapaneseTextToken.Accent?
  let attaches: String?
}

actor DictionaryTextData {
  static let shared = DictionaryTextData()

  private let databaseURL: URL?
  private let wordIndexURL: URL?
  private let morphology: JapaneseMorphologyClient?
  private let tokenizerFile: @Sendable (String) -> InflatedBytes?
  private var core: DictionaryCore?
  private var linkingAnswersToFail = LaunchHarness.failsLinkingAnswers
  private let queue = DispatchSerialQueue(label: "com.zenbujapanese.dictionary-text-data")

  nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }

  init(
    databaseURL: URL? = nil,
    wordIndexURL: URL? = nil,
    morphology: JapaneseMorphologyClient? = nil,
    tokenizerFile: @escaping @Sendable (String) -> InflatedBytes? = TokenizerDictionary.unpacked
  ) {
    self.databaseURL = databaseURL
    self.wordIndexURL = wordIndexURL
    self.morphology = morphology
    self.tokenizerFile = tokenizerFile
  }

  func exampleCount(_ query: String) async throws -> Int {
    try await answer("exampleCount", query)
  }

  func resultsExampleCount(_ request: ResultsExamplesRequest) async throws -> Int {
    try await answer("resultsExampleCount", try DictionaryCore.argument(request))
  }

  func resultsExamples(_ request: ResultsExamplesRequest) async throws -> LinkedExamples {
    try await linked("resultsExamples", request)
  }

  func entryExamples(
    _ id: LanguageReferenceID, _ batch: ExampleBatch
  ) async throws -> LinkedEntryExamples {
    try await linked(
      "entryExamples",
      EntryExamplesRequest(id: id.rawValue, from: batch.from, limit: batch.limit))
  }

  func meaningExamples(_ id: LanguageReferenceID) async throws -> [LinkedMeaningExample] {
    if LaunchHarness.failsMeaningExamples {
      throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
    }
    return try await answer(
      "meaningExamples", try DictionaryCore.argument(MeaningExamplesRequest(id: id.rawValue)))
  }

  func formExamples(_ form: String, _ batch: ExampleBatch) async throws -> LinkedExamples {
    try await linked(
      "formExamples", FormExamplesRequest(form: form, from: batch.from, limit: batch.limit))
  }

  func linkedWords(_ text: LinkedText) async throws -> [LinkedWord] {
    try await linked("linkedTokens", text)
  }

  private func linked<Answer: Decodable>(
    _ method: String, _ request: some Encodable
  ) async throws -> Answer {
    try await LaunchHarness.heldLinking?.wait()
    if linkingAnswersToFail > 0 {
      linkingAnswersToFail -= 1
      throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
    }
    return try await answer(method, try DictionaryCore.argument(request))
  }

  func countedWords(_ lines: [String]) async throws -> [String] {
    try await answer("countedWords", try DictionaryCore.argument(lines))
  }

  func availability() async -> JapaneseTextAnalysisAvailability {
    if let morphology { return await morphology.availability() }
    guard let core = try? preparedCore(), (try? core.flag("tokenizerReady", "")) == true
    else { return .reduced }
    return .full
  }

  private func answer<Answer: Decodable>(
    _ method: String, _ argument: String
  ) async throws -> Answer {
    let core: DictionaryCore
    do {
      core = try preparedCore()
    } catch {
      try Task<Never, Never>.checkCancellation()
      throw error
    }
    return try await core.answer(method, argument, analyzingWith: morphology)
  }

  private func preparedCore() throws -> DictionaryCore {
    if let core { return core }
    guard let database = databaseURL ?? Bundle.languageReferenceDataURL,
      let wordIndex = wordIndexURL
        ?? BundledData.bundle.url(forResource: "ExampleWordIndex", withExtension: "sqlite3")
    else { throw ExampleSentenceRetrievalError.retrievalUnavailable(.missingBundledData) }
    let prepared = try DictionaryCore(
      statements: try SQLiteStatements(reading: database, attaching: ["word_index": wordIndex]),
      tokenizerFile: morphology == nil ? tokenizerFile : nil)
    let _: Bool = try prepared.answer("checkExamples", "")
    core = prepared
    return prepared
  }
}
