import Foundation
import SQLite3

extension ExampleSentenceData {
  func validateBaseCorpus() throws {
    guard !baseIsValidated else { return }
    let database = try openDatabase()
    guard sqlite3_db_readonly(database, "main") == 1 else {
      throw unavailable(.invalidBaseCorpus)
    }
    if databaseURL == nil {
      guard Int(try metadataValue("example_sentences")) ?? 0 > 0 else {
        throw unavailable(.invalidBaseCorpus)
      }
      let identityProbe = try prepare(
        "SELECT typeof(id), length(id) FROM example_sentences LIMIT 1"
      )
      defer { sqlite3_finalize(identityProbe) }
      guard try checkedSQLiteStep(identityProbe) == .row,
        sqliteText(identityProbe, 0) == "blob",
        sqlite3_column_int(identityProbe, 1) == ExampleSentenceID.encodedByteCount
      else { throw unavailable(.invalidBaseCorpus) }
    } else {
      let integrity = try scalarString("PRAGMA integrity_check(example_sentences)")
      guard integrity == "ok" else { throw unavailable(.invalidBaseCorpus) }
      let corpusCount = try scalarInt("SELECT count(*) FROM example_sentences")
      let recordedCount = try scalarInt(
        "SELECT CAST(value AS INTEGER) FROM metadata WHERE key = 'example_sentences'"
      )
      guard corpusCount == recordedCount else { throw unavailable(.invalidBaseCorpus) }
      let invalidPairIDs = try scalarInt(
        """
        SELECT count(*) FROM example_sentences
        WHERE typeof(id) != 'blob' OR length(id) != 16
        """
      )
      guard invalidPairIDs == 0 else { throw unavailable(.invalidBaseCorpus) }
      let missingProvenance = try scalarInt(
        """
        SELECT count(*) FROM (
          SELECT e.id FROM example_sentences e
          LEFT JOIN example_sentence_provenance p ON p.pair_id = e.id
          WHERE p.pair_id IS NULL LIMIT 1
        )
        """
      )
      guard missingProvenance == 0 else { throw unavailable(.invalidBaseCorpus) }
    }
    baseIsValidated = true
  }

  func example(from statement: OpaquePointer) throws -> ExampleSentence {
    ExampleSentence(
      id: try exampleSentenceID(column: 0, statement: statement),
      japanese: sqliteText(statement, 1),
      english: sqliteText(statement, 2)
    )
  }

  func exampleSentenceID(
    column: Int32,
    statement: OpaquePointer
  ) throws -> ExampleSentenceID {
    guard sqlite3_column_type(statement, column) == SQLITE_BLOB,
      sqlite3_column_bytes(statement, column) == ExampleSentenceID.encodedByteCount,
      let bytes = sqlite3_column_blob(statement, column),
      let id = ExampleSentenceID(
        bytes: UnsafeRawBufferPointer(
          start: bytes,
          count: ExampleSentenceID.encodedByteCount
        )
      )
    else { throw unavailable(.invalidBaseCorpus) }
    return id
  }

  func metadataValue(_ key: String) throws -> String {
    let statement = try prepare("SELECT value FROM metadata WHERE key = ?")
    defer { sqlite3_finalize(statement) }
    sqliteBind(key, at: 1, to: statement)
    guard try checkedSQLiteStep(statement) == .row else {
      throw unavailable(.invalidIndexMetadata)
    }
    return sqliteText(statement, 0)
  }

  func scalarInt(_ sql: String) throws -> Int {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    guard try checkedSQLiteStep(statement) == .row else { throw unavailable(.queryFailed) }
    return Int(sqlite3_column_int64(statement, 0))
  }

  func scalarString(_ sql: String) throws -> String {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    guard try checkedSQLiteStep(statement) == .row else { throw unavailable(.queryFailed) }
    return sqliteText(statement, 0)
  }

  func execute(_ sql: String) throws {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    guard try checkedSQLiteStep(statement) == .done else { throw unavailable(.queryFailed) }
  }

  func prepare(_ sql: String) throws -> OpaquePointer {
    let database = try openDatabase()
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw unavailable(.queryFailed)
    }
    return statement
  }

  private func openDatabase() throws -> OpaquePointer {
    if let connection { return connection.pointer }
    let url: URL
    if let databaseURL {
      url = databaseURL
    } else if let bundled = Bundle.languageReferenceDataURL {
      url = bundled
    } else {
      throw unavailable(.missingBundledData)
    }
    var opened: OpaquePointer?
    guard sqlite3_open_v2(
      url.path,
      &opened,
      SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX,
      nil
    ) == SQLITE_OK, let opened else {
      defer { sqlite3_close(opened) }
      throw unavailable(.missingBundledData)
    }
    let connection = SQLiteConnection(pointer: opened)
    self.connection = connection
    return opened
  }
}
