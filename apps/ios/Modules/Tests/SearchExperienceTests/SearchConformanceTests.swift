import Foundation
import Testing
@testable import SearchExperience

@Suite("Search conformance suite")
struct SearchConformanceTests {
  @Test("Search returns the suite's Language Reference IDs in the suite's order")
  func searchMatchesSuite() async throws {
    let url = Self.suiteURL
    var suite = try JSONDecoder().decode(ConformanceSuite.self, from: Data(contentsOf: url))
    let databaseSHA256 = try DictionaryRankingArtifactContract.bundled().databaseSHA256

    if ProcessInfo.processInfo.environment["ZENBU_RECORD_CONFORMANCE"] == "1" {
      suite.artifact = .init(name: "LanguageReferenceData.sqlite3", sha256: databaseSHA256)
      for index in suite.cases.indices {
        suite.cases[index] = try await Self.observe(
          suite.cases[index].query, limit: suite.resultLimit)
      }
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
      try (encoder.encode(suite) + Data("\n".utf8)).write(to: url)
      return
    }

    #expect(
      suite.artifact?.sha256 == databaseSHA256,
      "The suite was recorded against a different dictionary artifact; record it again")
    for expected in suite.cases {
      let observed = try await Self.observe(expected.query, limit: suite.resultLimit)
      #expect(
        observed.results?.map(\.id) == expected.results?.map(\.id),
        """
        「\(expected.query)」 expected \(Self.describe(expected.results ?? [])) \
        but found \(Self.describe(observed.results ?? []))
        """)
      #expect(observed.resolution == expected.resolution, "「\(expected.query)」 resolution")
      #expect(observed.presentation == expected.presentation, "「\(expected.query)」 presentation")
      #expect(
        observed.readingRefinement == expected.readingRefinement,
        "「\(expected.query)」 reading refinement")
    }
  }

  private static var suiteURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appending(path: "LanguageData/Conformance/search-retrieval.json")
  }

  private static func observe(_ query: String, limit: Int) async throws -> ConformanceCase {
    let results = try await LookupClient.live.search(SearchQuery(query))
    let resolution =
      switch results.resolution {
      case .direct: "direct"
      case .deinflected: "deinflected"
      case .analyzed: "analyzed"
      }
    let presentation =
      switch results.presentation {
      case .ranked: "ranked"
      case .discoveredWords: "discoveredWords"
      }
    return ConformanceCase(
      query: query,
      resolution: resolution,
      presentation: presentation,
      readingRefinement: results.readingRefinement?.query.value,
      results: results.entries.prefix(limit).map {
        ConformanceResult(id: $0.id.rawValue, headword: $0.headword, reading: $0.reading)
      }
    )
  }

  private static func describe(_ results: [ConformanceResult]) -> String {
    results.map { "\($0.headword)（\($0.reading)）" }.joined(separator: ", ")
  }
}

private struct ConformanceSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifact: Artifact?
  let resultLimit: Int
  var cases: [ConformanceCase]

  struct Artifact: Codable {
    let name: String
    let sha256: String
  }
}

private struct ConformanceCase: Codable {
  let query: String
  var resolution: String?
  var presentation: String?
  var readingRefinement: String?
  var results: [ConformanceResult]?
}

private struct ConformanceResult: Codable {
  let id: String
  let headword: String
  let reading: String
}
