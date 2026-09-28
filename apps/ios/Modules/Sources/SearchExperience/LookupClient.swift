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
    // Same lookup as `entry(matchingForm: query.value)`, run once for both uses below.
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
        // An exact dictionary form stays first (した is 下 and 舌 before する); the
        // deinflected lemmas follow it ahead of prefix and contains matches.
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

  /// Dictionary entries for kana and kanji inflections, grouped by deinflection chain length
  /// so a direct conjugation (まけたら → 負ける) outranks a longer, less plausible chain.
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
    sqliteBind(exactFormOnly ? query.value : Self.ftsPhrase(query.value), at: 1, to: statement)
    if !exactFormOnly {
      sqliteBind(Self.ftsPrefix(query.value), at: 2, to: statement)
    }

    var ranked: [(RankedDictionaryEntry, EnglishDictionaryRank)] = []
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let fingerprint = sqliteText(statement, 17)
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
                legacyPresentationRank: .english(rank),
                hasExactOrPrefixMatch: romaji != .contains,
                semanticFingerprint: fingerprint,
                matchedSummary: nil
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
            legacyPresentationRank: .english(rank),
            hasExactOrPrefixMatch: lane == .strongGloss || corroborated,
            semanticFingerprint: fingerprint,
            matchedSummary: selectedGloss.meaning
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
    sqliteBind(matchExpression, at: 1, to: glossStatement)
    let glossToken = try Self.glossTokenPattern(query.value)
    var result: [LanguageReferenceID: [DictionaryMatch.GlossEvidence]] = [:]
    while try checkedSQLiteStep(glossStatement) == .row {
      let entryID = LanguageReferenceID(rawValue: sqliteText(glossStatement, 0))
      let senseOrder = Int(sqlite3_column_int(glossStatement, 1))
      let written =
        restrictions[
          SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: .written)
        ] ?? []
      let reading =
        restrictions[
          SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: .reading)
        ] ?? []
      let displayedHeadword = SearchQuery(sqliteText(glossStatement, 5)).value
      let displayedReading = SearchQuery(sqliteText(glossStatement, 6)).value
      let meaning = sqliteText(glossStatement, 3)
      guard written.isEmpty || written.contains(displayedHeadword),
        reading.isEmpty || reading.contains(displayedReading),
        let relation = Self.glossRelation(query: query.value, gloss: meaning, token: glossToken)
      else { continue }
      let parts: [PartOfSpeech] = try Self.decode(column: 4, statement: glossStatement)
      result[entryID, default: []].append(
        DictionaryMatch.GlossEvidence(
          relation: relation,
          senseOrder: senseOrder,
          glossOrder: Int(sqlite3_column_int(glossStatement, 2)),
          meaning: meaning,
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
    sqliteBind(
      exactFormOnly ? query.value : Self.ftsPrefix(query.value),
      at: 1,
      to: romajiStatement
    )
    var result: [LanguageReferenceID: Set<DictionaryMatch.RomajiRelation>] = [:]
    while try checkedSQLiteStep(romajiStatement) == .row {
      let entryID = LanguageReferenceID(
        rawValue: sqliteText(romajiStatement, 0))
      let form = sqliteText(romajiStatement, 1)
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
    sqliteBind(query.value, at: 1, to: statement)
    var entries: [LanguageReferenceID: DictionaryEntry] = [:]
    var fingerprints: [LanguageReferenceID: String] = [:]
    var senseCounts: [LanguageReferenceID: Int] = [:]
    var evidence: [LanguageReferenceID: Set<DictionaryMatch.FormEvidence>] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let form = sqliteText(statement, 18)
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
      fingerprints[entry.id] = sqliteText(statement, 17)
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
          legacyPresentationRank: .japanese(rank),
          hasExactOrPrefixMatch: selected.relation.rawValue < 4,
          semanticFingerprint: fingerprint,
          matchedSummary: nil
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
          rawValue: sqliteText(restrictionStatement, 0)),
        senseOrder: Int(sqlite3_column_int(restrictionStatement, 1)),
        kind: kind
      )
      restrictions[key, default: []].insert(sqliteText(restrictionStatement, 3))
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
        ?? Bundle.languageReferenceDataURL
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
    do {
      try Self.attachCompoundPitch(opened)
    } catch {
      sqlite3_close(opened)
      throw error
    }
    connection = SQLiteConnection(pointer: opened)
    return opened
  }

  /// Attaches the estimated pitch of compounds UniDic doesn't list whole, which
  /// `selectedColumns` falls back to. Without the bundled file an empty table stands in.
  private static func attachCompoundPitch(_ database: OpaquePointer) throws {
    let url = Bundle.module.url(forResource: "CompoundPitch", withExtension: "sqlite3")
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(database, "ATTACH DATABASE ? AS compound_pitch", -1, &statement, nil)
        == SQLITE_OK,
      let statement
    else { throw LookupDatabaseError.sqlite(message: String(cString: sqlite3_errmsg(database))) }
    defer { sqlite3_finalize(statement) }
    sqliteBind(url?.path ?? ":memory:", at: 1, to: statement)
    guard sqlite3_step(statement) == SQLITE_DONE,
      url != nil
        || sqlite3_exec(
          database,
          "CREATE TABLE compound_pitch.entry_pitch (entry_id BLOB PRIMARY KEY, pitch_accent_json TEXT NOT NULL)",
          nil, nil, nil) == SQLITE_OK
    else { throw LookupDatabaseError.sqlite(message: String(cString: sqlite3_errmsg(database))) }
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
      actual[sqliteText(statement, 0)] = sqliteText(statement, 1)
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

    let tableCounts =
      contract.evidenceCounts.tableCounts + [
        ("dictionary_gloss_fts", contract.searchIndex.glossRows),
        ("dictionary_form_fts", contract.searchIndex.formRows),
      ]
    for (table, expectedCount) in tableCounts {
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
    return try decoder.decode(type, from: Data(value.utf8))
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
      id: LanguageReferenceID(rawValue: sqliteText(statement, 0)),
      sourceProvenances: [
        LanguageReferenceProvenance(
          sourceIdentity: sqliteText(statement, 2),
          sourceRecordID: sqliteText(statement, 3)
        )
      ],
      reading: sqliteText(statement, 5),
      headword: sqliteText(statement, 4),
      summary: sqliteText(statement, 6),
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

  private static func decode<Value: Decodable>(column: Int32, statement: OpaquePointer) throws
    -> Value
  {
    try decoder.decode(Value.self, from: Data(sqliteText(statement, column).utf8))
  }

  private static let decoder = JSONDecoder()
  private static let searchCacheCapacity = 32

  /// Matches `query` as a whole token: not preceded or followed by another ASCII letter.
  private static func glossTokenPattern(_ query: String) throws -> NSRegularExpression {
    let escaped = NSRegularExpression.escapedPattern(for: query)
    return try NSRegularExpression(pattern: "(?:^|[^a-z])\(escaped)(?:$|[^a-z])")
  }

  private static func glossRelation(
    query: String, gloss: String, token: NSRegularExpression
  ) -> DictionaryMatch.GlossRelation? {
    let value = SearchQuery(gloss).value
    if value == query { return .exactGloss }
    if value.hasPrefix("\(query) (") { return .qualifiedGloss }
    if value == "to \(query)" { return .exactInfinitive }
    if value.hasPrefix("to \(query) (") { return .qualifiedInfinitive }
    let range = NSRange(value.startIndex..., in: value)
    return token.firstMatch(in: value, range: range) != nil ? .glossToken : nil
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
        let strongestMatch = group.min(by: {
          $0.presentationRank < $1.presentationRank
        }),
        let normalized = LanguageReferenceIdentity.normalizedEntry(
          group.map(\.entry),
          preserving: leading.entry
        )
      else { return nil }
      return RankedDictionaryEntry(
        entry: normalized,
        presentationRank: strongestMatch.presentationRank,
        legacyPresentationRank: leading.legacyPresentationRank,
        hasExactOrPrefixMatch: group.contains(where: \.hasExactOrPrefixMatch),
        semanticFingerprint: fingerprint,
        matchedSummary: strongestMatch.matchedSummary
      )
    }
  }

  private static func resultItems(
    for entries: [RankedDictionaryEntry]
  ) -> [LookupSearchResultItem] {
    entries.enumerated().map { fallbackOrder, entry in
        LookupSearchResultItem(
          entry: entry.entry,
          relevance: DictionaryRelevance(
            sourceOrder: 0,
            matchRank: entry.presentationRank
          ),
          fallbackOrder: fallbackOrder,
          matchedSummary: entry.matchedSummary
        )
    }
  }

  // Column 1 (note_identity) is no longer read; it leaves the artifact with the CI rebuild (#463).
  private static let selectedColumns = """
    lower(hex(e.id)), e.note_identity, e.source_identity, CAST(e.source_record_id AS TEXT), e.headword, e.reading, e.summary,
    e.meanings_json, e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json,
    e.senses_json, e.relationships_json,
    COALESCE(e.pitch_accent_json,
      (SELECT c.pitch_accent_json FROM compound_pitch.entry_pitch c WHERE c.entry_id = e.id)),
    e.is_common, e.rank_score, length(e.headword), lower(hex(e.semantic_fingerprint))
    """

  private static let equivalentEntriesByIDSQL = """
    SELECT \(selectedColumns)
    FROM entries e
    WHERE e.semantic_fingerprint = (
      SELECT semantic_fingerprint FROM entries WHERE id = ?
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
  let legacyPresentationRank: DictionaryLegacyPresentationRank
  let hasExactOrPrefixMatch: Bool
  let semanticFingerprint: String
  let matchedSummary: String?
}

private struct SenseRestrictionKey: Hashable {
  let entryID: LanguageReferenceID
  let senseOrder: Int
  let kind: SearchFormKind
}

enum LookupDatabaseError: Error {
  case missingBundledData
  case invalidDictionaryRankingMetadata
  case sqlite(message: String)
}
