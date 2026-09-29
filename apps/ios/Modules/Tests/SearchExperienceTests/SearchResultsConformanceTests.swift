import Foundation
import Testing

@testable import SearchExperience

/// Checks what the Search results screen shows against the app-recorded suite in
/// `apps/ios/LanguageData/Conformance/search-results.json`, so the website's search pages can be
/// held to the app. Unlike `search-retrieval.json`, which records retrieval order, this records
/// the list after `SearchResultFrequencyOrdering` re-sorts it with the frequency dictionaries a
/// new install enables (JLPT, then TUBELEX), with each row's summary and chips, the kanji row,
/// the Example Sentences and reading-refinement rows, and the frequency notice. Each case is read
/// from the models `SearchView` and `SearchResultsView` use, at standard text sizes.
///
/// Recent searches and known words don't change the list; the enabled frequency dictionaries
/// and their order do, so the suite pins a fresh install's.
///
/// After an intended change to Search results or their data, record it again by running this
/// suite with `TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1`, and review the diff. Recording keeps each
/// case's `query` and `covers` and rewrites the rest.
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
    }
  }

  /// The package's test host lacks the Sudachi dictionary the app bundles, so Search can't split
  /// a query into words here. Search only splits a query that matches nothing directly, and
  /// ignores words that aren't Japanese, so a case is only recorded when splitting can't change
  /// it: it has direct matches, or is not Japanese.
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

  private static func describe(_ results: [SearchResultsCase.Row]) -> String {
    results.prefix(12).map { "\($0.headword)（\($0.reading)）" }.joined(separator: ", ")
  }
}

/// Reads one query's results screen from the same clients and models the app gives `SearchView`.
private struct SearchResultsObserver {
  let lookupClient = LookupClient.live
  let exampleSentenceClient = ExampleSentenceClient.live
  /// A fresh install's frequency dictionaries, independent of the Simulator's saved choices.
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

    // SearchView.search(_:)
    let results = try await lookupClient.search(query)
    let exampleCount: Int
    if results.usesPrimaryEntryExamples, let entry = results.primaryEntry(for: query) {
      exampleCount = (try? await exampleSentenceClient.examples(entry).count) ?? 0
    } else {
      exampleCount = (try? await exampleSentenceClient.count(query)) ?? 0
    }
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
    guard !(results.isEmpty && exampleCount == 0 && !query.isSingleKanji) else {
      observed.state = "noResults"
      return observed
    }
    observed.state = "results"

    // SearchResultsView, for a typed query (radical input alone limits the list).
    let presentedEntries =
      results.presentation == .discoveredWords
      ? Array(results.entries.prefix(12)) : results.entries
    var seen = Set<LanguageReferenceID>()
    let displayedIDs = presentedEntries.compactMap { seen.insert($0.id).inserted ? $0.id : nil }
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
        title: exampleCount > 50
          ? "View 50+ Example Sentences"
          : "View \(exampleCount) Example \(exampleCount == 1 ? "Sentence" : "Sentences")",
        count: exampleCount,
        primaryEntry: results.usesPrimaryEntryExamples
          ? results.primaryEntry(for: query)?.id.rawValue : nil
      )
    }
    if let refinement = results.readingRefinement {
      sections.append("readingRefinement")
      observed.readingRefinement = SearchResultsCase.Refinement(
        title: "Search for「\(refinement.query.value)」", query: refinement.query.value)
    }

    let shownEntries: [DictionaryEntry]
    if results.presentation == .discoveredWords {
      sections.append("discoveredWords")
      observed.heading = "Discovered Words"
      shownEntries = Array(results.entries.prefix(12))
      observed.voiceOverCount = min(results.entries.count, 12)
    } else if query.isSingleKanji || !results.entries.isEmpty {
      sections.append("results")
      if let character = KanjiCharacter(query.value) {
        let entry = results.primaryEntry(for: query)
        observed.kanji = SearchResultsCase.Kanji(
          character: character.rawValue,
          label: "KANJI",
          summary: entry?.summary ?? "Kanji detail",
          entry: entry?.id.rawValue
        )
      }
      shownEntries = orderedEntries
      observed.voiceOverCount = orderedEntries.count + (query.isSingleKanji ? 1 : 0)
    } else {
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

  /// The match group a row sorts in before frequency: its source (the exact form, then
  /// deinflected lemmas, then other matches), then how it matched.
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
  /// The frequency dictionaries a new install enables, in priority order.
  var frequencyPacks: [String]?
  /// Whether Search could split queries into words when recorded.
  var textAnalysis: String?
  var cases: [SearchResultsCase]
}

/// One query's results screen. Only `query` and `covers` are written by hand.
private struct SearchResultsCase: Codable {
  /// The query as typed.
  let query: String
  /// Why the case is in the suite.
  let covers: String?
  var resolution: String?
  var presentation: String?
  /// `results`, or `noResults` for the No Dictionary Matches screen.
  var state: String?
  /// The list's sections, in order: `examples`, `readingRefinement`, then `discoveredWords` or
  /// `results`.
  var sections: [String]?
  var examples: Examples?
  var readingRefinement: Refinement?
  /// The heading row over discovered words.
  var heading: String?
  /// The kanji row that leads a single-kanji query's results.
  var kanji: Kanji?
  /// The rows in the order shown.
  var results: [Row]?
  /// The count VoiceOver reads for each row ("Result 1 of N"), including the kanji row. The
  /// screen shows no count.
  var voiceOverCount: Int?
  /// The row under the results naming frequency dictionaries that couldn't be read.
  var frequencyNotice: String?

  init(query: String, covers: String?) {
    self.query = query
    self.covers = covers
  }

  struct Examples: Codable {
    let title: String
    let count: Int
    /// The entry whose examples it opens, when not the query's own matches.
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
    /// The entry whose summary the row shows.
    let entry: String?
  }

  struct Row: Codable {
    let languageReferenceID: String
    /// The JMdict entry numbers behind the entry.
    let entSeq: [String]
    let headword: String
    let reading: String
    let summary: String
    /// The frequency chips, in order.
    let chips: [Chip]
    /// The match group the row sorts in before frequency; see `SearchResultFrequencyOrdering`.
    let match: String
    /// The row's position before the frequency re-sort, the last tiebreak.
    let retrievalOrder: Int
  }

  struct Chip: Codable {
    let pack: String?
    /// The dictionary's short name.
    let name: String
    /// A rank, a JLPT level, or "—" for the first dictionary without a rank.
    let text: String
    let tier: String?
  }
}
