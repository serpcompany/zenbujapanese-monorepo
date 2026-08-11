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
    guard directResults.isEmpty else { return directResults }
    let analyzedResults = try japaneseTextAnalysis.lookupSegments(query).compactMap { segment in
      let segmentResults = try searchOnce(segment)
      return (segmentResults.best + segmentResults.additional).first { $0.headword == segment.value }
        ?? segmentResults.best.first
    }
    if analyzedResults.count > 1 {
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
    for candidate in query.deinflectedCandidates {
      let results = try searchOnce(candidate)
      if !results.isEmpty { return results }
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
    let statement = try prepare(Self.entryByFormSQL)
    defer { sqlite3_finalize(statement) }
    bind(form, at: 1, to: statement)
    bind(form, at: 2, to: statement)
    bind(form, at: 3, to: statement)
    switch try checkedSQLiteStep(statement) {
    case .row: return try decodeEntry(from: statement)
    case .done: return nil
    }
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
    let statement = try prepare(Self.englishLiteralSQL)
    defer { sqlite3_finalize(statement) }

    bindEnglishRanking(query, startingAt: 1, to: statement)

    var entries: [DictionaryEntry] = []
    while try checkedSQLiteStep(statement) == .row {
      entries.append(try decodeEntry(from: statement))
    }
    guard let first = entries.first else { return .empty }
    return LookupSearchResults(best: [first], additional: Array(entries.dropFirst()))
  }

  private func searchOnce(_ query: SearchQuery) throws -> LookupSearchResults {
    guard !query.isEmpty else { return .empty }

    let statement = try prepare(query.isASCII ? Self.asciiSQL : Self.japaneseSQL)
    defer { sqlite3_finalize(statement) }

    if query.isASCII {
      bind(query.value, at: 1, to: statement)
      bind("\(query.value)%", at: 2, to: statement)
      bind("\(query.value)%", at: 3, to: statement)
      bindEnglishRanking(query, startingAt: 4, to: statement)
    } else {
      bind(query.value, at: 1, to: statement)
      bind("\(query.value)%", at: 2, to: statement)
      bind("%\(query.value)%", at: 3, to: statement)
    }

    var best: [DictionaryEntry] = []
    var additional: [DictionaryEntry] = []
    while try checkedSQLiteStep(statement) == .row {
      let entry = try decodeEntry(from: statement)
      let tier = MatchTier(rawValue: sqlite3_column_int(statement, 17)) ?? .additional
      if tier == .best, best.count < 3 {
        best.append(entry)
      } else {
        additional.append(entry)
      }
    }

    if best.isEmpty, let first = additional.first {
      best = [first]
      additional.removeFirst()
    }
    return LookupSearchResults(best: best, additional: additional)
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
    connection = SQLiteConnection(pointer: opened)
    return opened
  }

  private func bind(_ value: String, at index: Int32, to statement: OpaquePointer) {
    sqlite3_bind_text(statement, index, value, -1, Self.transientDestructor)
  }

  private func bindEnglishRanking(_ query: SearchQuery, startingAt index: Int32, to statement: OpaquePointer) {
    bind(query.value, at: index, to: statement)
    bind("to \(query.value)", at: index + 1, to: statement)
    bind("to \(query.value)%", at: index + 2, to: statement)
    bind("%\(query.value)%", at: index + 3, to: statement)
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

  private static let selectedColumns = """
    lower(hex(e.id)), e.note_identity, e.source_identity, CAST(e.source_record_id AS TEXT), e.headword, e.reading, e.summary,
    e.meanings_json, e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json,
    e.senses_json, e.relationships_json, e.pitch_accent_json,
    e.is_common, e.rank_score, length(e.headword)
    """

  private static let englishMatchTierSQL = """
    CASE
      WHEN lower(e.summary) = ? OR lower(e.summary) = ? THEN 0
      WHEN lower(e.summary) LIKE ? THEN 1
      ELSE 2
    END
    """

  private static let entryByIDSQL = """
    SELECT \(selectedColumns)
    FROM entries e
    WHERE lower(hex(e.id)) = ?
    LIMIT 1
    """

  private static let entryByFormSQL = """
    SELECT \(selectedColumns)
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    WHERE f.form = ?
    ORDER BY
      CASE WHEN e.headword = ? THEN 0 WHEN e.reading = ? THEN 1 ELSE 2 END,
      e.is_common DESC, e.rank_score DESC, length(e.headword), e.id
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
      length(e.headword), e.is_common DESC, e.rank_score DESC, e.id
    LIMIT 24
    """

  private static let asciiSQL = """
    WITH candidates AS (
      SELECT f.entry_id,
        CASE WHEN f.form = ? THEN 0 WHEN f.form LIKE ? THEN 1 ELSE 2 END AS match_tier
      FROM forms f
      WHERE f.kind = \(SearchFormKind.romaji.rawValue) AND f.form LIKE ?
      UNION ALL
      SELECT e.id AS entry_id,
        \(englishMatchTierSQL) AS match_tier
      FROM entries e
      WHERE e.gloss_search LIKE ?
    )
    SELECT \(selectedColumns), MIN(c.match_tier) AS match_tier
    FROM candidates c
    JOIN entries e ON e.id = c.entry_id
    GROUP BY e.id
    ORDER BY match_tier, e.rank_score DESC, e.is_common DESC, length(e.headword), e.id
    LIMIT 60
    """

  private static let japaneseSQL = """
    SELECT DISTINCT \(selectedColumns),
      CASE
        WHEN f.form = ? THEN 0
        WHEN f.form LIKE ? THEN 1
        ELSE 2
      END AS match_tier
    FROM forms f
    JOIN entries e ON e.id = f.entry_id
    WHERE f.form LIKE ?
    ORDER BY match_tier, e.rank_score DESC, e.is_common DESC, length(e.headword), e.id
    LIMIT 60
    """

  private static let englishLiteralSQL = """
    SELECT \(selectedColumns), \(englishMatchTierSQL) AS match_tier
    FROM entries e
    WHERE e.gloss_search LIKE ?
    ORDER BY match_tier, e.rank_score DESC, e.is_common DESC, length(e.headword) DESC, e.id
    LIMIT 60
    """
}

private enum SearchFormKind: Int {
  case written = 0
  case reading = 1
  case romaji = 2
}

private enum MatchTier: Int32 {
  case best = 0
  case additional = 1
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
  case sqlite(message: String)
}
