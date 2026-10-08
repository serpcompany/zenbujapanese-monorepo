import Foundation
import TranslatorCore

struct Script: Decodable, Sendable {
  var mode: TranslateMode
  var minimumRecall: Double
  var lines: [ScriptLine]

  static func load(from url: URL) throws -> Script {
    let script = try JSONDecoder().decode(Script.self, from: Data(contentsOf: url))
    guard !script.lines.isEmpty else { throw ReplayFailure.invalidScript("has no lines") }
    guard (0...1).contains(script.minimumRecall) else {
      throw ReplayFailure.invalidScript("needs a minimumRecall between 0 and 1")
    }
    return script
  }
}

struct ScriptLine: Decodable, Sendable, Equatable {
  var language: SpokenLanguage
  var say: String
  var heard: String?

  var expected: String { heard ?? say }
}
