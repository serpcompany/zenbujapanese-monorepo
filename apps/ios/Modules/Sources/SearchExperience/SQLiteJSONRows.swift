import Foundation
import SQLite3

final class SQLiteJSONRows {
  private let statements: SQLiteStatements

  init(statements: SQLiteStatements) {
    self.statements = statements
  }

  func answer(_ sql: String, parametersJSON: String) -> String {
    do {
      return try rows(sql, parametersJSON: parametersJSON)
    } catch {
      var json = JSONBytes()
      json.append("{\"error\":")
      json.appendString(Self.message(error))
      json.append("}")
      return json.text
    }
  }

  private static func message(_ error: Error) -> String {
    switch error {
    case SQLiteReadError.sqlite(let message): message
    case is CancellationError: "The search was cancelled"
    default: "The dictionary could not be read"
    }
  }

  private func rows(_ sql: String, parametersJSON: String) throws -> String {
    let statement = try statements.statement(sql)
    defer { sqlite3_reset(statement) }
    try bind(parametersJSON, to: statement)

    let columns = 0..<sqlite3_column_count(statement)
    var keys: [JSONBytes] = []
    for column in columns {
      var key = JSONBytes()
      key.appendString(String(cString: sqlite3_column_name(statement, column)))
      key.append(":")
      keys.append(key)
    }
    var holdsBlob = Array(repeating: false, count: columns.count)
    var json = JSONBytes()
    json.append("{\"rows\":[")
    var isFirstRow = true
    while try checkedSQLiteStep(statement) == .row {
      json.append(isFirstRow ? "{" : ",{")
      isFirstRow = false
      for column in columns {
        if column > 0 { json.append(",") }
        json.append(keys[Int(column)])
        switch sqlite3_column_type(statement, column) {
        case SQLITE_INTEGER:
          json.append(String(sqlite3_column_int64(statement, column)))
        case SQLITE_FLOAT:
          let value = sqlite3_column_double(statement, column)
          json.append(value.isFinite ? String(value) : "null")
        case SQLITE_NULL:
          json.append("null")
        case SQLITE_BLOB:
          holdsBlob[Int(column)] = true
          json.appendHex(
            UnsafeRawBufferPointer(
              start: sqlite3_column_blob(statement, column),
              count: Int(sqlite3_column_bytes(statement, column))))
        default:
          json.appendString(
            UnsafeBufferPointer(
              start: sqlite3_column_text(statement, column),
              count: Int(sqlite3_column_bytes(statement, column))))
        }
      }
      json.append("}")
    }
    json.append("],\"blobs\":[")
    for (index, key) in keys.enumerated() where holdsBlob[index] {
      if json.last != UInt8(ascii: "[") { json.append(",") }
      json.append(key.droppingLast())
    }
    json.append("]}")
    return json.text
  }

  private func bind(_ parametersJSON: String, to statement: OpaquePointer) throws {
    guard
      let parameters = try? JSONSerialization.jsonObject(with: Data(parametersJSON.utf8))
        as? [Any]
    else { throw SQLiteReadError.sqlite(message: "The parameters are not a JSON array") }
    for (offset, parameter) in parameters.enumerated() {
      let index = Int32(offset + 1)
      switch parameter {
      case let text as String:
        text.utf8CString.withUnsafeBufferPointer { bytes in
          _ = sqlite3_bind_text(
            statement, index, bytes.baseAddress, Int32(bytes.count - 1), sqliteTransient)
        }
      case let number as NSNumber:
        if CFNumberIsFloatType(number) {
          sqlite3_bind_double(statement, index, number.doubleValue)
        } else {
          sqlite3_bind_int64(statement, index, number.int64Value)
        }
      case is NSNull:
        sqlite3_bind_null(statement, index)
      default:
        throw SQLiteReadError.sqlite(message: "Only text, numbers, and null can be bound")
      }
    }
  }
}

struct JSONBytes {
  private var bytes: [UInt8] = []

  var text: String { String(decoding: bytes, as: UTF8.self) }
  var last: UInt8? { bytes.last }

  func droppingLast() -> JSONBytes {
    var shortened = self
    shortened.bytes.removeLast()
    return shortened
  }

  mutating func append(_ literal: String) {
    bytes.append(contentsOf: literal.utf8)
  }

  mutating func append(_ other: JSONBytes) {
    bytes.append(contentsOf: other.bytes)
  }

  mutating func appendString(_ value: String) {
    var value = value
    value.withUTF8 { appendString($0) }
  }

  mutating func appendString(_ value: UnsafeBufferPointer<UInt8>) {
    bytes.append(Self.quote)
    var unescapedStart = 0
    for index in 0..<value.count {
      let byte = value[index]
      guard byte < 0x20 || byte == Self.quote || byte == Self.backslash else { continue }
      bytes.append(contentsOf: UnsafeBufferPointer(rebasing: value[unescapedStart..<index]))
      if byte < 0x20 {
        bytes.append(contentsOf: [Self.backslash, UInt8(ascii: "u"), Self.zero, Self.zero])
        bytes.append(Self.hexDigits[Int(byte >> 4)])
        bytes.append(Self.hexDigits[Int(byte & 0x0F)])
      } else {
        bytes.append(Self.backslash)
        bytes.append(byte)
      }
      unescapedStart = index + 1
    }
    bytes.append(contentsOf: UnsafeBufferPointer(rebasing: value[unescapedStart...]))
    bytes.append(Self.quote)
  }

  mutating func appendHex(_ value: UnsafeRawBufferPointer) {
    bytes.append(Self.quote)
    for byte in value {
      bytes.append(Self.hexDigits[Int(byte >> 4)])
      bytes.append(Self.hexDigits[Int(byte & 0x0F)])
    }
    bytes.append(Self.quote)
  }

  private static let quote = UInt8(ascii: "\"")
  private static let backslash = UInt8(ascii: "\\")
  private static let zero = UInt8(ascii: "0")
  private static let hexDigits = Array("0123456789abcdef".utf8)
}
