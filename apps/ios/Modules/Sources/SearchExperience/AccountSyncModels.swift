import Foundation

enum SyncFieldValue: Codable, Hashable, Sendable {
  case string(String)
  case number(Int)
  case bool(Bool)
  case null

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Int.self) {
      self = .number(value)
    } else {
      self = .string(try container.decode(String.self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .string(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .bool(let value): try container.encode(value)
    case .null: try container.encodeNil()
    }
  }
}

enum SyncEntity {
  static let knownWord = "knownWord"
  static let list = "list"
  static let listWord = "listWord"
}

struct SyncEntityKey: Codable, Hashable, Sendable {
  let entity: String
  let entityID: String

  var stored: String { "\(entity):\(entityID)" }

  static func listWord(listID: UUID, storedID: String) -> SyncEntityKey {
    SyncEntityKey(
      entity: SyncEntity.listWord, entityID: "\(SyncEntityKey.listID(listID))/\(storedID)")
  }

  static func listID(_ id: UUID) -> String { id.uuidString.lowercased() }

  var listWordParts: (listID: UUID, storedID: String)? {
    guard let slash = entityID.firstIndex(of: "/"),
      let listID = UUID(uuidString: String(entityID[..<slash]))
    else { return nil }
    return (listID, String(entityID[entityID.index(after: slash)...]))
  }
}

struct SyncMutationPayload: Encodable, Sendable {
  let id: String
  let entity: String
  let operation: String
  let entityId: String
  let baseVersion: Int
  let fields: [String: SyncFieldValue]?
}

struct SyncRequestBody: Encodable, Sendable {
  let cursor: String?
  let mutations: [SyncMutationPayload]
}

struct SyncedKnownWord: Decodable, Sendable {
  let itemId: String
  let headword: String
  let reading: String
  let known: Bool
}

struct SyncedList: Decodable, Sendable {
  let id: String
  let name: String
  let position: Int
  let createdAt: Date
}

struct SyncedListWord: Decodable, Sendable {
  let listId: String
  let itemId: String
  let headword: String
  let reading: String
  let addedAt: Date
}

struct SyncChange: Decodable, Sendable {
  enum Payload: Sendable {
    case knownWord(SyncedKnownWord)
    case list(SyncedList)
    case listWord(SyncedListWord)
    case gone
    case unsynced
  }

  let key: SyncEntityKey
  let version: Int
  let payload: Payload

  private enum CodingKeys: String, CodingKey {
    case entity, entityId, operation, version, data
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let entity = try container.decode(String.self, forKey: .entity)
    key = SyncEntityKey(
      entity: entity, entityID: try container.decode(String.self, forKey: .entityId))
    version = try container.decode(Int.self, forKey: .version)
    guard try container.decode(String.self, forKey: .operation) == "put" else {
      payload = .gone
      return
    }
    switch entity {
    case SyncEntity.knownWord:
      payload = .knownWord(try container.decode(SyncedKnownWord.self, forKey: .data))
    case SyncEntity.list:
      payload = .list(try container.decode(SyncedList.self, forKey: .data))
    case SyncEntity.listWord:
      payload = .listWord(try container.decode(SyncedListWord.self, forKey: .data))
    default:
      payload = .unsynced
    }
  }
}

struct SyncResult: Decodable, Sendable {
  enum Outcome: Sendable {
    case applied(version: Int)
    case conflict(current: SyncChange)
    case rejected(code: String)
  }

  let id: String
  let outcome: Outcome

  private enum CodingKeys: String, CodingKey {
    case id, status, version, current, error
  }

  private struct Rejection: Decodable {
    let code: String
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    switch try container.decode(String.self, forKey: .status) {
    case "applied":
      outcome = .applied(version: try container.decode(Int.self, forKey: .version))
    case "conflict":
      outcome = .conflict(current: try container.decode(SyncChange.self, forKey: .current))
    default:
      let rejection = try container.decodeIfPresent(Rejection.self, forKey: .error)
      outcome = .rejected(code: rejection?.code ?? "rejected")
    }
  }
}

struct SyncAnswer: Decodable, Sendable {
  let results: [SyncResult]
  let changes: [SyncChange]
  let cursor: String
  let hasMore: Bool
}

extension JSONDecoder {
  static var accountService: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let text = try decoder.singleValueContainer().decode(String.self)
      let styles = [
        Date.ISO8601FormatStyle(includingFractionalSeconds: true), Date.ISO8601FormatStyle(),
      ]
      if let date = styles.lazy.compactMap({ try? $0.parse(text) }).first { return date }
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "Not an ISO 8601 date"))
    }
    return decoder
  }
}
