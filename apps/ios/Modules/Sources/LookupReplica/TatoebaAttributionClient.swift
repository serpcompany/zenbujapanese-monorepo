import Foundation
import SQLite3

struct TatoebaContributorCredit: Identifiable, Sendable {
  let username: String
  let sentenceSideCount: Int
  var id: String { username }
}

enum TatoebaAttributionClient {
  static func contributorCredits() -> [TatoebaContributorCredit] {
    guard let url = Bundle.module.url(forResource: "LanguageReferenceData", withExtension: "sqlite3") else {
      return []
    }
    var database: OpaquePointer?
    guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK,
          let database else {
      sqlite3_close(database)
      return []
    }
    defer { sqlite3_close(database) }

    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(
      database,
      "SELECT username, sentence_side_count FROM example_sentence_contributors ORDER BY username COLLATE NOCASE",
      -1,
      &statement,
      nil
    ) == SQLITE_OK, let statement else {
      return []
    }
    defer { sqlite3_finalize(statement) }

    var credits: [TatoebaContributorCredit] = []
    while sqlite3_step(statement) == SQLITE_ROW {
      guard let username = sqlite3_column_text(statement, 0) else { continue }
      credits.append(
        TatoebaContributorCredit(
          username: String(cString: username),
          sentenceSideCount: Int(sqlite3_column_int64(statement, 1))
        )
      )
    }
    return credits
  }
}
