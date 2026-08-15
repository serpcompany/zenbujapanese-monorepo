import Foundation
import SQLite3

struct LookupClient: Sendable {
  var search: @Sendable (SearchQuery) async throws -> LookupSearchResults
  var entry: @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?
  var entryMatchingForm: @Sendable (String) async throws -> DictionaryEntry?
  var entriesContainingKanji: @Sendable (String) async throws -> [DictionaryEntry]

  static let live = LookupClient(
    search: { query in
      #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-InjectLookupFailure") {
        throw LookupClientError.injectedFailure
      }
      if ProcessInfo.processInfo.arguments.contains("-InjectLookupFailureOnce"),
        await InjectedLookupFailure.shared.consumeFailure()
      {
        throw LookupClientError.injectedFailure
      }
      #endif
      return try await LanguageReferenceData.shared.search(query)
    },
    entry: { id in try await LanguageReferenceData.shared.entry(id) },
    entryMatchingForm: { form in try await LanguageReferenceData.shared.entry(matchingForm: form) },
    entriesContainingKanji: { character in
      try await LanguageReferenceData.shared.entries(containingKanji: character)
    }
  )
}

#if DEBUG
private enum LookupClientError: Error {
  case injectedFailure
}

private actor InjectedLookupFailure {
  static let shared = InjectedLookupFailure()
  private var isPending = true

  func consumeFailure() -> Bool {
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
  private let romajiRefinementPolicy = RomajiRefinementPolicy.captured
  private let japaneseTextAnalysis = JapaneseTextAnalysisClient.characterFallback

  func search(_ query: SearchQuery) throws -> LookupSearchResults {
    if let refinement = romajiRefinementPolicy.refinement(for: query) {
      let refinedResults = try searchOnce(refinement.japaneseReading)
      let literalResults = try searchLiteralEnglish(refinement.literalEnglishQuery)
      if !refinedResults.isEmpty, !literalResults.isEmpty {
        return LookupSearchResults(
          best: literalResults.best,
          additional: literalResults.additional,
          readingRefinement: SearchRefinement(query: refinement.japaneseReading)
        )
      }
    }

    let directResults = try searchOnce(query)
    if !directResults.hasExactOrPrefixMatch, !query.deinflectedCandidates.isEmpty {
      var deinflectedBest: [DictionaryEntry] = []
      for candidate in query.deinflectedCandidates {
        deinflectedBest.append(contentsOf: try searchOnce(candidate).best)
      }
      let uniqueDeinflectedBest = Self.uniqued(deinflectedBest)
      if !uniqueDeinflectedBest.isEmpty {
        let directMatches = Self.uniqued(directResults.best + directResults.additional)
        let bestIDs = Set(uniqueDeinflectedBest.map(\.id))
        return LookupSearchResults(
          best: uniqueDeinflectedBest,
          additional: directMatches.filter { !bestIDs.contains($0.id) },
          usesPrimaryEntryExamples: true
        )
      }
    }
    if query.isASCII,
      !directResults.isEmpty,
      let exactFormEntry = try entry(matchingForm: query.value),
      (directResults.best + directResults.additional).contains(where: { $0.id == exactFormEntry.id })
    {
      return directResults.usingPrimaryEntryExamples()
    }
    guard directResults.isEmpty else { return directResults }
    let analyzedResults = try japaneseTextAnalysis.lookupSegments(query).compactMap { segment in
      let segmentResults = try searchOnce(segment)
      return (segmentResults.best + segmentResults.additional).first { $0.headword == segment.value }
        ?? segmentResults.best.first
    }
    if analyzedResults.count > 1 || (query.isMixedScript && !analyzedResults.isEmpty) {
      return LookupSearchResults(
        best: Array(Self.uniqued(analyzedResults)),
        additional: [],
        presentation: .discoveredWords
      )
    }
    if query.isMixedScript {
      for segment in query.japaneseSegments {
        let results = try searchOnce(segment)
        if !results.isEmpty {
          return LookupSearchResults(
            best: results.best,
            additional: results.additional,
            presentation: .discoveredWords
          )
        }
      }
    }
    return .empty
  }

  func entry(_ id: LanguageReferenceID) throws -> DictionaryEntry? {
    let statement = try prepare(Self.entryByIDSQL)
    defer { sqlite3_finalize(statement) }
    bind(id.rawValue, at: 1, to: statement)
    switch try checkedSQLiteStep(statement) {
    case .row: return try decodeEntry(from: statement)
    case .done: return nil
    }
  }

  func entry(matchingForm form: String) throws -> DictionaryEntry? {
    let query = SearchQuery(form)
    guard !query.isEmpty else { return nil }
    return try (query.isASCII
      ? rankedEnglish(query)
      : rankedJapanese(query, exactFormOnly: true)
    ).first?.entry
  }

  func entries(containingKanji character: String) throws -> [DictionaryEntry] {
    let statement = try prepare(Self.entriesContainingKanjiSQL)
    defer { sqlite3_finalize(statement) }
    bind(character, at: 1, to: statement)
    bind("\(character)%", at: 2, to: statement)
    var entries: [DictionaryEntry] = []
    while try checkedSQLiteStep(statement) == .row {
      entries.append(try decodeEntry(from: statement))
    }
    return entries
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
    let bestLimit = query.isASCII ? 3 : 1
    var best = ranked.filter(\.isBestMatch).prefix(bestLimit).map(\.entry)
    var additional = ranked.filter { candidate in
      !best.contains { $0.id == candidate.entry.id }
    }.prefix(60 - best.count).map(\.entry)
    if best.isEmpty, let first = additional.first {
      best = [first]
      additional.removeFirst()
    }
    return LookupSearchResults(
      best: Array(best),
      additional: Array(additional),
      hasExactOrPrefixMatch: ranked.contains { $0.hasExactOrPrefixMatch }
    )
  }

  private func rankedEnglish(_ query: SearchQuery) throws -> [RankedDictionaryEntry] {
    let glossMatches = try glossEvidence(query: query, restrictions: try senseRestrictions())
    let romajiMatches = try romajiEvidence(query: query)
    let statement = try prepare(Self.asciiCandidateSQL)
    defer { sqlite3_finalize(statement) }
    bind(query.value, at: 1, to: statement)
    bind("%\(query.value)%", at: 2, to: statement)

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
          ranked.append((RankedDictionaryEntry(
            entry: entry,
            isBestMatch: romaji == .exact,
            hasExactOrPrefixMatch: romaji != .contains,
            semanticFingerprint: fingerprint
          ), rank))
        }
        continue
      }
      let lane: DictionaryMatch.EvidenceLane = selectedGloss.relation == .glossToken
        ? .tokenGloss : .strongGloss
      let corroborated = lane == .strongGloss
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
      ranked.append((RankedDictionaryEntry(
        entry: entry,
        isBestMatch: lane == .strongGloss,
        hasExactOrPrefixMatch: lane == .strongGloss || corroborated,
        semanticFingerprint: fingerprint
      ), rank))
    }
    return Self.deduplicated(ranked.sorted { $0.1 < $1.1 }.map(\.0))
  }

  private func glossEvidence(
    query: SearchQuery,
    restrictions: [SenseRestrictionKey: Set<String>]
  ) throws -> [LanguageReferenceID: [DictionaryMatch.GlossEvidence]] {
    let glossStatement = try prepare(Self.glossEvidenceSQL)
    defer { sqlite3_finalize(glossStatement) }
    bind(query.value, at: 1, to: glossStatement)
    var result: [LanguageReferenceID: [DictionaryMatch.GlossEvidence]] = [:]
    while try checkedSQLiteStep(glossStatement) == .row {
      let entryID = LanguageReferenceID(rawValue: Self.string(column: 0, statement: glossStatement))
      let senseOrder = Int(sqlite3_column_int(glossStatement, 1))
      let written = restrictions[
        SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: SearchFormKind.written.rawValue)
      ] ?? []
      let reading = restrictions[
        SenseRestrictionKey(entryID: entryID, senseOrder: senseOrder, kind: SearchFormKind.reading.rawValue)
      ] ?? []
      let displayedHeadword = SearchQuery(Self.string(column: 5, statement: glossStatement)).value
      let displayedReading = SearchQuery(Self.string(column: 6, statement: glossStatement)).value
      guard (written.isEmpty || written.contains(displayedHeadword)),
        (reading.isEmpty || reading.contains(displayedReading)),
        let relation = Self.glossRelation(query: query.value, gloss: Self.string(column: 3, statement: glossStatement))
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
    query: SearchQuery
  ) throws -> [LanguageReferenceID: [DictionaryMatch.RomajiRelation]] {
    let romajiStatement = try prepare(Self.romajiEvidenceSQL)
    defer { sqlite3_finalize(romajiStatement) }
    bind("%\(query.value)%", at: 1, to: romajiStatement)
    var result: [LanguageReferenceID: Set<DictionaryMatch.RomajiRelation>] = [:]
    while try checkedSQLiteStep(romajiStatement) == .row {
      let entryID = LanguageReferenceID(rawValue: Self.string(column: 0, statement: romajiStatement))
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
    bind(exactFormOnly ? query.value : "%\(query.value)%", at: 1, to: statement)
    var entries: [LanguageReferenceID: DictionaryEntry] = [:]
    var fingerprints: [LanguageReferenceID: String] = [:]
    var senseCounts: [LanguageReferenceID: Int] = [:]
    var evidence: [LanguageReferenceID: Set<DictionaryMatch.FormEvidence>] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let form = Self.string(column: 18, statement: statement)
      let kind = Int(sqlite3_column_int(statement, 19))
      let exact = form == query.value
      let prefix = form.hasPrefix(query.value)
      let relation = DictionaryMatch.FormRelation(
        rawValue: (kind == SearchFormKind.written.rawValue ? 0 : 1) + (exact ? 0 : prefix ? 2 : 4)
      )!
      let profile = Self.priorityProfile(from: statement, startingAt: 21)
      entries[entry.id] = entry
      fingerprints[entry.id] = Self.string(column: 17, statement: statement)
      senseCounts[entry.id] = Int(sqlite3_column_int(statement, 20))
      evidence[entry.id, default: []].insert(
        DictionaryMatch.FormEvidence(relation: relation, normalizedForm: form, priorityProfile: profile)
      )
    }
    let ranked = entries.compactMap { id, entry -> (RankedDictionaryEntry, JapaneseDictionaryRank)? in
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
          isBestMatch: selected.relation == .writtenExact || selected.relation == .readingExact,
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
      let key = SenseRestrictionKey(
        entryID: LanguageReferenceID(rawValue: Self.string(column: 0, statement: restrictionStatement)),
        senseOrder: Int(sqlite3_column_int(restrictionStatement, 1)),
        kind: Int(sqlite3_column_int(restrictionStatement, 2))
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
      primaryMask: Int(sqlite3_column_int(statement, column)),
      secondaryMask: Int(sqlite3_column_int(statement, column + 1)),
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
    guard let url = Bundle.module.url(forResource: "LanguageReferenceData", withExtension: "sqlite3") else {
      throw LookupDatabaseError.missingBundledData
    }

    var opened: OpaquePointer?
    guard sqlite3_open_v2(url.path, &opened, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK,
      let opened
    else {
      defer { sqlite3_close(opened) }
      throw LookupDatabaseError.sqlite(message: opened.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed")
    }
    do {
      try Self.validateDictionaryRankingMetadata(opened)
    } catch {
      sqlite3_close(opened)
      throw error
    }
    connection = SQLiteConnection(pointer: opened)
    return opened
  }

  private static func validateDictionaryRankingMetadata(_ database: OpaquePointer) throws {
    let expected = [
      "dictionary_ranking_policy": "\"dictionary-best-match-v1\"",
      "dictionary_ranking_schema_version": "\"zenbu.dictionary-ranking.v1\"",
      "dictionary_ranking_evidence": "{\"form_priority_profiles\":56127,\"canonical_senses\":253020,\"gloss_atoms\":441826,\"sense_form_restrictions\":1929,\"reading_form_restrictions\":6201}",
    ]
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(
      database,
      "SELECT key, value FROM metadata WHERE key LIKE 'dictionary_ranking_%'",
      -1,
      &statement,
      nil
    ) == SQLITE_OK, let statement else {
      throw LookupDatabaseError.invalidDictionaryRankingMetadata
    }
    defer { sqlite3_finalize(statement) }
    var actual: [String: String] = [:]
    while sqlite3_step(statement) == SQLITE_ROW {
      actual[string(column: 0, statement: statement)] = string(column: 1, statement: statement)
    }
    guard actual == expected else { throw LookupDatabaseError.invalidDictionaryRankingMetadata }
  }

  private func bind(_ value: String, at index: Int32, to statement: OpaquePointer) {
    sqlite3_bind_text(statement, index, value, -1, Self.transientDestructor)
  }

  private func decodeEntry(from statement: OpaquePointer) throws -> DictionaryEntry {
    let meanings: [String] = try Self.decode(column: 7, statement: statement)
    let partsOfSpeech: [PartOfSpeech] = try Self.decode(column: 8, statement: statement)
    let writtenForms: [DictionaryForm] = try Self.decode(column: 9, statement: statement)
    let readingForms: [DictionaryForm] = try Self.decode(column: 10, statement: statement)
    let senses: [DictionarySense] = try Self.decode(column: 11, statement: statement)
    let relationships: [DictionaryRelationship] = try Self.decode(column: 12, statement: statement)
    let pitchAccent: PitchAccent? = sqlite3_column_type(statement, 13) == SQLITE_NULL
      ? nil
      : try Self.decode(column: 13, statement: statement)
    return DictionaryEntry(
      id: LanguageReferenceID(rawValue: Self.string(column: 0, statement: statement)),
      noteID: WordNoteID(rawValue: Self.string(column: 1, statement: statement)),
      sourceProvenance: LanguageReferenceProvenance(
        sourceIdentity: Self.string(column: 2, statement: statement),
        sourceRecordID: Self.string(column: 3, statement: statement)
      ),
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

  private static func decode<Value: Decodable>(column: Int32, statement: OpaquePointer) throws -> Value {
    let data = Data(string(column: column, statement: statement).utf8)
    return try JSONDecoder().decode(Value.self, from: data)
  }

  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  private static func glossRelation(query: String, gloss: String) -> DictionaryMatch.GlossRelation? {
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
    var fingerprints = Set<String>()
    return entries.filter { fingerprints.insert($0.semanticFingerprint).inserted }
  }

  private static let selectedColumns = """
    lower(hex(e.id)), e.note_identity, e.source_identity, CAST(e.source_record_id AS TEXT), e.headword, e.reading, e.summary,
    e.meanings_json, e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json,
    e.senses_json, e.relationships_json, e.pitch_accent_json,
    e.is_common, e.rank_score, length(e.headword), lower(hex(e.semantic_fingerprint))
    """

  private static let entryByIDSQL = """
    SELECT \(selectedColumns)
    FROM entries e
    WHERE lower(hex(e.id)) = ?
    LIMIT 1
    """

  private static let entriesContainingKanjiSQL = """
    SELECT \(selectedColumns)
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    WHERE f.kind = \(SearchFormKind.written.rawValue) AND instr(f.form, ?) > 0
    GROUP BY e.id
    ORDER BY
      CASE WHEN e.headword LIKE ? THEN 0 ELSE 1 END,
      length(e.headword), e.is_common DESC, e.rank_score DESC, e.semantic_fingerprint
    LIMIT 24
    """

  private static let asciiCandidateSQL = """
    WITH candidates AS (
      SELECT entry_id FROM gloss_atoms
      WHERE (' ' || normalized_text || ' ') GLOB ('*[^a-z]' || ? || '[^a-z]*')
      UNION
      SELECT entry_id FROM forms
      WHERE kind = \(SearchFormKind.romaji.rawValue) AND form LIKE ?
    )
    SELECT \(selectedColumns), p.primary_mask, p.secondary_mask, p.news_frequency_band
    FROM candidates c
    JOIN entries e ON e.id = c.entry_id
    LEFT JOIN form_priority_profiles p
      ON p.entry_id = e.id AND p.form = e.headword
      AND p.kind = CASE WHEN e.headword = e.reading
        THEN \(SearchFormKind.reading.rawValue) ELSE \(SearchFormKind.written.rawValue) END
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
      AND f.form LIKE ?
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
    """

  private static let glossEvidenceSQL = """
    SELECT lower(hex(g.entry_id)), g.sense_order, g.gloss_order, g.text,
      s.parts_of_speech_json, e.headword, e.reading
    FROM gloss_atoms g
    JOIN canonical_senses s ON s.entry_id = g.entry_id AND s.sense_order = g.sense_order
    JOIN entries e ON e.id = g.entry_id
    WHERE (' ' || g.normalized_text || ' ')
      GLOB ('*[^a-z]' || ? || '[^a-z]*')
    """

  private static let romajiEvidenceSQL = """
    SELECT lower(hex(entry_id)), form FROM forms
    WHERE kind = \(SearchFormKind.romaji.rawValue) AND form LIKE ?
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
  let isBestMatch: Bool
  let hasExactOrPrefixMatch: Bool
  let semanticFingerprint: String
}

private struct SenseRestrictionKey: Hashable {
  let entryID: LanguageReferenceID
  let senseOrder: Int
  let kind: Int
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

private enum LookupDatabaseError: Error {
  case missingBundledData
  case invalidDictionaryRankingMetadata
  case sqlite(message: String)
}
