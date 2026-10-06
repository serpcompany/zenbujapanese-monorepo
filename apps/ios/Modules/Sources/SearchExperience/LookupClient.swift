import Foundation
import SQLite3

struct LookupClient: Sendable {
  var search: @Sendable (SearchQuery) async throws -> LookupSearchResults
  var entry: @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?
  var entryMatchingForm: @Sendable (String) async throws -> DictionaryEntry?
  var entriesMatchingForm: @Sendable (String) async throws -> [DictionaryEntry]
  var entriesContainingKanji: @Sendable (String) async throws -> [DictionaryEntry]

  static let live: LookupClient = {
    LookupClient(
      search: { query in
        return try await LanguageReferenceData.shared.search(query)
      },
      entry: { id in try await LanguageReferenceData.shared.entry(id) },
      entryMatchingForm: { form in try await LanguageReferenceData.shared.entry(matchingForm: form)
      },
      entriesMatchingForm: { form in
        try await LanguageReferenceData.shared.entries(matchingForm: form)
      },
      entriesContainingKanji: { character in
        try await LanguageReferenceData.shared.entries(containingKanji: character)
      }
    )
  }()
}

actor LanguageReferenceData {
  static let shared = LanguageReferenceData()

  var connection: SQLiteConnection?
  var senseRestrictionCache: [SenseRestrictionKey: Set<String>]?
  private var searchResultCache: [SearchQuery: LookupSearchResults] = [:]
  private var searchCacheOrder: [SearchQuery] = []
  let databaseURL: URL?
  let validatesBundledArtifact: Bool
  private let literalSearchQueryPolicy = LiteralSearchQueryPolicy.referenceCompatible
  private let japaneseTextAnalysis = JapaneseTextAnalysisClient.resolving(
    morphologyClient: .live,
    lookupClient: LookupClient(
      search: { _ in .empty },
      entry: { _ in nil },
      entryMatchingForm: { _ in nil },
      entriesMatchingForm: { _ in [] },
      entriesContainingKanji: { _ in [] }
    )
  )

  init(databaseURL: URL? = nil, validatesBundledArtifact: Bool = true) {
    self.databaseURL = databaseURL
    self.validatesBundledArtifact = validatesBundledArtifact
  }

  func search(_ query: SearchQuery) async throws -> LookupSearchResults {
    try Task<Never, Never>.checkCancellation()
    if let cached = searchResultCache[query] {
      searchCacheOrder.removeAll { $0 == query }
      searchCacheOrder.append(query)
      return cached
    }

    let results = try await searchUncached(query)
    searchResultCache[query] = results
    searchCacheOrder.append(query)
    if searchCacheOrder.count > Self.searchCacheCapacity {
      searchResultCache[searchCacheOrder.removeFirst()] = nil
    }
    return results
  }

  private func searchUncached(_ query: SearchQuery) async throws -> LookupSearchResults {
    let exactFormEntry =
      query.isASCII && !query.isEmpty
      ? try rankedEnglish(query, exactFormOnly: true).first?.entry : nil
    if let japaneseReading = exactFormEntry?.reading {
      let refinement = SearchQuery(japaneseReading)
      let refinedResults = try searchOnce(refinement)
      let literalQuery = literalSearchQueryPolicy.literalQuery(for: query)
      var literalResults = try searchLiteralEnglish(literalQuery)
      if !refinedResults.isEmpty, !literalResults.isEmpty {
        if let exactFormEntry,
          literalResults.entries.contains(where: {
            $0.id == exactFormEntry.id
          })
        {
          literalResults = literalResults.usingPrimaryEntryExamples()
        }
        return literalResults.offeringReadingRefinement(refinement)
      }
    }

    let directResults = try searchOnce(query)
    if !directResults.hasExactOrPrefixMatch, !query.deinflectedCandidates.isEmpty {
      let deinflectedResults = try query.deinflectedCandidates.map(searchOnce)
      if let primaryIndex = deinflectedResults.firstIndex(where: { !$0.entries.isEmpty }) {
        let primaryResult = deinflectedResults[primaryIndex]
        let primaryItems = Array(
          primaryResult.items.prefix(primaryResult.leadingLexicalEntryCount))
        let displacedSources = deinflectedResults.dropFirst(primaryIndex + 1).map(\.items)
          + [directResults.items]
        return LookupSearchResults.composing(
          sources: [primaryItems] + displacedSources,
          leadingLexicalEntryCount: primaryItems.count,
          usesPrimaryEntryExamples: true,
          resolution: .deinflected,
          limit: 60
        )
      }
    }
    if query.isJapaneseOnly {
      let deinflectedSources = try japaneseDeinflectedSources(for: query)
      if !deinflectedSources.isEmpty {
        let exactItems = directResults.items.prefix { item in
          guard case .japanese(let rank) = item.relevance.matchRank else { return false }
          return rank.relation <= .readingExact
        }
        if !exactItems.isEmpty {
          return LookupSearchResults.composing(
            sources: [Array(exactItems)] + deinflectedSources
              + [Array(directResults.items.dropFirst(exactItems.count))],
            leadingLexicalEntryCount: directResults.leadingLexicalEntryCount,
            usesPrimaryEntryExamples: directResults.usesPrimaryEntryExamples,
            hasExactOrPrefixMatch: directResults.hasExactOrPrefixMatch
          )
        }
        return LookupSearchResults.composing(
          sources: deinflectedSources + [directResults.items],
          leadingLexicalEntryCount: deinflectedSources[0].count,
          usesPrimaryEntryExamples: true,
          resolution: .deinflected
        )
      }
    }
    if !directResults.isEmpty,
      let exactFormEntry,
      directResults.entries.contains(where: { $0.id == exactFormEntry.id })
    {
      return directResults.usingPrimaryEntryExamples()
    }
    guard directResults.isEmpty else { return directResults }
    let analyzedResults = try await japaneseTextAnalysis.lookupSegments(query).compactMap {
      segment in
      let segmentResults = try searchOnce(segment)
      return segmentResults.items.first {
        $0.entry.headword == segment.value
      }
        ?? segmentResults.items.first
    }
    if analyzedResults.count > 1 || (query.isMixedScript && !analyzedResults.isEmpty) {
      return LookupSearchResults.composing(
        sources: analyzedResults.map { [$0] },
        leadingLexicalEntryCount: analyzedResults.count,
        usesPrimaryEntryExamples: false,
        hasExactOrPrefixMatch: false,
        resolution: .analyzed,
        limit: analyzedResults.count
      )
      .presenting(.discoveredWords)
    }
    if query.isMixedScript {
      for segment in query.japaneseSegments {
        let results = try searchOnce(segment)
        if !results.isEmpty {
          return results.presenting(.discoveredWords, hasExactOrPrefixMatch: false)
        }
      }
    }
    return .empty
  }

  func entry(_ id: LanguageReferenceID) throws -> DictionaryEntry? {
    guard let key = id.bytes else { return nil }
    let statement = try prepare(Self.equivalentEntriesByIDSQL)
    defer { sqlite3_finalize(statement) }
    sqliteBind(key, at: 1, to: statement)
    var entries: [DictionaryEntry] = []
    while try checkedSQLiteStep(statement) == .row {
      entries.append(try decodeEntry(from: statement))
    }
    return LanguageReferenceIdentity.normalizedEntry(entries)
  }

  func entry(matchingForm form: String) throws -> DictionaryEntry? {
    try entries(matchingForm: form).first
  }

  func entries(matchingForm form: String) throws -> [DictionaryEntry] {
    let query = SearchQuery(form)
    guard !query.isEmpty else { return [] }
    return try
      (query.isASCII
      ? rankedEnglish(query, exactFormOnly: true)
      : rankedJapanese(query, exactFormOnly: true)).map(\.entry)
  }

  func entries(containingKanji character: String) throws -> [DictionaryEntry] {
    let candidateStatement = try prepare(Self.kanjiCandidateRowsSQL)
    defer { sqlite3_finalize(candidateStatement) }
    sqliteBind(character, at: 1, to: candidateStatement)
    sqliteBind(character, at: 2, to: candidateStatement)
    var orderedFingerprints: [Data] = []
    sqlite3_bind_int(candidateStatement, 3, 24)
    while try checkedSQLiteStep(candidateStatement) == .row {
      orderedFingerprints.append(sqliteData(candidateStatement, 0))
    }
    guard !orderedFingerprints.isEmpty else { return [] }

    let placeholders = Array(repeating: "?", count: orderedFingerprints.count).joined(
      separator: ",")
    let statement = try prepare(
      """
      SELECT \(Self.selectedColumns)
      FROM entries e
      WHERE e.semantic_fingerprint IN (\(placeholders))
      ORDER BY lower(hex(e.id))
      """)
    defer { sqlite3_finalize(statement) }
    for (offset, fingerprint) in orderedFingerprints.enumerated() {
      sqliteBind(fingerprint, at: Int32(offset + 1), to: statement)
    }
    var groups: [String: [DictionaryEntry]] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let fingerprint = sqliteText(statement, 17)
      groups[fingerprint, default: []].append(entry)
    }
    return orderedFingerprints.compactMap { fingerprint in
      let fingerprintHex = fingerprint.hexString
      return LanguageReferenceIdentity.normalizedEntry(groups[fingerprintHex] ?? [])
    }
  }

  private func searchLiteralEnglish(_ query: SearchQuery) throws -> LookupSearchResults {
    try searchOnce(query)
  }

  private func japaneseDeinflectedSources(
    for query: SearchQuery
  ) throws -> [[LookupSearchResultItem]] {
    var sourcesByDepth: [Int: [RankedDictionaryEntry]] = [:]
    var seen = Set<LanguageReferenceID>()
    for candidate in JapaneseDeinflector.candidates(for: query.value) {
      let matches = try rankedJapanese(SearchQuery(candidate.term), exactFormOnly: true)
        .filter { ranked in
          candidate.wordClasses.contains { $0.accepts(ranked.entry.partsOfSpeech) }
        }
      for match in matches where seen.insert(match.entry.id).inserted {
        sourcesByDepth[candidate.depth, default: []].append(match)
      }
    }
    return sourcesByDepth.keys.sorted().map { Self.resultItems(for: sourcesByDepth[$0]!) }
  }

  private func searchOnce(_ query: SearchQuery) throws -> LookupSearchResults {
    guard !query.isEmpty else { return .empty }

    let ranked = query.isASCII ? try rankedEnglish(query) : try rankedJapanese(query)
    guard !ranked.isEmpty else { return .empty }
    let leadingLegacyRank = ranked[0].legacyPresentationRank
    let leadingLexicalEntryCount = ranked.prefix {
      $0.legacyPresentationRank == leadingLegacyRank
    }.count
    return LookupSearchResults(
      items: Self.resultItems(for: Array(ranked.prefix(60))),
      leadingLexicalEntryCount: leadingLexicalEntryCount,
      hasExactOrPrefixMatch: ranked.contains { $0.hasExactOrPrefixMatch }
    )
  }

  private static let searchCacheCapacity = 32
}
