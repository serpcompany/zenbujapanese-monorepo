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
  return try sqliteStep(statement)
}

func sqliteStep(_ statement: OpaquePointer) throws -> SQLiteReadStep {
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

let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

func sqliteBind(_ value: String, at index: Int32, to statement: OpaquePointer) {
  sqlite3_bind_text(statement, index, value, -1, sqliteTransient)
}

func sqliteBind(_ value: Data, at index: Int32, to statement: OpaquePointer) {
  _ = value.withUnsafeBytes { bytes in
    sqlite3_bind_blob(statement, index, bytes.baseAddress, Int32(bytes.count), sqliteTransient)
  }
}

func sqliteText(_ statement: OpaquePointer, _ column: Int32) -> String {
  guard let text = sqlite3_column_text(statement, column) else { return "" }
  return String(cString: text)
}

final class SQLiteConnection: @unchecked Sendable {
  let pointer: OpaquePointer

  init(pointer: OpaquePointer) {
    self.pointer = pointer
  }

  deinit {
    sqlite3_close(pointer)
  }
}

final class SQLiteStatements {
  let connection: SQLiteConnection
  private var prepared: [String: OpaquePointer] = [:]

  init(connection: SQLiteConnection) {
    self.connection = connection
  }

  convenience init(reading database: URL, attaching attached: [String: URL] = [:]) throws {
    var opened: OpaquePointer?
    guard
      sqlite3_open_v2(database.path, &opened, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil)
        == SQLITE_OK,
      let opened
    else {
      defer { sqlite3_close(opened) }
      throw SQLiteReadError.sqlite(
        message: opened.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed")
    }
    self.init(connection: SQLiteConnection(pointer: opened))
    for (schema, url) in attached {
      let attach = try statement("ATTACH DATABASE ? AS \(schema)")
      sqliteBind(url.path, at: 1, to: attach)
      guard sqlite3_step(attach) == SQLITE_DONE else {
        throw SQLiteReadError.sqlite(message: String(cString: sqlite3_errmsg(opened)))
      }
    }
  }

  deinit {
    finalizeAll()
  }

  func statement(_ sql: String) throws -> OpaquePointer {
    if let statement = prepared[sql] {
      sqlite3_reset(statement)
      sqlite3_clear_bindings(statement)
      return statement
    }
    if prepared.count >= Self.limit { finalizeAll() }
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(connection.pointer, sql, -1, &statement, nil) == SQLITE_OK,
      let statement
    else {
      throw SQLiteReadError.sqlite(message: String(cString: sqlite3_errmsg(connection.pointer)))
    }
    prepared[sql] = statement
    return statement
  }

  private func finalizeAll() {
    for statement in prepared.values { sqlite3_finalize(statement) }
    prepared.removeAll()
  }

  private static let limit = 256
}

extension Bundle {
  static var languageReferenceDataURL: URL? {
    BundledData.bundle.url(forResource: "LanguageReferenceData", withExtension: "sqlite3")
  }
}
