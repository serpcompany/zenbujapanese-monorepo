import Foundation

enum SharedAccountCases {
  enum Text: Decodable, Sendable {
    case plain(String)
    case repeated(text: String, times: Int, before: String, after: String)

    private enum Key: String, CodingKey {
      case text, times, around, before, after
    }

    init(from decoder: Decoder) throws {
      if let plain = try? decoder.singleValueContainer().decode(String.self) {
        self = .plain(plain)
        return
      }
      let fields = try decoder.container(keyedBy: Key.self)
      let around = try fields.decodeIfPresent(String.self, forKey: .around) ?? ""
      self = .repeated(
        text: try fields.decode(String.self, forKey: .text),
        times: try fields.decode(Int.self, forKey: .times),
        before: try fields.decodeIfPresent(String.self, forKey: .before) ?? around,
        after: try fields.decodeIfPresent(String.self, forKey: .after) ?? around)
    }

    var value: String {
      switch self {
      case .plain(let text): text
      case .repeated(let text, let times, let before, let after):
        before + String(repeating: text, count: times) + after
      }
    }
  }

  struct Typed: Decodable, Sendable {
    let covers: String
    let typed: Text
  }

  struct Kept: Decodable, Sendable {
    let covers: String
    let typed: Text
    let kept: Text

    private enum Key: String, CodingKey {
      case covers, typed, name, username, text, code, sent
    }

    init(from decoder: Decoder) throws {
      let fields = try decoder.container(keyedBy: Key.self)
      covers = try fields.decode(String.self, forKey: .covers)
      typed = try fields.decode(Text.self, forKey: .typed)
      kept = try [Key.name, .username, .text, .code, .sent].lazy
        .compactMap { try fields.decodeIfPresent(Text.self, forKey: $0) }.first
        ?? .plain("")
    }
  }

  struct Rule: Decodable, Sendable {
    let rule: String?
    let accepted: [Kept]
    let refused: [Typed]
    let removes: [Typed]?
  }

  static let folder = URL(filePath: #filePath).deletingLastPathComponent()
    .appending(path: "../../../../../packages/account-rules/cases").standardizedFileURL

  static func load<Cases: Decodable>(_ name: String, as _: Cases.Type = Cases.self) throws -> Cases {
    try JSONDecoder().decode(Cases.self, from: Data(contentsOf: folder.appending(path: "\(name).json")))
  }

  static func rule(_ name: String) throws -> Rule { try load(name) }
}
