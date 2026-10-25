import Foundation
import Testing

@testable import SearchExperience

@Suite("Sentence results conformance suite")
struct SentenceResultsConformanceTests {
  @Test("A sentence's results screen, its Discovered Words included, shows what the suite recorded")
  func sentenceScreensMatchSuite() async throws {
    let analyzer = try await SudachiBuildCache.analyzer()
    try await ResultsScreenConformance.check(
      "sentence-results.json",
      artifacts: try await DetailConformance.artifacts(ResultsScreenConformance.artifactNames)
        + [SudachiBuildCache.artifact],
      observer: try await SearchResultsObserver(
        analyzing: JapaneseMorphologyClient { try analyzer.analyze($0) }),
      recordable: Self.listsDiscoveredWords)
  }

  private static func listsDiscoveredWords(
    _ observed: SearchResultsCase, textAnalysis: String
  ) throws {
    guard textAnalysis == "full", observed.presentation == "discoveredWords" else {
      throw SearchResultsObserverError.listsNoDiscoveredWords(observed.query)
    }
  }
}
