import Foundation
import Testing

@testable import SearchExperience

@Suite("Search results conformance suite")
struct SearchResultsConformanceTests {
  static let artifactNames = [
    "LanguageReferenceData.sqlite3", "ExampleWordIndex.sqlite3", "JLPTLevelPack.sqlite3",
    "TUBELEXFrequencyPack.sqlite3", "FrequencyPackCatalog.json", "FrequencyPackMappingV1.sql",
    "FrequencyPackMappingV2.sql", "DictionaryRankingArtifactContract.json",
    "LanguageTechnologyPackCatalog.json",
  ]

  @Test("Search results show what the suite recorded")
  func searchResultsMatchSuite() async throws {
    let url = DetailConformance.suiteURL("search-results.json")
    var suite = try JSONDecoder().decode(SearchResultsSuite.self, from: Data(contentsOf: url))
    let artifacts = try DetailConformance.artifacts(Self.artifactNames)
    let observer = try await SearchResultsObserver()
    let frequencyPacks = try await observer.enabledPackIDs()
    let textAnalysis = await observer.textAnalysis()

    if DetailConformance.isRecording {
      suite.artifacts = artifacts
      suite.frequencyPacks = frequencyPacks
      suite.textAnalysis = textAnalysis
      for index in suite.cases.indices {
        let observed = try await observer.observe(suite.cases[index])
        try Self.checkIndependentOfTextAnalysis(observed, textAnalysis: textAnalysis)
        suite.cases[index] = observed
      }
      try DetailConformance.write(suite, to: url)
      return
    }

    #expect(
      suite.artifacts == artifacts,
      "The suite was recorded against different artifacts; record it again")
    #expect(
      suite.frequencyPacks == frequencyPacks,
      "A new install enables different frequency dictionaries; record the suite again")
    #expect(suite.textAnalysis == textAnalysis, "Text analysis availability changed")
    for expected in suite.cases {
      let observed = try await observer.observe(expected)
      let differences = try DetailConformance.differences(expected, observed)
      #expect(differences.isEmpty, "「\(expected.query)」 differs in \(differences)")
      let expectedResults = expected.results ?? []
      let observedResults = observed.results ?? []
      let sameOrder =
        observedResults.map(\.languageReferenceID) == expectedResults.map(\.languageReferenceID)
      #expect(
        sameOrder,
        """
        「\(expected.query)」 expected \(Self.describe(expectedResults)) \
        but found \(Self.describe(observedResults))
        """)
      let rows = try Self.rowDifferences(expectedResults, observedResults)
      for row in rows.prefix(10) {
        Issue.record("「\(expected.query)」 \(row)")
      }
      if rows.count > 10 {
        Issue.record("「\(expected.query)」 and \(rows.count - 10) more rows differ")
      }
    }
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

  private static func rowDifferences(
    _ expected: [SearchResultsCase.Row], _ observed: [SearchResultsCase.Row]
  ) throws -> [String] {
    var rows: [String] = []
    for index in 0..<max(expected.count, observed.count) {
      let expectedRow = expected.indices.contains(index) ? expected[index] : nil
      let observedRow = observed.indices.contains(index) ? observed[index] : nil
      switch (expectedRow, observedRow) {
      case let (.some(expectedRow), .some(observedRow)):
        let fields = try DetailConformance.differences(expectedRow, observedRow)
        guard !fields.isEmpty else { continue }
        let id =
          expectedRow.languageReferenceID == observedRow.languageReferenceID
          ? expectedRow.languageReferenceID
          : "\(expectedRow.languageReferenceID) → \(observedRow.languageReferenceID)"
        rows.append("row \(index + 1) \(expectedRow.headword) (\(id)) differs in \(fields)")
      case let (.some(expectedRow), .none):
        rows.append(
          "row \(index + 1) \(expectedRow.headword) (\(expectedRow.languageReferenceID)) is missing")
      case let (.none, .some(observedRow)):
        rows.append(
          "row \(index + 1) \(observedRow.headword) (\(observedRow.languageReferenceID)) is new")
      case (.none, .none):
        continue
      }
    }
    return rows
  }

  private static func describe(_ results: [SearchResultsCase.Row]) -> String {
    results.prefix(12).map { "\($0.headword)（\($0.reading)）" }.joined(separator: ", ")
  }
}

private struct SearchResultsObserver {
  let frequency: FrequencyPackManager
  let core: PresentationCore

  init() async throws {
    frequency = try .freshInstall(storagePrefix: "SearchResultsConformance")
    core = PresentationCore(listing: frequency.lists)
  }

  func enabledPackIDs() async throws -> [String] {
    try await frequency.snapshot().enabledPackIDs.map(\.rawValue)
  }

  func textAnalysis() async -> String {
    switch await JapaneseMorphologyClient.live.availability() {
    case .full: "full"
    case .reduced: "reduced"
    }
  }

  func observe(_ recorded: SearchResultsCase) async throws -> SearchResultsCase {
    var observed = SearchResultsCase(query: recorded.query, covers: recorded.covers)
    let searched = try await SearchedScreen.search(recorded.query, using: core)
    let results = searched.results
    observed.resolution = results.resolution.rawValue
    observed.presentation = results.presentation.rawValue
    guard case .results(let list) = searched.screen else {
      observed.state = "noResults"
      return observed
    }
    observed.state = "results"
    observed.sections = list.sections.map(\.rawValue)
    observed.examples = list.examples.map {
      SearchResultsCase.Examples(
        title: $0.title, count: $0.count,
        primaryEntry: $0.usesHighlightedEntryExamples ? $0.highlightedEntry : nil)
    }
    observed.readingRefinement = list.readingRefinement.map {
      SearchResultsCase.Refinement(title: $0.title, query: $0.query)
    }
    observed.heading = list.heading
    observed.kanji = list.kanji.map {
      SearchResultsCase.Kanji(
        character: $0.character, label: $0.label, summary: $0.summary, entry: $0.entry)
    }
    let items = Dictionary(
      searched.items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    observed.results = try list.rows.map { row in
      let entry = try searched.entry(row.id)
      return SearchResultsCase.Row(
        languageReferenceID: row.id,
        entSeq: entry.sourceProvenances.map(\.sourceRecordID),
        headword: entry.headword,
        reading: entry.reading,
        summary: row.summary,
        chips: row.chips.map { chip in
          SearchResultsCase.Chip(
            pack: chip.pack, name: chip.source, text: chip.value, tier: chip.tier?.spoken)
        },
        match: items[row.id]?.match ?? "",
        retrievalOrder: items[row.id]?.fallbackOrder ?? .max
      )
    }
    if list.sections.contains(.discoveredWords) {
      observed.voiceOverCount = list.rows.count
    } else if list.sections.contains(.results) {
      observed.voiceOverCount = list.rows.count + (list.kanji == nil ? 0 : 1)
    }
    observed.frequencyNotice = list.frequencyNotice
    return observed
  }
}

extension FrequencyTier {
  var spoken: String {
    switch self {
    case .veryCommon: "very common"
    case .common: "common"
    case .moderate: "moderately common"
    case .uncommon: "uncommon"
    case .rare: "rare"
    }
  }
}

private enum SearchResultsObserverError: Error {
  case dependsOnTextAnalysis(String)
}

private struct SearchResultsSuite: Codable {
  let suite: String
  let formatVersion: Int
  var artifacts: [ConformanceArtifact]?
  var frequencyPacks: [String]?
  var textAnalysis: String?
  var cases: [SearchResultsCase]
}

private struct SearchResultsCase: Codable {
  let query: String
  let covers: String?
  var resolution: String?
  var presentation: String?
  var state: String?
  var sections: [String]?
  var examples: Examples?
  var readingRefinement: Refinement?
  var heading: String?
  var kanji: Kanji?
  var results: [Row]?
  var voiceOverCount: Int?
  var frequencyNotice: String?

  init(query: String, covers: String?) {
    self.query = query
    self.covers = covers
  }

  struct Examples: Codable {
    let title: String
    let count: Int
    let primaryEntry: String?
  }

  struct Refinement: Codable {
    let title: String
    let query: String
  }

  struct Kanji: Codable {
    let character: String
    let label: String
    let summary: String
    let entry: String?
  }

  struct Row: Codable {
    let languageReferenceID: String
    let entSeq: [String]
    let headword: String
    let reading: String
    let summary: String
    let chips: [Chip]
    let match: String
    let retrievalOrder: Int
  }

  struct Chip: Codable {
    let pack: String?
    let name: String
    let text: String
    let tier: String?
  }
}
