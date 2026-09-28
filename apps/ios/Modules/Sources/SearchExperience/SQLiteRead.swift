import Foundation
import SQLite3

enum SQLiteReadStep: Equatable {
  case row
  case done
}

enum SQLiteReadError: Error {
  case sqlite(message: String)
}

func checkedSQLiteStep(_ statement: OpaquePointer) throws -> SQLiteReadStep {
  try Task<Never, Never>.checkCancellation()
  switch sqlite3_step(statement) {
  case SQLITE_ROW:
    return .row
  case SQLITE_DONE:
    return .done
  default:
    let database = sqlite3_db_handle(statement)
    let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite read failed"
    throw SQLiteReadError.sqlite(message: message)
  }
}

/// Tells SQLite to copy bound text and blobs before `sqlite3_bind_*` returns.
let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

func sqliteBind(_ value: String, at index: Int32, to statement: OpaquePointer) {
  sqlite3_bind_text(statement, index, value, -1, sqliteTransient)
}

func sqliteBind(_ value: Data, at index: Int32, to statement: OpaquePointer) {
  _ = value.withUnsafeBytes { bytes in
    sqlite3_bind_blob(statement, index, bytes.baseAddress, Int32(bytes.count), sqliteTransient)
  }
}

/// The column's text, or an empty string for `NULL`.
func sqliteText(_ statement: OpaquePointer, _ column: Int32) -> String {
  guard let text = sqlite3_column_text(statement, column) else { return "" }
  return String(cString: text)
}

/// The column's bytes, or empty data for `NULL`.
func sqliteData(_ statement: OpaquePointer, _ column: Int32) -> Data {
  guard let bytes = sqlite3_column_blob(statement, column) else { return Data() }
  return Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, column)))
}

/// Owns an open SQLite handle and closes it on deinit.
final class SQLiteConnection: @unchecked Sendable {
  let pointer: OpaquePointer

  init(pointer: OpaquePointer) {
    self.pointer = pointer
  }

  deinit {
    sqlite3_close(pointer)
  }
}

extension Bundle {
  /// The bundled `LanguageReferenceData.sqlite3` dictionary database.
  static var languageReferenceDataURL: URL? {
    Bundle.module.url(forResource: "LanguageReferenceData", withExtension: "sqlite3")
  }
}
