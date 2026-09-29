import Foundation
import Testing

@testable import SearchExperience

/// Checks the Example Sentences screen that Search's "View N Example Sentences" row opens against
/// the app-recorded suite in `apps/ios/LanguageData/Conformance/example-search.json`, so the
/// website's example search can be held to the app. For each query it records what the row
/// counts, which entry the screen highlights, whether it lists that entry's examples (a
/// deinflected or romaji query) or the sentences containing the query, every listed sentence's
/// pair ID in order (at most 100), and the first sentences' words as the screen links and accents
/// them. Each case is read from the models and clients `SearchView` and `ExampleSentencesView`
/// use (`SearchResultsScreen`, `ExampleSentencesScreen`), with the app's default Kuromoji text
/// analysis.
///
/// After an intended change to example search or its data, record it again by running this suite
/// with `TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1`, and review the diff. Recording keeps each case's
/// `query` and `covers` and rewrites the rest.
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

/// Reads one query's example search from the same clients the app gives `SearchView` and
/// `ExampleSentencesView`.
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

    // SearchView.search(_:): the row's count.
    let results = try await lookupClient.search(query)
    observed.count = await SearchResultsScreen.exampleCount(
      results, query: query,
      directCount: await SearchResultsScreen.directExampleCount(
        query, using: exampleSentenceClient),
      using: exampleSentenceClient)
    if let count = observed.count, count > 0 {
      observed.title = SearchResultsScreen.exampleActionTitle(count: count)
    }

    // SearchResultsView's row opens SearchExperienceRoute.examples with these.
    let highlightedEntry = results.primaryEntry(for: query)
    observed.highlightedEntry = highlightedEntry?.id.rawValue
    observed.usesPrimaryEntryExamples = results.usesPrimaryEntryExamples

    // ExampleSentencesView.
    let examples = await ExampleSentencesScreen.examples(
      query: query,
      highlightedEntry: highlightedEntry,
      usesHighlightedEntryExamples: results.usesPrimaryEntryExamples,
      using: exampleSentenceClient)
    observed.ids = examples.map(\.id.rawValue)
    var shown: [ExampleSearchCase.Example] = []
    for example in examples.prefix(tokenLimit) {
      // LinkedJapaneseText with the `.dedicated` presentation: it accents the words that make
      // up the query, never the highlighted entry's own words.
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
              entry: token.entry?.id.rawValue,
              candidates: token.entry == nil && !token.candidateEntries.isEmpty
                ? token.candidateEntries.map(\.id.rawValue) : nil,
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
  /// How many of a query's examples, in order, the suite records with their words.
  let tokenLimit: Int
  var cases: [ExampleSearchCase]
}

/// One query's example search. Only `query` and `covers` are written by hand.
private struct ExampleSearchCase: Codable {
  /// The query as typed.
  let query: String
  /// Why the case is in the suite.
  let covers: String?
  /// The "View N Example Sentences" row's count; 51 means more than 50. No row when 0.
  var count: Int?
  /// The row's title, when Search shows it.
  var title: String?
  /// The entry the screen highlights: the result written as the query, else the first result.
  var highlightedEntry: String?
  /// Whether the screen lists `highlightedEntry`'s examples instead of the query's.
  var usesPrimaryEntryExamples: Bool?
  /// Every listed sentence's pair ID, in order.
  var ids: [String]?
  /// The first examples, with their words.
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
    /// The entry the word links to.
    let entry: String?
    /// The possible entries when the word has no single one.
    let candidates: [String]?
    /// Whether the screen accents the word as part of the query.
    let queryMatch: Bool?
  }
}
