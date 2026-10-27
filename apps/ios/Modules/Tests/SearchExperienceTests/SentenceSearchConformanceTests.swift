import Foundation
import Testing

@testable import SearchExperience

@Suite("Sentence search conformance suite")
struct SentenceSearchConformanceTests {
  @Test("Sudachi's words, the words searched, and the results match the suite, case by case")
  func sentencesMatchSuite() async throws {
    let url = DetailConformance.suiteURL("sentence-search.json")
    var suite = try JSONDecoder().decode(SentenceSuite.self, from: Data(contentsOf: url))
    let analyzer = try await SudachiBuildCache.analyzer()
    let observer = SentenceObserver(
      analyzer: analyzer,
      data: LanguageReferenceData(morphology: JapaneseMorphologyClient { try analyzer.analyze($0) }),
      core: try DictionaryCore(),
      resultLimit: suite.resultLimit)
    let artifacts =
      try await DetailConformance.artifacts(["LanguageReferenceData.sqlite3"])
      + [SudachiBuildCache.artifact]

    if DetailConformance.isRecording {
      suite.artifacts = artifacts
      for index in suite.cases.indices {
        await Task.yield()
        suite.cases[index] = try await observer.observe(suite.cases[index])
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against other language data or another Sudachi dictionary")
    for expected in suite.cases {
      await Task.yield()
      let observed = try await observer.observe(expected)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(differences.isEmpty, "「\(expected.query)」 differs in \(differences)")
    }
  }
}

private struct SentenceObserver {
  let analyzer: SudachiJapaneseMorphologyAdapter
  let data: LanguageReferenceData
  let core: DictionaryCore
  let resultLimit: Int

  func observe(_ recorded: SentenceCase) async throws -> SentenceCase {
    let analysis = try analyzer.analyze(SearchQuery(recorded.query).value)
    let searched: [String] = try core.answer(
      "searchedWords", DictionaryCore.argument(["words": analysis.words]))
    let results = try await data.search(SearchQuery(recorded.query))
    let shown =
      results.presentation == .discoveredWords
      ? results.entries[...] : results.entries.prefix(resultLimit)
    return SentenceCase(
      covers: recorded.covers,
      query: recorded.query,
      words: analysis.words,
      searched: searched,
      resolution: results.resolution.rawValue,
      presentation: results.presentation.rawValue,
      results: shown.map {
        RecordedResult(id: $0.id.rawValue, headword: $0.headword, reading: $0.reading)
      }
    )
  }
}

private struct SentenceSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifacts: [ConformanceArtifact]?
  let resultLimit: Int
  var cases: [SentenceCase]
}

private struct SentenceCase: Codable {
  let covers: String
  let query: String
  var words: [JapaneseMorpheme]?
  var searched: [String]?
  var resolution: String?
  var presentation: String?
  var results: [RecordedResult]?
}

private struct RecordedResult: Codable, Equatable {
  let id: String
  let headword: String
  let reading: String
}
