import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("JLPT Progress")
final class JLPTProgressTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "jlpt-progress-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private let tokyo = TimeZone(identifier: "Asia/Tokyo")!

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  private func coverage(_ levels: [(level: Int, percent: Int)]) throws -> JLPTCoverage {
    let json = levels.map { level, percent in
      """
      {"level": \(level), "name": "N\(level)", "words": 100, "known": \(percent), "learning": 0,
       "notStarted": \(100 - percent), "percentKnown": \(percent), "upNext": [], "pace": null}
      """
    }
    return try JSONDecoder().decode(JLPTCoverage.self, from: Data("[\(json.joined(separator: ","))]".utf8))
  }

  private func level(name: String, notStarted: Int, pace: JLPTCoverage.Pace?) -> JLPTCoverage.Level {
    JLPTCoverage.Level(
      level: 5, name: name, words: 667, known: 300, learning: 667 - 300 - notStarted,
      notStarted: notStarted, percentKnown: 44, upNext: [], pace: pace)
  }

  @Test("the screen opens on the lowest level not all Known, or on N5 when every level is")
  func startingLevel() throws {
    #expect(try coverage([(5, 45), (4, 13), (3, 1), (2, 0), (1, 0)]).startingLevel == 5)
    #expect(try coverage([(5, 100), (4, 100), (3, 99), (2, 0), (1, 0)]).startingLevel == 3)
    #expect(try coverage([(1, 100), (2, 100), (3, 100), (4, 100), (5, 100)]).startingLevel == 5)
    #expect(try coverage([(5, 100), (4, 13)]).level(4)?.percentKnown == 13)
  }

  @Test("the pace sentence is the core's date and days at the goal, or says nothing is left")
  func paceSentence() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = tokyo
    let today = ProgressWeek.date(of: "2026-10-28", in: calendar)!
    let november11 = ProgressWeek.date(of: "2026-11-11", in: calendar)!
      .formatted(Date.FormatStyle(timeZone: tokyo).month(.abbreviated).day())
    let n5 = level(name: "N5", notStarted: 273, pace: JLPTCoverage.Pace(date: "2026-11-11", days: 14))
    #expect(
      ProgressWording.pace(n5, goal: 20, today: today, timeZone: tokyo)
        == "At 20 new words a day, every N5 word would be in Learning by \(november11) (14 days).")
    let oneDay = level(name: "N5", notStarted: 3, pace: JLPTCoverage.Pace(date: "2026-11-11", days: 1))
    #expect(ProgressWording.pace(oneDay, goal: 20, today: today, timeZone: tokyo).hasSuffix("(1 day)."))
    #expect(
      ProgressWording.pace(n5, goal: 1, today: today, timeZone: tokyo)
        == "At 1 new word a day, every N5 word would be in Learning by \(november11) (14 days).")
    let n4 = level(name: "N4", notStarted: 0, pace: nil)
    #expect(ProgressWording.pace(n4, goal: 20) == "Every N4 word is in Learning or Known.")
  }

  @Test("the button says how many words it adds")
  func addButton() {
    #expect(ProgressWording.addToLearning(10, level: "N5") == "Add 10 N5 words to Learning")
    #expect(ProgressWording.addToLearning(3, level: "N1") == "Add 3 N1 words to Learning")
    #expect(ProgressWording.addToLearning(1, level: "N1") == "Add 1 N1 word to Learning")
  }

  private static func client(
    _ answer: @escaping @Sendable ([LanguageReferenceID]) throws -> [LanguageReferenceID: DictionaryEntry]
  ) -> LookupClient {
    LookupClient(
      search: { _ in throw CancellationError() }, entry: { _ in nil }, entries: { try answer($0) },
      entryMatchingForm: { _ in nil }, entriesMatchingForm: { _ in [] }, entriesContainingKanji: { _ in [] })
  }

  @Test("Add takes its count from the words the lookup found, and adds none when it failed")
  func upNextWords() async throws {
    let ids = ["jmdict:1", "jmdict:2", "jmdict:3"]
    let failed = Self.client { _ in throw URLError(.cannotOpenFile) }
    let none = try #require(await JLPTUpNextWords.resolving(ids, shown: 2, using: failed))
    #expect(none.entries.isEmpty)
    #expect(none.count == 0)

    let short = Self.client { _ in
      [
        LanguageReferenceID(rawValue: "jmdict:1"): .fixture(id: "jmdict:1", headword: "一"),
        LanguageReferenceID(rawValue: "jmdict:2"): .fixture(id: "jmdict:9", headword: "九"),
      ]
    }
    let found = try #require(await JLPTUpNextWords.resolving(ids, shown: 2, using: short))
    #expect(found.entries.map(\.id.rawValue) == ["jmdict:1"])
    #expect(found.count == 1)
    #expect(found.shown.map(\.entry.id.rawValue) == ["jmdict:1"])
  }

  @Test("only a reader that asks for Up next sends it, and the core then answers that many")
  func upNextCount() async throws {
    let request = JLPTCoverageRequest(known: [], learning: [], goal: 20, today: "2026-10-28")
    let encoded = String(decoding: try JSONEncoder().encode(request), as: UTF8.self)
    #expect(!encoded.contains("upNext"))

    let knowledge = WordKnowledge(fileURL: directory.appending(path: "word-knowledge.json"))
    await knowledge.flush()
    let data = LanguageReferenceData(validatesBundledArtifact: false)
    let model = JLPTCoverageModel(
      knowledge: knowledge, goal: 20, upNext: 10, ask: { try await data.jlptCoverage($0) },
      today: { "2026-10-28" })
    let following = Task { await model.follow() }
    defer { following.cancel() }
    let deadline = ContinuousClock.now + .seconds(60)
    while model.coverage == nil, ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(20))
    }
    let n5 = try #require(model.coverage?.level(5))
    #expect(n5.upNext.count == 10)
    #expect(n5.pace == JLPTCoverage.Pace(date: "2026-12-01", days: 34))
  }
}
