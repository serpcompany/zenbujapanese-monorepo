import Foundation
import SQLite3

@testable import SearchExperience

extension FrequencyPackDisclosure {
  static func fixture(
    id: String, displayName: String, kind: FrequencyPackKind = .rank
  ) -> FrequencyPackDisclosure {
    FrequencyPackDisclosure(
      id: FrequencyPackID(rawValue: id), kind: kind, displayName: displayName, domain: "Fixture",
      domainDescription: "Fixture", version: "1", attribution: "Fixture",
      coveredSourceRows: 100_000)
  }
}

struct FrequencyListFixture {
  let dictionary: FrequencyPackDisclosure
  let values: [LanguageReferenceID: Int]

  init(_ dictionary: FrequencyPackDisclosure, _ values: [LanguageReferenceID: Int]) {
    self.dictionary = dictionary
    self.values = values
  }

  private static let folder: URL = {
    let folder = FileManager.default.temporaryDirectory.appending(path: "frequency-list-fixtures")
    try? FileManager.default.removeItem(at: folder)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder
  }()

  func written() throws -> URL {
    let url = Self.folder.appending(path: "\(UUID().uuidString).sqlite3")
    var opened: OpaquePointer?
    guard sqlite3_open(url.path, &opened) == SQLITE_OK, let database = opened else {
      sqlite3_close(opened)
      throw FrequencyPackError.invalidArtifact
    }
    defer { sqlite3_close(database) }
    let (table, column) =
      dictionary.kind == .level ? ("level_evidence", "level") : ("frequency_evidence", "rank")
    var statement: OpaquePointer?
    guard
      sqlite3_exec(
        database,
        "CREATE TABLE \(table) (language_reference_id BLOB PRIMARY KEY, \(column) INTEGER NOT NULL) "
          + "WITHOUT ROWID", nil, nil, nil) == SQLITE_OK,
      sqlite3_prepare_v2(database, "INSERT INTO \(table) VALUES (?, ?)", -1, &statement, nil)
        == SQLITE_OK,
      let statement
    else { throw FrequencyPackError.sqlite(String(cString: sqlite3_errmsg(database))) }
    defer { sqlite3_finalize(statement) }
    for (id, value) in values {
      guard let key = id.bytes else { throw FrequencyPackError.invalidArtifact }
      sqlite3_reset(statement)
      sqliteBind(key, at: 1, to: statement)
      sqlite3_bind_int64(statement, 2, Int64(value))
      guard sqlite3_step(statement) == SQLITE_DONE else {
        throw FrequencyPackError.sqlite(String(cString: sqlite3_errmsg(database)))
      }
    }
    return url
  }

  func enabled() throws -> EnabledFrequencyList {
    EnabledFrequencyList(dictionary: dictionary, file: .verified(try written()))
  }
}

struct ToldFrequencyLists: Decodable, Equatable {
  struct List: Decodable, Equatable {
    struct Dictionary: Decodable, Equatable {
      let id: String
      let kind: String
      let name: String
      let domain: String
      let description: String
      let version: String
      let source: String
      let coveredSourceRows: Int
    }

    let dictionary: Dictionary
    let unavailable: String?
  }

  let lists: [List]?
  let unavailable: String?

  var ids: [String]? { lists?.map(\.dictionary.id) }
}

struct ReadListRows: Decodable, Equatable {
  struct Row: Decodable, Equatable {
    let value: Int?
    let detail: String?
  }

  let rows: [Row]?
  let error: String?
}

extension FrequencyLists {
  func told() throws -> ToldFrequencyLists? {
    try described().map {
      try JSONDecoder().decode(ToldFrequencyLists.self, from: Data($0.dropLast()))
    }
  }

  func read(_ sql: String, _ ids: [LanguageReferenceID], from list: FrequencyPackID) throws
    -> ReadListRows
  {
    let listed = try DictionaryCore.argument([try DictionaryCore.argument(ids.map(\.rawValue))])
    return try JSONDecoder().decode(
      ReadListRows.self,
      from: Data(rows(of: list.rawValue, sql, parametersJSON: listed).text.utf8))
  }

  func value(of id: LanguageReferenceID, in list: FrequencyPackDisclosure) throws -> Int? {
    let (table, column) =
      list.kind == .level ? ("level_evidence", "level") : ("frequency_evidence", "rank")
    return try read(
      "SELECT \(column) AS value FROM \(table) WHERE language_reference_id IN "
        + "(SELECT unhex(value) FROM json_each(?))", [id], from: list.id
    ).rows?.first?.value
  }

  static func listing(_ lists: FrequencyListFixture...) throws -> FrequencyLists {
    let listed = FrequencyLists()
    listed.publish(try lists.map { try $0.enabled() })
    return listed
  }

  static func freshInstall() async throws -> FrequencyLists {
    guard let lists = await freshInstalled.value else { throw FrequencyPackError.invalidCatalog }
    return lists
  }

  private static let freshInstalled = Task {
    try? await FrequencyPackManager.started {
      try .freshInstall(storagePrefix: "FreshInstallLists")
    }.lists
  }
}

extension PresentationCore {
  convenience init(listing lists: FrequencyLists) {
    self.init(kanji: { KanjiFiles.bundled }, frequencyLists: lists)
  }

  static func freshInstall() async throws -> PresentationCore {
    guard let core = await freshInstalled.value else { throw FrequencyPackError.invalidCatalog }
    return core
  }

  private static let freshInstalled = Task {
    (try? await FrequencyLists.freshInstall()).map { PresentationCore(listing: $0) }
  }
}
