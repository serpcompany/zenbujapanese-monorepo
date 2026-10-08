import Foundation
import TranslatorCore

struct Script: Decodable, Sendable {
  var mode: TranslateMode
  var minimumRecall: Double
  var lines: [ScriptLine]

  static func load(from url: URL) throws -> Script {
    try JSONDecoder().decode(Script.self, from: Data(contentsOf: url))
  }
}

struct ScriptLine: Decodable, Sendable, Equatable {
  var language: SpokenLanguage
  var say: String
  var heard: String?

  var expected: String { heard ?? say }
}
