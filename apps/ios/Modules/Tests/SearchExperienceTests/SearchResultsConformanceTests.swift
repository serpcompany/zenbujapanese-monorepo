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
      || ((observed.results ?? []).isEmpty && !SearchQuery(observed.query).isASCII)
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
  let lookupClient = LookupClient.live
  let exampleSentenceClient = ExampleSentenceClient.live
  let frequency: FrequencyPackManager

  init() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    frequency = try FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURLs: try catalog.bundledArtifactURLs(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: FileManager.default.temporaryDirectory
        .appending(path: "SearchResultsConformance-\(UUID().uuidString)"),
      download: { _ in throw CancellationError() }
    )
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
    let query = SearchQuery(recorded.query)

    let results = try await lookupClient.search(query)
    let exampleCount = await SearchResultsScreen.exampleCount(
      results, query: query,
      directCount: await SearchResultsScreen.directExampleCount(
        query, using: exampleSentenceClient),
      using: exampleSentenceClient)
    observed.resolution =
      switch results.resolution {
      case .direct: "direct"
      case .deinflected: "deinflected"
      case .analyzed: "analyzed"
      }
    observed.presentation =
      switch results.presentation {
      case .ranked: "ranked"
      case .discoveredWords: "discoveredWords"
      }
    guard !SearchResultsScreen.showsNoResults(results, exampleCount: exampleCount, query: query)
    else {
      observed.state = "noResults"
      return observed
    }
    observed.state = "results"

    let presentedEntries = SearchResultsScreen.presentedEntries(results, rankedEntryLimit: nil)
    let displayedIDs = SearchResultsScreen.displayedEntryIDs(presentedEntries)
    let capability = FrequencyCapability(batchLookup: { [frequency] ids in
      try await frequency.evidence(for: ids)
    })
    let ranks = try await SearchFrequencyLoader.load(
      SearchFrequencyTaskID(entryIDs: displayedIDs, refreshID: 0), using: capability
    ).results
    let orderedEntries = SearchResultFrequencyOrdering.ordered(
      results, entries: presentedEntries, ranks: ranks)

    var sections: [String] = []
    if exampleCount > 0 {
      sections.append("examples")
      observed.examples = SearchResultsCase.Examples(
        title: SearchResultsScreen.exampleActionTitle(count: exampleCount),
        count: exampleCount,
        primaryEntry: results.usesPrimaryEntryExamples
          ? results.primaryEntry(for: query)?.id.rawValue : nil
      )
    }
    if let refinement = results.readingRefinement {
      sections.append("readingRefinement")
      observed.readingRefinement = SearchResultsCase.Refinement(
        title: SearchResultsScreen.readingRefinementTitle(refinement),
        query: refinement.query.value)
    }

    let shownEntries: [DictionaryEntry]
    switch SearchResultsScreen.list(query: query, results: results, ordered: orderedEntries) {
    case .discoveredWords(let entries):
      sections.append("discoveredWords")
      observed.heading = SearchResultsScreen.discoveredWordsHeading
      shownEntries = entries
      observed.voiceOverCount = entries.count
    case .ranked(let kanji, let entries):
      sections.append("results")
      if let kanji {
        let entry = results.primaryEntry(for: query)
        observed.kanji = SearchResultsCase.Kanji(
          character: kanji.rawValue,
          label: SearchResultsScreen.kanjiLabel,
          summary: SearchResultsScreen.kanjiSummary(entry),
          entry: entry?.id.rawValue
        )
      }
      shownEntries = entries
      observed.voiceOverCount = SearchResultsScreen.rankedCount(query: query, entries: entries)
    case .none:
      shownEntries = []
    }

    observed.results = shownEntries.map { entry in
      let relevance = results.relevance(for: entry)
      return SearchResultsCase.Row(
        languageReferenceID: entry.id.rawValue,
        entSeq: entry.sourceProvenances.map(\.sourceRecordID),
        headword: entry.headword,
        reading: entry.reading,
        summary: results.displaySummary(for: entry),
        chips: SearchFrequencyRankPresentationModel(ranks: ranks[entry.id])
          .collapsed(to: .max).chips.map { chip in
            SearchResultsCase.Chip(
              pack: chip.pack?.id.rawValue,
              name: chip.packName,
              text: chip.inlineText,
              tier: chip.tier?.label
            )
          },
        match: Self.describe(relevance),
        retrievalOrder: results.fallbackOrder(for: entry)
      )
    }
    if results.presentation != .discoveredWords {
      observed.frequencyNotice = SearchFrequencyUnavailableNotice.text(
        for: displayedIDs.compactMap { ranks[$0] })
    }
    observed.sections = sections
    return observed
  }

  private static func describe(_ relevance: DictionaryRelevance) -> String {
    let match =
      switch relevance.matchRank {
      case .japanese(let rank): "japanese \(rank.relation)"
      case .english(let rank):
        "english \(rank.lane) corroboration=\(rank.corroborationRank) "
          + "romaji=\(rank.romajiSpecificityRank) sense=\(rank.senseOrder) \(rank.relation)"
      }
    return "source=\(relevance.sourceOrder) \(match)"
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
