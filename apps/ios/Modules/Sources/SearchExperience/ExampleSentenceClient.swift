import Foundation
import SQLite3

struct ExampleSentenceClient: Sendable {
  var retrieve: @Sendable (ExampleSentenceRetrievalRequest) async throws
    -> ExampleSentenceRetrievalResult
  private var entryExamples: @Sendable (DictionaryEntry) async throws -> [ExampleSentence]

  init(
    retrieve:
      @escaping @Sendable (ExampleSentenceRetrievalRequest) async throws
      -> ExampleSentenceRetrievalResult,
    entryExamples: (@Sendable (DictionaryEntry) async throws -> [ExampleSentence])? = nil
  ) {
    self.retrieve = retrieve
    self.entryExamples =
      entryExamples ?? { entry in
        try await retrieve(.dictionaryEntry(entry)).sentences
      }
  }

  static let live = ExampleSentenceClient(
    retrieve: { request in try await ExampleSentenceData.shared.retrieve(request) }
  )

  func examples(_ entry: DictionaryEntry) async throws -> [ExampleSentence] {
    try await entryExamples(entry)
  }

  func count(_ query: SearchQuery) async throws -> Int {
    try await retrieve(query.isASCII ? .directEnglish(query) : .directJapanese(query))
      .count.compatibilityValue
  }

  func search(_ query: SearchQuery) async throws -> [ExampleSentence] {
    try await retrieve(query.isASCII ? .directEnglish(query) : .directJapanese(query)).sentences
  }
}

actor ExampleSentenceData {
  static let policyVersion = "ExampleSentenceRetrievalPolicy/v1"
  static let indexSchemaVersion = "zenbu.example-sentence-retrieval-index.v2"
  static let pairIDScheme = "esp1-sha256-128-nfc-length-prefixed"
  static let porterTable = "example_sentence_english_porter_fts"
  static let exactTable = "example_sentence_english_exact_fts"
  static let mapTable = "example_sentence_fts_map"
  static let shared = ExampleSentenceData(databaseURL: nil)

  static let wordIndexSchema = "zenbu.example-word-index.v1"

  let databaseURL: URL?
  let wordIndexURL: URL?
  var connection: SQLiteConnection?
  var baseIsValidated = false
  var englishIndexIsValidated = false
  var porterProbeIsCreated = false
  var wordIndexIsAttached = false

  init(databaseURL: URL?, wordIndexURL: URL? = nil) {
    self.databaseURL = databaseURL
    self.wordIndexURL =
      wordIndexURL
      ?? (databaseURL == nil
        ? Bundle.module.url(forResource: "ExampleWordIndex", withExtension: "sqlite3") : nil)
  }

  func retrieve(_ request: ExampleSentenceRetrievalRequest) throws -> ExampleSentenceRetrievalResult {
    do {
      switch request {
      case .directEnglish(let query):
        return try retrieveEnglish(query)
      case .directJapanese(let query):
        return try retrieveJapanese(query)
      case .dictionaryEntry(let id, let selectedForm, let writtenForms, let reading):
        return try retrieveEntry(
          id: id,
          selectedForm: selectedForm,
          writtenForms: writtenForms,
          reading: reading
        )
      }
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as ExampleSentenceRetrievalError {
      throw error
    } catch {
      throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
    }
  }

  func result(matches: [ExampleSentenceMatch]) -> ExampleSentenceRetrievalResult {
    ExampleSentenceRetrievalResult(
      matches: Array(matches.prefix(100)),
      count: matches.count > 50 ? .moreThan50 : .exact(matches.count),
      isTruncated: matches.count > 100,
      policyVersion: Self.policyVersion
    )
  }

  func graphemeRange(of needle: String, in text: String) -> ExampleSentenceMatchedRange? {
    guard let range = text.range(of: needle) else { return nil }
    return ExampleSentenceMatchedRange(
      location: text[..<range.lowerBound].count,
      length: text[range].count
    )
  }

  func graphemeRange(
    in text: String,
    utf8Start: Int,
    utf8End: Int
  ) -> ExampleSentenceMatchedRange? {
    guard utf8Start >= 0, utf8End >= utf8Start, utf8End <= text.utf8.count else { return nil }
    let startUTF8 = text.utf8.index(text.utf8.startIndex, offsetBy: utf8Start)
    let endUTF8 = text.utf8.index(text.utf8.startIndex, offsetBy: utf8End)
    guard let start = String.Index(startUTF8, within: text),
      let end = String.Index(endUTF8, within: text)
    else { return nil }
    return ExampleSentenceMatchedRange(
      location: text[..<start].count,
      length: text[start..<end].count
    )
  }

  func utf8Substring(_ text: String, from start: Int, to end: Int) -> String? {
    guard start >= 0, end >= start, end <= text.utf8.count else { return nil }
    let lower = text.utf8.index(text.utf8.startIndex, offsetBy: start)
    let upper = text.utf8.index(text.utf8.startIndex, offsetBy: end)
    guard let lowerIndex = String.Index(lower, within: text),
      let upperIndex = String.Index(upper, within: text)
    else { return nil }
    return String(text[lowerIndex..<upperIndex])
  }

  func ranksBefore(
    _ left: ExampleSentenceMatch,
    _ right: ExampleSentenceMatch
  ) -> Bool {
    rankTuple(left) < rankTuple(right)
  }

  private func rankTuple(_ match: ExampleSentenceMatch) -> RankTuple {
    RankTuple(
      lexicalRelation: match.rankInputs.lexicalRelation.rawValue,
      matchPosition: match.rankInputs.matchPosition,
      englishTermCount: match.rankInputs.englishTermCount,
      japaneseGraphemeCount: match.rankInputs.japaneseGraphemeCount,
      pairID: match.rankInputs.pairID
    )
  }

  func invalid(_ reason: ExampleSentenceInvalidQueryReason) -> ExampleSentenceRetrievalError {
    .invalidQuery(reason)
  }

  func unavailable(
    _ reason: ExampleSentenceRetrievalUnavailableReason
  ) -> ExampleSentenceRetrievalError {
    .retrievalUnavailable(reason)
  }
}

private struct RankTuple: Comparable {
  let lexicalRelation: Int
  let matchPosition: Int
  let englishTermCount: Int
  let japaneseGraphemeCount: Int
  let pairID: ExampleSentenceID

  static func < (left: RankTuple, right: RankTuple) -> Bool {
    if left.lexicalRelation != right.lexicalRelation {
      return left.lexicalRelation < right.lexicalRelation
    }
    if left.matchPosition != right.matchPosition {
      return left.matchPosition < right.matchPosition
    }
    if left.englishTermCount != right.englishTermCount {
      return left.englishTermCount < right.englishTermCount
    }
    if left.japaneseGraphemeCount != right.japaneseGraphemeCount {
      return left.japaneseGraphemeCount < right.japaneseGraphemeCount
    }
    return left.pairID < right.pairID
  }
}
