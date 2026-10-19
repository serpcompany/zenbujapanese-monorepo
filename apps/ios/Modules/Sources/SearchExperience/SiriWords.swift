import Foundation

public struct SiriWord: Codable, Hashable, Sendable {
  public let spoken: String
  public let written: String

  public var id: String { spoken + Self.separator + written }

  public var shownWritten: String? { written == spoken ? nil : written }

  public init?(id: String) {
    let parts = id.split(separator: Self.separator, maxSplits: 1, omittingEmptySubsequences: false)
    guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { return nil }
    spoken = String(parts[0])
    written = String(parts[1])
  }

  init(spoken: String, written: String) {
    self.spoken = spoken
    self.written = written
  }

  private static let separator = "\n"
}

struct LearnerWord: Codable, Hashable, Sendable {
  let written: String
  let reading: String?

  static func gathered(
    recentSearches: [SearchQuery], lists: [[WordListMembership]], known: [WordKnowledgeRecord]
  ) -> [LearnerWord] {
    let listed = lists.joined().sorted { $0.addedAt > $1.addedAt }
    let saved =
      listed.map { ($0.entryID, $0.kanji, $0.headword, $0.reading) }
      + known.map { ($0.entryID, $0.kanji, $0.headword, $0.reading) }
    var seen: Set<String> = []
    let words = saved.compactMap { entryID, kanji, headword, reading -> LearnerWord? in
      guard kanji == nil, seen.insert(entryID).inserted else { return nil }
      return LearnerWord(written: headword, reading: reading.isEmpty ? nil : reading)
    }
    return recentSearches.map { LearnerWord(written: $0.value, reading: nil) } + words
  }
}

actor SiriWordData {
  static let shared = SiriWordData()

  private struct Request: Encodable {
    let learner: [LearnerWord]
    let limit: Int
  }

  private let databaseURL: URL?

  init(databaseURL: URL? = nil) {
    self.databaseURL = databaseURL
  }

  func words(for learner: [LearnerWord], limit: Int) throws -> [SiriWord] {
    guard let database = databaseURL ?? Bundle.languageReferenceDataURL,
      let levels = Bundle.module.url(forResource: "JLPTLevelPack", withExtension: "sqlite3"),
      let ranks = Bundle.module.url(forResource: "TUBELEXFrequencyPack", withExtension: "sqlite3")
    else { throw DictionaryCoreError.bundleUnavailable }
    let core = try DictionaryCore(
      statements: try SQLiteStatements(
        reading: database, attaching: ["jlpt": levels, "tubelex": ranks]))
    return try core.answer(
      "siriWords", try DictionaryCore.argument(Request(learner: learner, limit: limit)))
  }
}
