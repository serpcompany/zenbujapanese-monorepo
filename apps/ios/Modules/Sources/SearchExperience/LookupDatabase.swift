import Foundation
import SQLite3

extension LanguageReferenceData {
  func openStatements() throws -> SQLiteStatements {
    if let statements { return statements }
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
    let statements = SQLiteStatements(connection: SQLiteConnection(pointer: opened))
    self.statements = statements
    return statements
  }

  private static func attachCompoundPitch(_ database: OpaquePointer) throws {
    let url = BundledData.bundle.url(forResource: "CompoundPitch", withExtension: "sqlite3")
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

  func glosses(ofEntriesEquivalentTo listed: String) throws -> [String: [Int: [String]]] {
    let statement = try openStatements().statement(Self.equivalentGlossesSQL)
    defer { sqlite3_reset(statement) }
    sqliteBind(listed, at: 1, to: statement)
    var glosses: [String: [Int: [String]]] = [:]
    while try checkedSQLiteStep(statement) == .row {
      let sense = Int(sqlite3_column_int(statement, 1))
      glosses[sqliteText(statement, 0), default: [:]][sense, default: []]
        .append(sqliteText(statement, 2))
    }
    return glosses
  }

  func decodeEntry(
    from statement: OpaquePointer, glosses: [String: [Int: [String]]]
  ) throws -> DictionaryEntry {
    let id = sqliteText(statement, 0)
    let meanings: [String] = try Self.decode(column: 6, statement: statement)
    let partsOfSpeech: [PartOfSpeech] = try Self.decode(column: 7, statement: statement)
    let writtenForms: [DictionaryForm] = try Self.decode(column: 8, statement: statement)
    let readingForms: [DictionaryForm] = try Self.decode(column: 9, statement: statement)
    let stored: [StoredSense] = try Self.decode(column: 10, statement: statement)
    let senses = stored.enumerated().map { index, sense in
      DictionarySense(
        meaning: sense.meaning, glosses: glosses[id]?[index] ?? [], notes: sense.notes,
        partsOfSpeech: sense.partsOfSpeech)
    }
    let relationships: [DictionaryRelationship] = try Self.decode(column: 11, statement: statement)
    let pitch: PitchAccent? = try Self.decodeIfPresent(column: 12, statement: statement)
    let compoundPitch: PitchAccent? = try Self.decodeIfPresent(column: 15, statement: statement)
    let record = LanguageReferenceProvenance(
      sourceIdentity: sqliteText(statement, 1),
      sourceRecordID: sqliteText(statement, 2)
    )
    return DictionaryEntry(
      id: LanguageReferenceID(rawValue: id),
      sourceRecord: record,
      sourceProvenances: [record],
      reading: sqliteText(statement, 4),
      headword: sqliteText(statement, 3),
      summary: sqliteText(statement, 5),
      meanings: meanings,
      partsOfSpeech: partsOfSpeech,
      writtenForms: writtenForms,
      readingForms: readingForms,
      senses: senses,
      relationships: relationships,
      pitch: pitch,
      compoundPitch: compoundPitch,
      isCommon: sqlite3_column_int(statement, 13) == 1
    )
  }

  func words(named noteIdentities: [String]) throws -> [String: SavedWordLabel] {
    guard !noteIdentities.isEmpty else { return [:] }
    let statement = try openStatements().statement(Self.noteIdentitiesSQL)
    defer { sqlite3_reset(statement) }
    let listed = String(decoding: try JSONEncoder().encode(noteIdentities), as: UTF8.self)
    sqliteBind(listed, at: 1, to: statement)
    var named: [String: String] = [:]
    while try checkedSQLiteStep(statement) == .row {
      named[sqliteText(statement, 0)] = sqliteText(statement, 1)
    }
    let shown = try shownWords(Array(Set(named.values)))
    return named.compactMapValues { shown[$0] }
  }

  func shownWords(_ ids: [String]) throws -> [String: SavedWordLabel] {
    let shown = try entries(equivalentTo: ids.map(LanguageReferenceID.init(rawValue:)))
    var words: [String: SavedWordLabel] = [:]
    for (id, entry) in shown {
      words[id.rawValue] = SavedWordLabel(
        id: SavedItem.word(entry).id, headword: entry.headword, reading: entry.reading)
    }
    return words
  }

  static func decode<Value: Decodable>(column: Int32, statement: OpaquePointer) throws
    -> Value
  {
    try decoder.decode(Value.self, from: Data(sqliteText(statement, column).utf8))
  }

  private static func decodeIfPresent<Value: Decodable>(column: Int32, statement: OpaquePointer)
    throws -> Value?
  {
    sqlite3_column_type(statement, column) == SQLITE_NULL
      ? nil : try decode(column: column, statement: statement)
  }

  private static let decoder = JSONDecoder()

  private struct StoredSense: Decodable {
    let meaning: String
    let notes: [String]
    let partsOfSpeech: [PartOfSpeech]
  }

  static let selectedColumns = """
    lower(hex(e.id)), e.source_identity, CAST(e.source_record_id AS TEXT), e.headword, e.reading, e.summary,
    e.meanings_json, e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json,
    e.senses_json, e.relationships_json, e.pitch_accent_json,
    e.is_common, lower(hex(e.semantic_fingerprint)),
    (SELECT c.pitch_accent_json FROM compound_pitch.entry_pitch c WHERE c.entry_id = e.id)
    """

  private static let equivalentEntries = """
    FROM json_each(?) listed
    JOIN entries named ON named.id = unhex(listed.value)
    JOIN entries e ON e.semantic_fingerprint = named.semantic_fingerprint
    """

  static let equivalentEntriesSQL = "SELECT \(selectedColumns) \(equivalentEntries)"

  private static let equivalentGlossesSQL = """
    SELECT lower(hex(entry_id)), sense_order, text FROM gloss_atoms
    WHERE entry_id IN (SELECT e.id \(equivalentEntries))
    ORDER BY entry_id, sense_order, gloss_order
    """

  private static let noteIdentitiesSQL = """
    SELECT e.note_identity, lower(hex(e.id))
    FROM json_each(?) listed
    JOIN entries e ON e.note_identity = listed.value
    """
}

enum LookupDatabaseError: Error {
  case missingBundledData
  case missingEntry
  case invalidDictionaryRankingMetadata
  case sqlite(message: String)
}
