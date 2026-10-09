import Foundation

enum SearchResultsScreen {
  static let discoveredWordLimit = 12
  static let discoveredWordsHeading = "Discovered Words"
  static let kanjiLabel = "KANJI"

  enum List {
    case discoveredWords([DictionaryEntry])
    case ranked(kanji: KanjiCharacter?, entries: [DictionaryEntry])
    case none
  }

  static func directExampleCount(
    _ query: SearchQuery, using client: ExampleSentenceClient
  ) async -> Int {
    (try? await client.count(query)) ?? 0
  }

  static func exampleCount(
    _ results: LookupSearchResults, query: SearchQuery, directCount: Int,
    using client: ExampleSentenceClient
  ) async -> Int {
    if results.usesPrimaryEntryExamples, let entry = results.primaryEntry(for: query) {
      return (try? await client.examples(entry).count) ?? 0
    }
    return directCount
  }

  static func showsNoResults(
    _ results: LookupSearchResults, exampleCount: Int, query: SearchQuery
  ) -> Bool {
    results.isEmpty && exampleCount == 0 && !query.isSingleKanji
  }

  static func exampleActionTitle(count: Int) -> String {
    if count > 50 { return "View 50+ Example Sentences" }
    return "View \(count) Example \(count == 1 ? "Sentence" : "Sentences")"
  }

  static func readingRefinementTitle(_ refinement: SearchRefinement) -> String {
    "Search for「\(refinement.query.value)」"
  }

  static func kanjiSummary(_ entry: DictionaryEntry?) -> String {
    entry?.summary ?? "Kanji detail"
  }

  static func presentedEntries(
    _ results: LookupSearchResults, rankedEntryLimit: Int?
  ) -> [DictionaryEntry] {
    if results.presentation == .discoveredWords {
      return Array(results.entries.prefix(discoveredWordLimit))
    }
    guard let rankedEntryLimit else { return results.entries }
    return Array(results.entries.prefix(rankedEntryLimit))
  }

  static func displayedEntryIDs(_ entries: [DictionaryEntry]) -> [LanguageReferenceID] {
    var seen = Set<LanguageReferenceID>()
    return entries.compactMap { seen.insert($0.id).inserted ? $0.id : nil }
  }

  static func list(
    query: SearchQuery, results: LookupSearchResults, ordered: [DictionaryEntry]
  ) -> List {
    if results.presentation == .discoveredWords {
      return .discoveredWords(Array(results.entries.prefix(discoveredWordLimit)))
    }
    if query.isSingleKanji || !results.entries.isEmpty {
      return .ranked(kanji: KanjiCharacter(query.value), entries: ordered)
    }
    return .none
  }

  static func isSortable(_ results: LookupSearchResults, entries: [DictionaryEntry]) -> Bool {
    results.presentation != .discoveredWords && !entries.isEmpty
  }

  static func rankedCount(query: SearchQuery, entries: [DictionaryEntry]) -> Int {
    entries.count + (query.isSingleKanji ? 1 : 0)
  }
}

enum SearchFrequencyUnavailableNotice {
  static func text(for ranks: [FrequencyRanks]) -> String? {
    let packCount = ranks.map(\.count).max() ?? 0
    let unavailable: [FrequencyPackUnavailable] = (0..<packCount).compactMap { position in
      for entryRanks in ranks where entryRanks.indices.contains(position) {
        if case .unavailable(let unavailable) = entryRanks[position] { return unavailable }
      }
      return nil
    }
    guard let first = unavailable.first else { return nil }
    if unavailable.count == packCount {
      return "Frequency ordering unavailable. Showing dictionary relevance order. "
        + first.reason
    }
    let names = unavailable.map { $0.pack?.shortName ?? "A frequency dictionary" }
    return "\(names.formatted(.list(type: .and))) unavailable. "
      + "Search is ordered by the other enabled dictionaries."
  }
}
