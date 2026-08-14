import Foundation
import SQLite3

struct ExampleSentence: Hashable, Identifiable, Sendable {
  let id: String
  let japanese: String
  let english: String
  let sourceProvenance: LanguageReferenceProvenance
}

struct ExampleSentenceClient: Sendable {
  var examples: @Sendable (DictionaryEntry) async throws -> [ExampleSentence]
  var count: @Sendable (SearchQuery) async throws -> Int
  var search: @Sendable (SearchQuery) async throws -> [ExampleSentence]

  static let live = ExampleSentenceClient(
    examples: { entry in try await ExampleSentenceData.shared.examples(for: entry) },
    count: { query in try await ExampleSentenceData.shared.count(for: query) },
    search: { query in try await ExampleSentenceData.shared.search(query) }
  )
}

private actor ExampleSentenceData {
  static let shared = ExampleSentenceData()
  private var connection: ExampleSentenceSQLiteConnection?

  func examples(for entry: DictionaryEntry) throws -> [ExampleSentence] {
    // Form-only Tatoeba matches cannot distinguish homographs. Omitting an
    // ambiguous match is more truthful than attaching another entry's usage.
    let ambiguity = try prepare(
      "SELECT count(*) FROM entries WHERE headword = ? AND reading = ?"
    )
    defer { sqlite3_finalize(ambiguity) }
    sqlite3_bind_text(ambiguity, 1, entry.headword, -1, Self.transientDestructor)
    sqlite3_bind_text(ambiguity, 2, entry.reading, -1, Self.transientDestructor)
    guard try checkedSQLiteStep(ambiguity) == .row, sqlite3_column_int(ambiguity, 0) == 1 else {
      return []
    }

    let writtenTerms = entry.writtenForms.map(\.value).filter { value in
      value.contains { character in
        character.unicodeScalars.contains { (0x3400...0x9FFF).contains(Int($0.value)) }
      }
    }
    let terms = Array((writtenTerms.isEmpty ? [entry.reading] : writtenTerms).prefix(4))
    guard !terms.isEmpty else { return [] }

    let predicates = Array(repeating: "japanese LIKE ?", count: terms.count).joined(separator: " OR ")
    let statement = try prepare(
      """
      SELECT id, source_identity, source_record_id, japanese, english
      FROM example_sentences
      WHERE \(predicates)
      ORDER BY length(japanese), id
      LIMIT 3
      """
    )
    defer { sqlite3_finalize(statement) }
    for (offset, term) in terms.enumerated() {
      sqlite3_bind_text(statement, Int32(offset + 1), "%\(term)%", -1, Self.transientDestructor)
    }

    return try readExamples(from: statement)
  }

  func count(for query: SearchQuery) throws -> Int {
    guard !query.isEmpty else { return 0 }
    let searchTerm = normalizedSearchTerm(for: query)
    let statement = try prepare(
      query.isASCII
        ? "SELECT count(*) FROM (SELECT 1 FROM example_sentences WHERE instr(lower(english), ?) > 0 LIMIT 51)"
        : "SELECT count(*) FROM (SELECT 1 FROM example_sentences WHERE instr(japanese, ?) > 0 LIMIT 51)"
    )
    defer { sqlite3_finalize(statement) }
    bind(searchTerm, at: 1, to: statement)
    guard try checkedSQLiteStep(statement) == .row else { return 0 }
    return Int(sqlite3_column_int64(statement, 0))
  }

  func search(_ query: SearchQuery) throws -> [ExampleSentence] {
    guard !query.isEmpty else { return [] }
    let searchTerm = normalizedSearchTerm(for: query)
    let predicate = query.isASCII ? "instr(lower(english), ?) > 0" : "instr(japanese, ?) > 0"
    let statement = try prepare(
      """
      SELECT id, source_identity, source_record_id, japanese, english
      FROM example_sentences
      WHERE \(predicate)
      ORDER BY length(japanese), id
      LIMIT 100
      """
    )
    defer { sqlite3_finalize(statement) }
    bind(searchTerm, at: 1, to: statement)
    return try readExamples(from: statement)
  }

  private func normalizedSearchTerm(for query: SearchQuery) -> String {
    guard query.isASCII else { return query.value }
    return query.value
      .map { character in character.isLetter || character.isNumber ? String(character) : " " }
      .joined()
      .split(whereSeparator: \Character.isWhitespace)
      .joined(separator: " ")
      .lowercased()
  }

  private func readExamples(from statement: OpaquePointer) throws -> [ExampleSentence] {
    var examples: [ExampleSentence] = []
    while try checkedSQLiteStep(statement) == .row {
      examples.append(
        ExampleSentence(
          id: Self.string(column: 0, statement: statement),
          japanese: Self.string(column: 3, statement: statement),
          english: Self.string(column: 4, statement: statement),
          sourceProvenance: LanguageReferenceProvenance(
            sourceIdentity: Self.string(column: 1, statement: statement),
            sourceRecordID: Self.string(column: 2, statement: statement)
          )
        )
      )
    }
    return examples
  }

  private func prepare(_ sql: String) throws -> OpaquePointer {
    let database = try openDatabase()
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw ExampleSentenceDatabaseError.sqlite(message: String(cString: sqlite3_errmsg(database)))
    }
    return statement
  }

  private func openDatabase() throws -> OpaquePointer {
    if let connection { return connection.pointer }
    guard let url = Bundle.module.url(forResource: "LanguageReferenceData", withExtension: "sqlite3") else {
      throw ExampleSentenceDatabaseError.missingBundledData
    }
    var opened: OpaquePointer?
    guard sqlite3_open_v2(url.path, &opened, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK,
      let opened
    else {
      defer { sqlite3_close(opened) }
      throw ExampleSentenceDatabaseError.sqlite(message: "open failed")
    }
    connection = ExampleSentenceSQLiteConnection(pointer: opened)
    return opened
  }

  private func bind(_ value: String, at index: Int32, to statement: OpaquePointer) {
    sqlite3_bind_text(statement, index, value, -1, Self.transientDestructor)
  }

  private static func string(column: Int32, statement: OpaquePointer) -> String {
    guard let text = sqlite3_column_text(statement, column) else { return "" }
    return String(cString: text)
  }

  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

private final class ExampleSentenceSQLiteConnection: @unchecked Sendable {
  let pointer: OpaquePointer
  init(pointer: OpaquePointer) { self.pointer = pointer }
  deinit { sqlite3_close(pointer) }
}

private enum ExampleSentenceDatabaseError: Error {
  case missingBundledData
  case sqlite(message: String)
}
