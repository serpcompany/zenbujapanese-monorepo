import Foundation
import SQLite3

struct ResultsExamplesRequest: Encodable, Sendable {
  let query: String
  let primaryEntry: String?
  let usesPrimaryEntryExamples: Bool

  private enum CodingKeys: String, CodingKey {
    case query
    case primaryEntry
    case usesPrimaryEntryExamples
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(query, forKey: .query)
    try container.encode(primaryEntry, forKey: .primaryEntry)
    try container.encode(usesPrimaryEntryExamples, forKey: .usesPrimaryEntryExamples)
  }
}

struct EntryExamples: Decodable, Sendable {
  let sentences: [ExampleSentence]
  let count: Int
  let truncated: Bool
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
  let isPageWord: Bool
  let matchesQuery: Bool
  let attaches: String?
  let counted: Bool
}

actor DictionaryTextData {
  static let shared = DictionaryTextData()

  private let databaseURL: URL?
  private let wordIndexURL: URL?
  private let morphology: JapaneseMorphologyClient?
  private var core: DictionaryCore?
  private var hasKuromoji = false

  init(
    databaseURL: URL? = nil,
    wordIndexURL: URL? = nil,
    morphology: JapaneseMorphologyClient? = nil
  ) {
    self.databaseURL = databaseURL
    self.wordIndexURL = wordIndexURL
    self.morphology = morphology
  }

  func exampleCount(_ query: String) async throws -> Int {
    try await answer("exampleCount", query)
  }

  func resultsExampleCount(_ request: ResultsExamplesRequest) async throws -> Int {
    try await answer("resultsExampleCount", try DictionaryCore.argument(request))
  }

  func resultsExamples(_ request: ResultsExamplesRequest) async throws -> [ExampleSentence] {
    try await answer("resultsExamples", try DictionaryCore.argument(request))
  }

  func entryExamples(_ id: LanguageReferenceID) async throws -> EntryExamples {
    try await answer("entryExamples", id.rawValue)
  }

  func formExamples(_ form: String) async throws -> [ExampleSentence] {
    try await answer("formExamples", form, analyzing: true)
  }

  func linkedWords(_ text: LinkedText) async throws -> [LinkedWord] {
    try await answer("linkedTokens", try DictionaryCore.argument(text), analyzing: true)
  }

  func availability() async -> JapaneseTextAnalysisAvailability {
    if let morphology { return await morphology.availability() }
    guard let core = try? preparedCore() else { return .reduced }
    return installsKuromoji(in: core) ? .full : .reduced
  }

  private func answer<Answer: Decodable>(
    _ method: String, _ argument: String, analyzing: Bool = false
  ) async throws -> Answer {
    let core: DictionaryCore
    do {
      core = try preparedCore()
    } catch {
      try Task<Never, Never>.checkCancellation()
      throw error
    }
    if analyzing, morphology == nil { _ = installsKuromoji(in: core) }
    return try await core.answer(method, argument, analyzingWith: morphology)
  }

  private func installsKuromoji(in core: DictionaryCore) -> Bool {
    if !hasKuromoji { hasKuromoji = (try? core.installKuromoji()) != nil }
    return hasKuromoji
  }

  private func preparedCore() throws -> DictionaryCore {
    if let core { return core }
    guard let database = databaseURL ?? Bundle.languageReferenceDataURL,
      let wordIndex = wordIndexURL
        ?? Bundle.module.url(forResource: "ExampleWordIndex", withExtension: "sqlite3")
    else { throw ExampleSentenceRetrievalError.retrievalUnavailable(.missingBundledData) }
    let prepared = try DictionaryCore(
      statements: try SQLiteStatements(reading: database, attaching: ["word_index": wordIndex]))
    let _: Bool = try prepared.answer("checkExamples", "")
    core = prepared
    return prepared
  }
}
