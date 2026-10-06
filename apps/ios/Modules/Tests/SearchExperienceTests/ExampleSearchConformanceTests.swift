import Foundation
import Testing

@testable import SearchExperience

@Suite("Example search conformance suite")
struct ExampleSearchConformanceTests {
  static let artifactNames =
    [
      "LanguageReferenceData.sqlite3", "ExampleWordIndex.sqlite3", "Kuromoji/kuromoji.js",
    ] + KuromojiContract.dictionaryFiles.map { "Kuromoji/\($0)" }

  @Test("Example search shows what the suite recorded")
  func exampleSearchMatchesSuite() async throws {
    let url = DetailConformance.suiteURL("example-search.json")
    var suite = try JSONDecoder().decode(ExampleSearchSuite.self, from: Data(contentsOf: url))
    let artifacts = try DetailConformance.artifacts(Self.artifactNames)
    let observer = try await ExampleSearchObserver()

    if DetailConformance.isRecording {
      suite.artifacts = artifacts
      for index in suite.cases.indices {
        suite.cases[index] = try await observer.observe(
          suite.cases[index], tokenLimit: suite.tokenLimit)
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against different artifacts; record it again")
    for expected in suite.cases {
      let observed = try await observer.observe(expected, tokenLimit: suite.tokenLimit)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(differences.isEmpty, "「\(expected.query)」 differs in \(differences)")
    }
  }
}

private struct ExampleSearchObserver {
  let lookupClient = LookupClient.live
  let exampleSentenceClient = ExampleSentenceClient.live
  let textAnalysisClient = JapaneseTextAnalysisClient.resolving(
    morphologyClient: .kuromoji, lookupClient: .live)

  init() async throws {
    guard await textAnalysisClient.availability() == .full else {
      throw ExampleSearchObserverError.textAnalysisUnavailable
    }
  }

  func observe(_ recorded: ExampleSearchCase, tokenLimit: Int) async throws -> ExampleSearchCase {
    var observed = ExampleSearchCase(query: recorded.query, covers: recorded.covers)
    let query = SearchQuery(recorded.query)

    let results = try await lookupClient.search(query)
    observed.count = await SearchResultsScreen.exampleCount(
      results, query: query,
      directCount: await SearchResultsScreen.directExampleCount(
        query, using: exampleSentenceClient),
      using: exampleSentenceClient)
    if let count = observed.count, count > 0 {
      observed.title = SearchResultsScreen.exampleActionTitle(count: count)
    }

    let highlightedEntry = results.primaryEntry(for: query)
    observed.highlightedEntry = highlightedEntry?.id.rawValue
    observed.usesPrimaryEntryExamples = results.usesPrimaryEntryExamples

    let examples = await ExampleSentencesScreen.examples(
      query: query,
      highlightedEntry: highlightedEntry,
      usesHighlightedEntryExamples: results.usesPrimaryEntryExamples,
      using: exampleSentenceClient)
    observed.ids = examples.map(\.id.rawValue)
    var shown: [ExampleSearchCase.Example] = []
    for example in examples.prefix(tokenLimit) {
      let tokens = await textAnalysisClient.linkedTokens(
        example.japanese, query, highlightedEntry)
      let queryRanges = ExampleSentencesScreen.queryScalarRanges(
        in: example.japanese, query: query.value)
      shown.append(
        ExampleSearchCase.Example(
          id: example.id.rawValue,
          japanese: example.japanese,
          english: example.english,
          tokens: tokens.map { token in
            ExampleSearchCase.Token(
              surface: token.surface,
              entry: token.recordedEntryID,
              candidates: token.recordedCandidateIDs,
              queryMatch: queryRanges.contains { $0.overlaps(token.scalarRange) } ? true : nil
            )
          }
        ))
    }
    observed.shown = shown
    return observed
  }
}

private enum ExampleSearchObserverError: Error {
  case textAnalysisUnavailable
}

private struct ExampleSearchSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifacts: [ConformanceArtifact]?
  let tokenLimit: Int
  var cases: [ExampleSearchCase]
}

private struct ExampleSearchCase: Codable {
  let query: String
  let covers: String?
  var count: Int?
  var title: String?
  var highlightedEntry: String?
  var usesPrimaryEntryExamples: Bool?
  var ids: [String]?
  var shown: [Example]?

  init(query: String, covers: String?) {
    self.query = query
    self.covers = covers
  }

  struct Example: Codable {
    let id: String
    let japanese: String
    let english: String
    let tokens: [Token]
  }

  struct Token: Codable {
    let surface: String
    let entry: String?
    let candidates: [String]?
    let queryMatch: Bool?
  }
}
