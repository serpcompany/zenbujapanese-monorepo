import SQLite3

enum SQLiteReadStep: Equatable {
  case row
  case done
}

enum SQLiteReadError: Error {
  case sqlite(message: String)
}

func checkedSQLiteStep(_ statement: OpaquePointer) throws -> SQLiteReadStep {
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
