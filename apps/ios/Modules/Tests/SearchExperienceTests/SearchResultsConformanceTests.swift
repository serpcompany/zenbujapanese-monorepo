import Foundation
import Testing

@testable import SearchExperience

@Suite("Search results conformance suite")
struct SearchResultsConformanceTests {
  @Test("Search results show what the suite recorded")
  func searchResultsMatchSuite() async throws {
    try await ResultsScreenConformance.check(
      "search-results.json",
      artifacts: try await DetailConformance.artifacts(ResultsScreenConformance.artifactNames),
      observer: try await SearchResultsObserver(),
      recordable: Self.checkIndependentOfTextAnalysis)
  }

  private static func checkIndependentOfTextAnalysis(
    _ observed: SearchResultsCase, textAnalysis: String
  ) throws {
    guard textAnalysis != "full" else { return }
    let reachedAnalysis =
      observed.resolution == "analyzed" || observed.presentation == "discoveredWords"
      || ((observed.results ?? []).isEmpty
        && !SearchQuery(observed.query).value.unicodeScalars.allSatisfy(\.isASCII))
    if reachedAnalysis {
      throw SearchResultsObserverError.dependsOnTextAnalysis(observed.query)
    }
  }
}
