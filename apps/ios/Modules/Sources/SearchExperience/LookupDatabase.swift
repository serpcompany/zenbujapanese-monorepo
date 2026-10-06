import Foundation
import SQLite3

extension LanguageReferenceData {
  func senseRestrictions() throws -> [SenseRestrictionKey: Set<String>] {
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

  static func priorityProfile(
    from statement: OpaquePointer,
    startingAt column: Int32
  ) -> LanguageReferencePriorityProfile {
    LanguageReferencePriorityProfile(
      primaryMarkers: PriorityMarkers(
        rawValue: Int(sqlite3_column_int(statement, column))
      ),
      secondaryMarkers: PriorityMarkers(
        rawValue: Int(sqlite3_column_int(statement, column + 1))
      ),
      newsFrequencyBand: sqlite3_column_type(statement, column + 2) == SQLITE_NULL
        ? nil : Int(sqlite3_column_int(statement, column + 2))
    )
  }

  func prepare(_ sql: String) throws -> OpaquePointer {
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

  func decodeEntry(from statement: OpaquePointer) throws -> DictionaryEntry {
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
      noteID: WordNoteID(rawValue: sqliteText(statement, 1)),
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

  static func decode<Value: Decodable>(column: Int32, statement: OpaquePointer) throws
    -> Value
  {
    try decoder.decode(Value.self, from: Data(sqliteText(statement, column).utf8))
  }

  private static let decoder = JSONDecoder()

  static let selectedColumns = """
    lower(hex(e.id)), e.note_identity, e.source_identity, CAST(e.source_record_id AS TEXT), e.headword, e.reading, e.summary,
    e.meanings_json, e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json,
    e.senses_json, e.relationships_json,
    COALESCE(e.pitch_accent_json,
      (SELECT c.pitch_accent_json FROM compound_pitch.entry_pitch c WHERE c.entry_id = e.id)),
    e.is_common, e.rank_score, length(e.headword), lower(hex(e.semantic_fingerprint))
    """

  static let equivalentEntriesByIDSQL = """
    SELECT \(selectedColumns)
    FROM entries e
    WHERE e.semantic_fingerprint = (
      SELECT semantic_fingerprint FROM entries WHERE id = ?
    )
    ORDER BY lower(hex(e.id))
    """

  static let kanjiCandidateRowsSQL = """
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

  private static let allSenseRestrictionsSQL = """
    SELECT lower(hex(entry_id)), sense_order, kind, form FROM sense_form_restrictions
    """
}

enum SearchFormKind: Int {
  case written = 0
  case reading = 1
  case romaji = 2
}

struct SenseRestrictionKey: Hashable {
  let entryID: LanguageReferenceID
  let senseOrder: Int
  let kind: SearchFormKind
}

enum LookupDatabaseError: Error {
  case missingBundledData
  case invalidDictionaryRankingMetadata
  case sqlite(message: String)
}
