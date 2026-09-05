import Foundation
import SQLite3

struct LookupClient: Sendable {
  var search: @Sendable (SearchQuery) async throws -> LookupSearchResults
  var entry: @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?
  var entryMatchingForm: @Sendable (String) async throws -> DictionaryEntry?
  var entriesMatchingForm: @Sendable (String) async throws -> [DictionaryEntry]
  var entriesContainingKanji: @Sendable (String) async throws -> [DictionaryEntry]

  static let live: LookupClient = {
    let client = LookupClient(
      search: { query in
        #if DEBUG
          if ProcessInfo.processInfo.arguments.contains("-InjectLookupFailure") {
            throw LookupClientError.injectedFailure
          }
        #endif
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
    #if DEBUG
      if let query = injectedOneTimeFailureQuery() {
        return injectingOneTimeFailure(for: query, live: client)
      }
    #endif
    return client
  }()

  #if DEBUG
    static func injectingOneTimeFailure(for failedQuery: SearchQuery, live: LookupClient)
      -> LookupClient
    {
      let failure = InjectedLookupFailure()
      return LookupClient(
        search: { query in
          if query == failedQuery, try await failure.consumeFailure() {
            throw LookupClientError.injectedFailure
          }
          return try await live.search(query)
        },
        entry: live.entry,
        entryMatchingForm: live.entryMatchingForm,
        entriesMatchingForm: live.entriesMatchingForm,
        entriesContainingKanji: live.entriesContainingKanji
      )
    }

    static func freshBundledDatabase() -> LookupClient {
      fixtureClient(LanguageReferenceData())
    }

    static func databaseFixture(_ databaseURL: URL) -> LookupClient {
      fixtureClient(
        LanguageReferenceData(databaseURL: databaseURL, validatesBundledArtifact: false))
    }

    private static func fixtureClient(_ data: LanguageReferenceData) -> LookupClient {
      return LookupClient(
        search: { query in try await data.search(query) },
        entry: { id in try await data.entry(id) },
        entryMatchingForm: { form in try await data.entry(matchingForm: form) },
        entriesMatchingForm: { form in try await data.entries(matchingForm: form) },
        entriesContainingKanji: { character in try await data.entries(containingKanji: character) }
      )
    }
  #endif
}

#if DEBUG
  enum LookupClientError: Error {
    case injectedFailure
  }

  private func injectedOneTimeFailureQuery() -> SearchQuery? {
    let arguments = ProcessInfo.processInfo.arguments
    guard
      let argumentIndex = arguments.firstIndex(of: "-InjectLookupFailureOnceQuery"),
      arguments.indices.contains(argumentIndex + 1)
    else {
      return nil
    }
    return SearchQuery(arguments[argumentIndex + 1])
  }

  private actor InjectedLookupFailure {
    private var isPending = true

    func consumeFailure() throws -> Bool {
      try Task.checkCancellation()
      guard isPending else { return false }
      isPending = false
      return true
    }
  }
#endif

private actor LanguageReferenceData {
  static let shared = LanguageReferenceData()

  private var connection: SQLiteConnection?
  private var senseRestrictionCache: [SenseRestrictionKey: Set<String>]?
  private var searchResultCache: [SearchQuery: LookupSearchResults] = [:]
  private var searchCacheOrder: [SearchQuery] = []
  private let databaseURL: URL?
  private let validatesBundledArtifact: Bool
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
    if query.isASCII,
      let japaneseReading = try rankedEnglish(query, exactFormOnly: true).first?.entry.reading
    {
      let refinement = SearchQuery(japaneseReading)
      let refinedResults = try searchOnce(refinement)
      let literalQuery = literalSearchQueryPolicy.literalQuery(for: query)
      var literalResults = try searchLiteralEnglish(literalQuery)
      if !refinedResults.isEmpty, !literalResults.isEmpty {
        if let exactFormEntry = try entry(matchingForm: query.value),
          (literalResults.best + literalResults.additional).contains(where: {
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
      if let primaryIndex = deinflectedResults.firstIndex(where: { !$0.best.isEmpty }) {
        let deinflectedBest = Self.uniqued(deinflectedResults[primaryIndex].best)
        let bestIDs = Set(deinflectedBest.map(\.id))
        let alternateMatches = deinflectedResults.dropFirst(primaryIndex + 1).flatMap {
          $0.best + $0.additional
        }
        let displacedMatches = Self.uniqued(
          alternateMatches + directResults.best + directResults.additional
        ).filter { !bestIDs.contains($0.id) }
        return LookupSearchResults(
          best: deinflectedBest,
          additional: Array(displacedMatches.prefix(max(0, 60 - deinflectedBest.count))),
          usesPrimaryEntryExamples: true
        )
      }
    }
    if query.isASCII,
      !directResults.isEmpty,
      let exactFormEntry = try entry(matchingForm: query.value),
      (directResults.best + directResults.additional).contains(where: { $0.id == exactFormEntry.id }
      )
    {
      return directResults.usingPrimaryEntryExamples()
    }
    guard directResults.isEmpty else { return directResults }
    let analyzedResults = try await japaneseTextAnalysis.lookupSegments(query).compactMap {
      segment in
      let segmentResults = try searchOnce(segment)
      return (segmentResults.best + segmentResults.additional).first {
        $0.headword == segment.value
      }
        ?? segmentResults.best.first
    }
    if analyzedResults.count > 1 || (query.isMixedScript && !analyzedResults.isEmpty) {
      return LookupSearchResults(
        best: Array(Self.uniqued(analyzedResults)),
        additional: [],
        presentation: .discoveredWords,
        hasExactOrPrefixMatch: false
      )
    }
    if query.isMixedScript {
      for segment in query.japaneseSegments {
        let results = try searchOnce(segment)
        if !results.isEmpty {
          return LookupSearchResults(
            best: results.best,
            additional: results.additional,
            presentation: .discoveredWords,
            hasExactOrPrefixMatch: false
          )
        }
      }
    }
    return .empty
  }

  func entry(_ id: LanguageReferenceID) throws -> DictionaryEntry? {
    let statement = try prepare(Self.equivalentEntriesByIDSQL)
    defer { sqlite3_finalize(statement) }
    bind(id.rawValue, at: 1, to: statement)
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
    bind(character, at: 1, to: candidateStatement)
    bind(character, at: 2, to: candidateStatement)
    var orderedFingerprints: [Data] = []
    sqlite3_bind_int(candidateStatement, 3, 24)
    while try checkedSQLiteStep(candidateStatement) == .row {
      orderedFingerprints.append(Self.data(column: 0, statement: candidateStatement))
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
      bind(fingerprint, at: Int32(offset + 1), to: statement)
    }
    var groups: [String: [DictionaryEntry]] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let fingerprint = Self.string(column: 17, statement: statement)
      groups[fingerprint, default: []].append(entry)
    }
    return orderedFingerprints.compactMap { fingerprint in
      let fingerprintHex = fingerprint.map { String(format: "%02x", $0) }.joined()
      return LanguageReferenceIdentity.normalizedEntry(groups[fingerprintHex] ?? [])
    }
  }

  private static func uniqued(_ entries: [DictionaryEntry]) -> [DictionaryEntry] {
    var seen = Set<LanguageReferenceID>()
    return entries.filter { seen.insert($0.id).inserted }
  }

  private func searchLiteralEnglish(_ query: SearchQuery) throws -> LookupSearchResults {
    try searchOnce(query)
  }

  private func searchOnce(_ query: SearchQuery) throws -> LookupSearchResults {
    guard !query.isEmpty else { return .empty }

    let ranked = query.isASCII ? try rankedEnglish(query) : try rankedJapanese(query)
    guard !ranked.isEmpty else { return .empty }
    let leadingPresentationRank = ranked[0].presentationRank
    let best = ranked.prefix { $0.presentationRank == leadingPresentationRank }.map(\.entry)
    let additionalAllowance = max(0, 60 - best.count)
    let additional = ranked.dropFirst(best.count).prefix(additionalAllowance).map(\.entry)
    return LookupSearchResults(
      best: Array(best),
      additional: Array(additional),
      hasExactOrPrefixMatch: ranked.contains { $0.hasExactOrPrefixMatch }
    )
  }

  private func rankedEnglish(
    _ query: SearchQuery,
    exactFormOnly: Bool = false
  ) throws -> [RankedDictionaryEntry] {
    guard exactFormOnly || Self.hasSearchTerms(query.value) else { return [] }
    let glossMatches =
      exactFormOnly
      ? [:]
      : try glossEvidence(
        query: query,
        matchExpression: Self.ftsPhrase(query.value),
        restrictions: try senseRestrictions()
      )
    let romajiMatches = try romajiEvidence(query: query, exactFormOnly: exactFormOnly)
    let statement = try prepare(
      exactFormOnly ? Self.exactASCIICandidateSQL : Self.asciiCandidateSQL)
    defer { sqlite3_finalize(statement) }
    bind(exactFormOnly ? query.value : Self.ftsPhrase(query.value), at: 1, to: statement)
    if !exactFormOnly {
      bind(Self.ftsPrefix(query.value), at: 2, to: statement)
    }

    var ranked: [(RankedDictionaryEntry, EnglishDictionaryRank)] = []
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let fingerprint = Self.string(column: 17, statement: statement)
      let match = DictionaryMatch(
        glossEvidence: glossMatches[entry.id] ?? [],
        romajiEvidence: romajiMatches[entry.id] ?? [],
        formEvidence: [],
        displayedFormPriority: Self.priorityProfile(from: statement, startingAt: 18)
      )
      guard let selectedGloss = match.glossEvidence.min(by: Self.glossEvidencePrecedes),
        !match.romajiEvidence.isEmpty || !match.glossEvidence.isEmpty
      else {
        if let romaji = match.romajiEvidence.min() {
          let rank = EnglishDictionaryRank(
            lane: .romajiOnly,
            corroborationRank: 0,
            romajiSpecificityRank: romaji.rawValue,
            senseOrder: 0,
            priorityPresenceRank: match.displayedFormPriority.isMarked ? 0 : 1,
            relation: .glossToken,
            priorityProfile: match.displayedFormPriority,
            glossOrder: 0,
            headwordLength: entry.headword.count,
            semanticFingerprint: fingerprint
          )
          ranked.append(
            (
              RankedDictionaryEntry(
                entry: entry,
                presentationRank: rank.presentationRank,
                hasExactOrPrefixMatch: romaji != .contains,
                semanticFingerprint: fingerprint
              ), rank
            ))
        }
        continue
      }
      let lane: DictionaryMatch.EvidenceLane =
        selectedGloss.relation == .glossToken
        ? .tokenGloss : .strongGloss
      let corroborated =
        lane == .strongGloss
        && match.romajiEvidence.contains(where: { $0 == .exact || $0 == .prefix })
      let rank = EnglishDictionaryRank(
        lane: lane,
        corroborationRank: corroborated ? 0 : 1,
        romajiSpecificityRank: 0,
        senseOrder: selectedGloss.senseOrder,
        priorityPresenceRank: match.displayedFormPriority.isMarked ? 0 : 1,
        relation: selectedGloss.relation,
        priorityProfile: match.displayedFormPriority,
        glossOrder: selectedGloss.glossOrder,
        headwordLength: entry.headword.count,
        semanticFingerprint: fingerprint
      )
      ranked.append(
        (
          RankedDictionaryEntry(
            entry: entry,
            presentationRank: rank.presentationRank,
            hasExactOrPrefixMatch: lane == .strongGloss || corroborated,
            semanticFingerprint: fingerprint
          ), rank
        ))
    }
    return Self.deduplicated(ranked.sorted { $0.1 < $1.1 }.map(\.0))
  }

  private func glossEvidence(
    query: SearchQuery,
    matchExpression: String,
    restrictions: [SenseRestrictionKey: Set<String>]
  ) throws -> [LanguageReferenceID: [DictionaryMatch.GlossEvidence]] {
    let glossStatement = try prepare(Self.glossEvidenceSQL)
    defer { sqlite3_finalize(glossStatement) }
    bind(matchExpression, at: 1, to: glossStatement)
    var result: [LanguageReferenceID: [DictionaryMatch.GlossEvidence]] = [:]
    while try checkedSQLiteStep(glossStatement) == .row {
      let entryID = LanguageReferenceID(rawValue: Self.string(column: 0, statement: glossStatement))
      let senseOrder = Int(sqlite3_column_int(glossStatement, 1))
      let written =
        restrictions[
          SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: .written)
        ] ?? []
      let reading =
        restrictions[
          SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: .reading)
        ] ?? []
      let displayedHeadword = SearchQuery(Self.string(column: 5, statement: glossStatement)).value
      let displayedReading = SearchQuery(Self.string(column: 6, statement: glossStatement)).value
      guard written.isEmpty || written.contains(displayedHeadword),
        reading.isEmpty || reading.contains(displayedReading),
        let relation = Self.glossRelation(
          query: query.value, gloss: Self.string(column: 3, statement: glossStatement))
      else { continue }
      let parts: [PartOfSpeech] = try Self.decode(column: 4, statement: glossStatement)
      result[entryID, default: []].append(
        DictionaryMatch.GlossEvidence(
          relation: relation,
          senseOrder: senseOrder,
          glossOrder: Int(sqlite3_column_int(glossStatement, 2)),
          partsOfSpeech: parts,
          restrictedWrittenForms: written.sorted(),
          restrictedReadingForms: reading.sorted()
        )
      )
    }
    return result
  }

  private func romajiEvidence(
    query: SearchQuery,
    exactFormOnly: Bool = false
  ) throws -> [LanguageReferenceID: [DictionaryMatch.RomajiRelation]] {
    let romajiStatement = try prepare(
      exactFormOnly ? Self.exactRomajiEvidenceSQL : Self.romajiEvidenceSQL
    )
    defer { sqlite3_finalize(romajiStatement) }
    bind(
      exactFormOnly ? query.value : Self.ftsPrefix(query.value),
      at: 1,
      to: romajiStatement
    )
    var result: [LanguageReferenceID: Set<DictionaryMatch.RomajiRelation>] = [:]
    while try checkedSQLiteStep(romajiStatement) == .row {
      let entryID = LanguageReferenceID(
        rawValue: Self.string(column: 0, statement: romajiStatement))
      let form = Self.string(column: 1, statement: romajiStatement)
      result[entryID, default: []].insert(
        form == query.value ? .exact : form.hasPrefix(query.value) ? .prefix : .contains
      )
    }
    return result.mapValues { $0.sorted() }
  }

  private func rankedJapanese(
    _ query: SearchQuery,
    exactFormOnly: Bool = false
  ) throws -> [RankedDictionaryEntry] {
    let statement = try prepare(
      exactFormOnly ? Self.exactJapaneseCandidateSQL : Self.japaneseCandidateSQL
    )
    defer { sqlite3_finalize(statement) }
    bind(query.value, at: 1, to: statement)
    var entries: [LanguageReferenceID: DictionaryEntry] = [:]
    var fingerprints: [LanguageReferenceID: String] = [:]
    var senseCounts: [LanguageReferenceID: Int] = [:]
    var evidence: [LanguageReferenceID: Set<DictionaryMatch.FormEvidence>] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let form = Self.string(column: 18, statement: statement)
      guard let kind = SearchFormKind(rawValue: Int(sqlite3_column_int(statement, 19))) else {
        throw LookupDatabaseError.invalidDictionaryRankingMetadata
      }
      let exact = form == query.value
      let prefix = form.hasPrefix(query.value)
      let relation = DictionaryMatch.FormRelation(
        rawValue: (kind == .written ? 0 : 1) + (exact ? 0 : prefix ? 2 : 4)
      )!
      let profile = Self.priorityProfile(from: statement, startingAt: 21)
      entries[entry.id] = entry
      fingerprints[entry.id] = Self.string(column: 17, statement: statement)
      senseCounts[entry.id] = Int(sqlite3_column_int(statement, 20))
      evidence[entry.id, default: []].insert(
        DictionaryMatch.FormEvidence(
          relation: relation, normalizedForm: form, priorityProfile: profile)
      )
    }
    let ranked = entries.compactMap {
      id, entry -> (RankedDictionaryEntry, JapaneseDictionaryRank)? in
      guard let selected = evidence[id]?.min(by: Self.formEvidencePrecedes),
        let fingerprint = fingerprints[id]
      else { return nil }
      let breadth = senseCounts[id] ?? 0
      let rank = JapaneseDictionaryRank(
        relation: selected.relation,
        priorityProfile: selected.priorityProfile,
        senseBreadthRank: -breadth,
        headwordLength: entry.headword.count,
        semanticFingerprint: fingerprint
      )
      return (
        RankedDictionaryEntry(
          entry: entry,
          presentationRank: rank.presentationRank,
          hasExactOrPrefixMatch: selected.relation.rawValue < 4,
          semanticFingerprint: fingerprint
        ),
        rank
      )
    }.sorted { $0.1 < $1.1 }
    return Self.deduplicated(ranked.map(\.0))
  }

  private func senseRestrictions() throws -> [SenseRestrictionKey: Set<String>] {
    if let senseRestrictionCache { return senseRestrictionCache }
    let restrictionStatement = try prepare(Self.allSenseRestrictionsSQL)
    defer { sqlite3_finalize(restrictionStatement) }
    var restrictions: [SenseRestrictionKey: Set<String>] = [:]
    while try checkedSQLiteStep(restrictionStatement) == .row {
      guard
        let kind = SearchFormKind(
          rawValue: Int(sqlite3_column_int(restrictionStatement, 2))
        )
      else {
        throw LookupDatabaseError.invalidDictionaryRankingMetadata
      }
      let key = SenseRestrictionKey(
        entryID: LanguageReferenceID(
          rawValue: Self.string(column: 0, statement: restrictionStatement)),
        senseOrder: Int(sqlite3_column_int(restrictionStatement, 1)),
        kind: kind
      )
      restrictions[key, default: []].insert(Self.string(column: 3, statement: restrictionStatement))
    }

    senseRestrictionCache = restrictions
    return restrictions
  }

  private static func priorityProfile(
    from statement: OpaquePointer,
    startingAt column: Int32
  ) -> LanguageReferencePriorityProfile {
    LanguageReferencePriorityProfile(
      primaryMarkers: PrimaryPriorityMarkers(
        rawValue: Int(sqlite3_column_int(statement, column))
      ),
      secondaryMarkers: SecondaryPriorityMarkers(
        rawValue: Int(sqlite3_column_int(statement, column + 1))
      ),
      newsFrequencyBand: sqlite3_column_type(statement, column + 2) == SQLITE_NULL
        ? nil : Int(sqlite3_column_int(statement, column + 2))
    )
  }

  private func prepare(_ sql: String) throws -> OpaquePointer {
    let database = try openDatabase()
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw LookupDatabaseError.sqlite(message: String(cString: sqlite3_errmsg(database)))
    }
    return statement
  }

  private func openDatabase() throws -> OpaquePointer {
    if let connection { return connection.pointer }
    guard
      let url = databaseURL
        ?? Bundle.module.url(forResource: "LanguageReferenceData", withExtension: "sqlite3")
    else {
      throw LookupDatabaseError.missingBundledData
    }

    var opened: OpaquePointer?
    guard
      sqlite3_open_v2(url.path, &opened, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil)
        == SQLITE_OK,
      let opened
    else {
      defer { sqlite3_close(opened) }
      throw LookupDatabaseError.sqlite(
        message: opened.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed")
    }
    if validatesBundledArtifact {
      do {
        try Self.validateDictionaryRankingMetadata(opened, databaseURL: url)
      } catch {
        sqlite3_close(opened)
        throw error
      }
    }
    connection = SQLiteConnection(pointer: opened)
    return opened
  }

  private static func validateDictionaryRankingMetadata(
    _ database: OpaquePointer,
    databaseURL: URL
  ) throws {
    let contract = try DictionaryRankingArtifactContract.bundled()
    guard
      (try FileManager.default.attributesOfItem(atPath: databaseURL.path)[.size] as? NSNumber)?
        .intValue
        == contract.databaseBytes
    else {
      throw LookupDatabaseError.invalidDictionaryRankingMetadata
    }
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database,
        "SELECT key, value FROM metadata",
        -1,
        &statement,
        nil
      ) == SQLITE_OK, let statement
    else {
      throw LookupDatabaseError.invalidDictionaryRankingMetadata
    }
    defer { sqlite3_finalize(statement) }
    var actual: [String: String] = [:]
    while sqlite3_step(statement) == SQLITE_ROW {
      actual[string(column: 0, statement: statement)] = string(column: 1, statement: statement)
    }
    guard try decodedMetadataString("dictionary_ranking_policy", from: actual) == contract.policy,
      try decodedMetadataString("dictionary_ranking_schema_version", from: actual)
        == contract.schemaVersion,
      try decodedMetadataString("dictionary_ranking_mapping_sha256", from: actual)
        == contract.mappingSHA256,
      try decodedMetadata(
        DictionaryRankingArtifactContract.EvidenceCounts.self,
        key: "dictionary_ranking_evidence",
        from: actual
      ) == contract.evidenceCounts,
      try decodedMetadata(
        DictionaryRankingArtifactContract.SearchIndex.self,
        key: "dictionary_search_index",
        from: actual
      ) == contract.searchIndex,
      contract.searchIndex.schema == "zenbu.dictionary-search-index.v1",
      contract.searchIndex.technology == "sqlite-fts4",
      contract.semanticEquivalence.normalization == "opaque-app-id-lexicographic-min-v1",
      contract.toolSHA256.metadata.allSatisfy({ key, expected in
        (try? decodedMetadataString(key, from: actual)) == expected
      })
    else { throw LookupDatabaseError.invalidDictionaryRankingMetadata }

    var equivalenceStatement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database,
        "SELECT count(*), total(group_size) FROM (SELECT count(*) AS group_size FROM entries GROUP BY semantic_fingerprint HAVING count(*) > 1)",
        -1,
        &equivalenceStatement,
        nil
      ) == SQLITE_OK, let equivalenceStatement
    else {
      throw LookupDatabaseError.invalidDictionaryRankingMetadata
    }
    defer { sqlite3_finalize(equivalenceStatement) }
    guard sqlite3_step(equivalenceStatement) == SQLITE_ROW,
      sqlite3_column_int(equivalenceStatement, 0) == contract.semanticEquivalence.duplicateGroups,
      sqlite3_column_int(equivalenceStatement, 1) == contract.semanticEquivalence.sourceRows,
      sqlite3_step(equivalenceStatement) == SQLITE_DONE
    else { throw LookupDatabaseError.invalidDictionaryRankingMetadata }

    for (table, expectedCount) in contract.evidenceCounts.tableCounts {
      var countStatement: OpaquePointer?
      guard
        sqlite3_prepare_v2(database, "SELECT count(*) FROM \(table)", -1, &countStatement, nil)
          == SQLITE_OK,
        let countStatement
      else {
        throw LookupDatabaseError.invalidDictionaryRankingMetadata
      }
      defer { sqlite3_finalize(countStatement) }
      guard sqlite3_step(countStatement) == SQLITE_ROW,
        sqlite3_column_int64(countStatement, 0) == Int64(expectedCount),
        sqlite3_step(countStatement) == SQLITE_DONE
      else {
        throw LookupDatabaseError.invalidDictionaryRankingMetadata
      }
    }
    for (table, expectedCount) in [
      ("dictionary_gloss_fts", contract.searchIndex.glossRows),
      ("dictionary_form_fts", contract.searchIndex.formRows),
    ] {
      var countStatement: OpaquePointer?
      guard
        sqlite3_prepare_v2(database, "SELECT count(*) FROM \(table)", -1, &countStatement, nil)
          == SQLITE_OK,
        let countStatement
      else {
        throw LookupDatabaseError.invalidDictionaryRankingMetadata
      }
      defer { sqlite3_finalize(countStatement) }
      guard sqlite3_step(countStatement) == SQLITE_ROW,
        sqlite3_column_int64(countStatement, 0) == Int64(expectedCount),
        sqlite3_step(countStatement) == SQLITE_DONE
      else {
        throw LookupDatabaseError.invalidDictionaryRankingMetadata
      }
    }
  }

  private static func decodedMetadataString(
    _ key: String,
    from metadata: [String: String]
  ) throws -> String {
    try decodedMetadata(String.self, key: key, from: metadata)
  }

  private static func decodedMetadata<Value: Decodable>(
    _ type: Value.Type,
    key: String,
    from metadata: [String: String]
  ) throws -> Value {
    guard let value = metadata[key] else {
      throw LookupDatabaseError.invalidDictionaryRankingMetadata
    }
    return try JSONDecoder().decode(type, from: Data(value.utf8))
  }

  private func bind(_ value: String, at index: Int32, to statement: OpaquePointer) {
    sqlite3_bind_text(statement, index, value, -1, Self.transientDestructor)
  }

  private func bind(_ value: Data, at index: Int32, to statement: OpaquePointer) {
    _ = value.withUnsafeBytes { bytes in
      sqlite3_bind_blob(
        statement, index, bytes.baseAddress, Int32(bytes.count), Self.transientDestructor)
    }
  }

  private func decodeEntry(from statement: OpaquePointer) throws -> DictionaryEntry {
    let meanings: [String] = try Self.decode(column: 7, statement: statement)
    let partsOfSpeech: [PartOfSpeech] = try Self.decode(column: 8, statement: statement)
    let writtenForms: [DictionaryForm] = try Self.decode(column: 9, statement: statement)
    let readingForms: [DictionaryForm] = try Self.decode(column: 10, statement: statement)
    let senses: [DictionarySense] = try Self.decode(column: 11, statement: statement)
    let relationships: [DictionaryRelationship] = try Self.decode(column: 12, statement: statement)
    let pitchAccent: PitchAccent? =
      sqlite3_column_type(statement, 13) == SQLITE_NULL
      ? nil
      : try Self.decode(column: 13, statement: statement)
    return DictionaryEntry(
      id: LanguageReferenceID(rawValue: Self.string(column: 0, statement: statement)),
      noteID: WordNoteID(rawValue: Self.string(column: 1, statement: statement)),
      sourceProvenances: [
        LanguageReferenceProvenance(
          sourceIdentity: Self.string(column: 2, statement: statement),
          sourceRecordID: Self.string(column: 3, statement: statement)
        )
      ],
      reading: Self.string(column: 5, statement: statement),
      headword: Self.string(column: 4, statement: statement),
      summary: Self.string(column: 6, statement: statement),
      meanings: meanings,
      partsOfSpeech: partsOfSpeech,
      writtenForms: writtenForms,
      readingForms: readingForms,
      senses: senses,
      relationships: relationships,
      pitchAccent: pitchAccent,
      isCommon: sqlite3_column_int(statement, 14) == 1
    )
  }

  private static func string(column: Int32, statement: OpaquePointer) -> String {
    guard let text = sqlite3_column_text(statement, column) else { return "" }
    return String(cString: text)
  }

  private static func data(column: Int32, statement: OpaquePointer) -> Data {
    guard let bytes = sqlite3_column_blob(statement, column) else { return Data() }
    return Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, column)))
  }

  private static func decode<Value: Decodable>(column: Int32, statement: OpaquePointer) throws
    -> Value
  {
    let data = Data(string(column: column, statement: statement).utf8)
    return try JSONDecoder().decode(Value.self, from: data)
  }

  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
  private static let searchCacheCapacity = 32

  private static func glossRelation(query: String, gloss: String) -> DictionaryMatch.GlossRelation?
  {
    let value = SearchQuery(gloss).value
    if value == query { return .exactGloss }
    if value.hasPrefix("\(query) (") { return .qualifiedGloss }
    if value == "to \(query)" { return .exactInfinitive }
    if value.hasPrefix("to \(query) (") { return .qualifiedInfinitive }
    let escaped = NSRegularExpression.escapedPattern(for: query)
    if value.range(of: "(?:^|[^a-z])\(escaped)(?:$|[^a-z])", options: .regularExpression) != nil {
      return .glossToken
    }
    return nil
  }

  private static func hasSearchTerms(_ value: String) -> Bool {
    value.unicodeScalars.contains { CharacterSet.alphanumerics.contains($0) }
  }

  private static func ftsPhrase(_ value: String) -> String {
    "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
  }

  private static func ftsPrefix(_ value: String) -> String {
    guard value.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) }) else {
      return ftsPhrase(value)
    }
    return value + "*"
  }

  private static func glossEvidencePrecedes(
    _ lhs: DictionaryMatch.GlossEvidence,
    _ rhs: DictionaryMatch.GlossEvidence
  ) -> Bool {
    let lhsLane = lhs.relation == .glossToken ? 1 : 0
    let rhsLane = rhs.relation == .glossToken ? 1 : 0
    if lhsLane != rhsLane { return lhsLane < rhsLane }
    if lhs.senseOrder != rhs.senseOrder { return lhs.senseOrder < rhs.senseOrder }
    if lhs.relation != rhs.relation { return lhs.relation < rhs.relation }
    return lhs.glossOrder < rhs.glossOrder
  }

  private static func formEvidencePrecedes(
    _ lhs: DictionaryMatch.FormEvidence,
    _ rhs: DictionaryMatch.FormEvidence
  ) -> Bool {
    if lhs.relation != rhs.relation { return lhs.relation < rhs.relation }
    if lhs.priorityProfile < rhs.priorityProfile { return true }
    if rhs.priorityProfile < lhs.priorityProfile { return false }
    return lhs.normalizedForm < rhs.normalizedForm
  }

  private static func deduplicated(_ entries: [RankedDictionaryEntry]) -> [RankedDictionaryEntry] {
    var groups: [String: [RankedDictionaryEntry]] = [:]
    var orderedFingerprints: [String] = []
    for entry in entries {
      if groups[entry.semanticFingerprint] == nil {
        orderedFingerprints.append(entry.semanticFingerprint)
      }
      groups[entry.semanticFingerprint, default: []].append(entry)
    }
    return orderedFingerprints.compactMap { fingerprint in
      guard let group = groups[fingerprint], let leading = group.first,
        let normalized = LanguageReferenceIdentity.normalizedEntry(
          group.map(\.entry),
          preserving: leading.entry
        )
      else { return nil }
      return RankedDictionaryEntry(
        entry: normalized,
        presentationRank: leading.presentationRank,
        hasExactOrPrefixMatch: group.contains(where: \.hasExactOrPrefixMatch),
        semanticFingerprint: fingerprint
      )
    }
  }

  private static let selectedColumns = """
    lower(hex(e.id)), e.note_identity, e.source_identity, CAST(e.source_record_id AS TEXT), e.headword, e.reading, e.summary,
    e.meanings_json, e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json,
    e.senses_json, e.relationships_json, e.pitch_accent_json,
    e.is_common, e.rank_score, length(e.headword), lower(hex(e.semantic_fingerprint))
    """

  private static let equivalentEntriesByIDSQL = """
    SELECT \(selectedColumns)
    FROM entries e
    WHERE e.semantic_fingerprint = (
      SELECT semantic_fingerprint FROM entries WHERE lower(hex(id)) = ?
    )
    ORDER BY lower(hex(e.id))
    """

  private static let kanjiCandidateRowsSQL = """
    SELECT e.semantic_fingerprint AS fingerprint
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    WHERE f.kind = \(SearchFormKind.written.rawValue) AND instr(f.form, ?) > 0
    GROUP BY e.semantic_fingerprint
    ORDER BY
      MIN(CASE WHEN instr(e.headword, ?) = 1 THEN 0 ELSE 1 END),
      MIN(length(e.headword)), MAX(e.is_common) DESC, MAX(e.rank_score) DESC, e.semantic_fingerprint
    LIMIT ?
    """

  private static let asciiCandidateSQL = """
    WITH candidates AS (
      SELECT g.entry_id
      FROM dictionary_gloss_fts x
      JOIN gloss_atoms g ON g.rowid = x.docid
      WHERE dictionary_gloss_fts MATCH ?
      UNION
      SELECT f.entry_id
      FROM dictionary_form_fts x
      JOIN forms f ON f.rowid = x.docid
      WHERE dictionary_form_fts MATCH ? AND f.kind = \(SearchFormKind.romaji.rawValue)
    )
    SELECT \(selectedColumns), p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM candidates c
    JOIN entries e ON e.id = c.entry_id
    LEFT JOIN form_priority_profiles p
      ON p.entry_id = e.id AND p.form = e.headword
      AND p.kind = CASE WHEN e.headword = e.reading
        THEN \(SearchFormKind.reading.rawValue) ELSE \(SearchFormKind.written.rawValue) END
    """

  private static let exactASCIICandidateSQL = """
    SELECT \(selectedColumns), p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    LEFT JOIN form_priority_profiles p
      ON p.entry_id = e.id AND p.form = e.headword
      AND p.kind = CASE WHEN e.headword = e.reading
        THEN \(SearchFormKind.reading.rawValue) ELSE \(SearchFormKind.written.rawValue) END
    WHERE f.kind = \(SearchFormKind.romaji.rawValue) AND f.form = ?
    """

  private static let japaneseCandidateSQL = """
    SELECT \(selectedColumns), f.form, f.kind,
      (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id),
      p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    LEFT JOIN form_priority_profiles p
      ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
    WHERE f.kind IN (\(SearchFormKind.written.rawValue), \(SearchFormKind.reading.rawValue))
      AND instr(f.form, ?) > 0
      AND (
        f.kind != \(SearchFormKind.reading.rawValue)
        OR NOT EXISTS (
          SELECT 1 FROM reading_form_restrictions r
          WHERE r.entry_id = f.entry_id AND r.reading = f.form
        )
        OR EXISTS (
          SELECT 1 FROM reading_form_restrictions r
          WHERE r.entry_id = f.entry_id AND r.reading = f.form
            AND r.written_form = e.headword
        )
      )
    """

  private static let exactJapaneseCandidateSQL = """
    SELECT \(selectedColumns), f.form, f.kind,
      (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id),
      p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    LEFT JOIN form_priority_profiles p
      ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
    WHERE f.kind IN (\(SearchFormKind.written.rawValue), \(SearchFormKind.reading.rawValue))
      AND f.form = ?
      AND (
        f.kind != \(SearchFormKind.reading.rawValue)
        OR NOT EXISTS (
          SELECT 1 FROM reading_form_restrictions r
          WHERE r.entry_id = f.entry_id AND r.reading = f.form
        )
        OR EXISTS (
          SELECT 1 FROM reading_form_restrictions r
          WHERE r.entry_id = f.entry_id AND r.reading = f.form
            AND r.written_form = e.headword
        )
      )
    """

  private static let glossEvidenceSQL = """
    SELECT lower(hex(g.entry_id)), g.sense_order, g.gloss_order, g.text,
      s.parts_of_speech_json, e.headword, e.reading
    FROM dictionary_gloss_fts x
    JOIN gloss_atoms g ON g.rowid = x.docid
    JOIN canonical_senses s ON s.entry_id = g.entry_id AND s.sense_order = g.sense_order
    JOIN entries e ON e.id = g.entry_id
    WHERE dictionary_gloss_fts MATCH ?
    """

  private static let romajiEvidenceSQL = """
    SELECT lower(hex(f.entry_id)), f.form
    FROM dictionary_form_fts x
    JOIN forms f ON f.rowid = x.docid
    WHERE dictionary_form_fts MATCH ? AND f.kind = \(SearchFormKind.romaji.rawValue)
    """

  private static let exactRomajiEvidenceSQL = """
    SELECT lower(hex(entry_id)), form FROM forms
    WHERE kind = \(SearchFormKind.romaji.rawValue) AND form = ?
    """

  private static let allSenseRestrictionsSQL = """
    SELECT lower(hex(entry_id)), sense_order, kind, form FROM sense_form_restrictions
    """

}

private enum SearchFormKind: Int {
  case written = 0
  case reading = 1
  case romaji = 2
}

private struct RankedDictionaryEntry {
  let entry: DictionaryEntry
  let presentationRank: DictionaryPresentationRank
  let hasExactOrPrefixMatch: Bool
  let semanticFingerprint: String
}

private struct SenseRestrictionKey: Hashable {
  let entryID: LanguageReferenceID
  let senseOrder: Int
  let kind: SearchFormKind
}

private final class SQLiteConnection: @unchecked Sendable {
  let pointer: OpaquePointer

  init(pointer: OpaquePointer) {
    self.pointer = pointer
  }

  deinit {
    sqlite3_close(pointer)
  }
}

enum LookupDatabaseError: Error {
  case missingBundledData
  case invalidDictionaryRankingMetadata
  case sqlite(message: String)
}
