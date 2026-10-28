import Foundation
import SQLite3
import Testing
import os

@testable import SearchExperience

@MainActor
@Suite("JLPT coverage, from the core's bundle")
final class JLPTCoverageTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "jlpt-coverage-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private let data = LanguageReferenceData(validatesBundledArtifact: false)

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  private let au = "5a238575a0b37a31bff65148e1092c72"
  private let ao = "cb0f7ec7f12782023d6481864ebea362"
  private let aoi = "4ad52925f10de4f47d9672c0c0125ea6"
  private let aka = "70656de9599d910bd3ca7fd1262ec05d"
  private let taberu = "042e07f7052f611fed33ddddf37f55fd"
  private let keizai = "afe76408deda0234b7e9b4cc5e8ce0ec"
  private let isogu = "1185f08c917f55f8262b3c998b409db3"
  private let giron = "331e05da8ac9240c6df34dda5d3e4f3d"
  private let aimai = "860d6b622df27607df9ef46db22bd50f"
  private let togeru = "a1bc52ece9adbd464ad852103efad6f3"
  private let nekojita = "ce83757afc42cd4feb1d0f7660619092"
  private let sai = SavedItem.kanji(KanjiCharacter("最")!, reading: "サイ")
  private let calendar = Calendar(identifier: .gregorian)

  private var october28: Date {
    calendar.date(from: DateComponents(year: 2026, month: 10, day: 28, hour: 23, minute: 59))!
  }

  private func level(_ coverage: JLPTCoverage?, _ name: String) -> JLPTCoverage.Level? {
    coverage?.levels.first { $0.name == name }
  }

  private func loadedKnowledge() async -> WordKnowledge {
    let knowledge = WordKnowledge(fileURL: directory.appending(path: "word-knowledge.json"))
    await knowledge.flush()
    return knowledge
  }

  private func mark(
    _ status: WordKnowledgeStatus, _ id: String, in knowledge: WordKnowledge
  ) {
    knowledge.setStatus(
      status, id: LanguageReferenceID(rawValue: id), headword: id, reading: id)
  }

  private func settled(
    _ model: JLPTCoverageModel, until isDone: (JLPTCoverage) -> Bool
  ) async -> JLPTCoverage? {
    let deadline = ContinuousClock.now + .seconds(60)
    while ContinuousClock.now < deadline {
      if let coverage = model.coverage, isDone(coverage) { return coverage }
      try? await Task.sleep(for: .milliseconds(20))
    }
    return nil
  }

  @Test("the app reads each level's Known, Learning, and Not-started words from the core")
  func readsTheCoreAnswer() async throws {
    let coverage = try await data.jlptCoverage(
      JLPTCoverageRequest(
        known: [au, keizai, togeru, nekojita], learning: [taberu, giron, aimai], goal: 20,
        today: "2026-10-28"))
    #expect(coverage.levels.map(\.name) == ["N5", "N4", "N3", "N2", "N1"])
    #expect(coverage.levels.map(\.known) == [1, 1, 0, 0, 1])
    #expect(coverage.levels.map(\.learning) == [1, 0, 1, 1, 0])
    #expect(
      coverage.levels.map { $0.words - $0.known - $0.learning }
        == coverage.levels.map(\.notStarted))
    let n5 = try #require(level(coverage, "N5"))
    #expect(n5.upNext.prefix(2) == [ao, aoi])
    #expect(n5.upNext.count == 20)
    #expect(n5.pace == JLPTCoverage.Pace(date: "2026-12-01", days: 34))
  }

  @Test("each level's word count is the bundled level pack's")
  func totalsAreThePack() async throws {
    let pack = try #require(
      BundledData.bundle.url(forResource: "JLPTLevelPack", withExtension: "sqlite3"))
    let statements = try SQLiteStatements(reading: pack)
    let counted = try statements.statement(
      "SELECT level, count(*) FROM level_evidence GROUP BY level ORDER BY level DESC")
    var inPack: [Int] = []
    while sqlite3_step(counted) == SQLITE_ROW { inPack.append(Int(sqlite3_column_int(counted, 1))) }
    let coverage = try await data.jlptCoverage(
      JLPTCoverageRequest(known: [], learning: [], goal: 20, today: "2026-10-28"))
    #expect(coverage.levels.map(\.words) == inPack)
    #expect(inPack == [667, 630, 1_651, 1_738, 3_061])
  }

  @Test("the model asks again after a word changes state and after the goal changes")
  func asksAgain() async throws {
    let knowledge = await loadedKnowledge()
    mark(.known, au, in: knowledge)
    mark(.learning, isogu, in: knowledge)
    knowledge.setStatus(.known, for: sai)
    let asked = OSAllocatedUnfairLock(initialState: [JLPTCoverageRequest]())
    let model = JLPTCoverageModel(
      knowledge: knowledge, goal: 20,
      ask: { [data] request in
        asked.withLock { $0.append(request) }
        return try await data.jlptCoverage(request)
      },
      calendar: calendar, today: { [october28] in october28 })
    let following = Task { await model.follow() }
    defer { following.cancel() }

    let first = await settled(model) { _ in true }
    #expect(level(first, "N5")?.known == 1)
    #expect(level(first, "N4")?.learning == 1)
    #expect(asked.withLock { $0 } == [
      JLPTCoverageRequest(known: [au], learning: [isogu], goal: 20, today: "2026-10-28")
    ])

    mark(.learning, ao, in: knowledge)
    let afterWord = await settled(model) { self.level($0, "N5")?.learning == 1 }
    #expect(level(afterWord, "N5")?.upNext.first == aoi)
    #expect(level(afterWord, "N5")?.pace?.days == 34)

    model.goal = 5
    let afterGoal = await settled(model) { self.level($0, "N5")?.pace?.days == 133 }
    #expect(level(afterGoal, "N5").map { Array($0.upNext.prefix(2)) } == [aoi, aka])
    #expect(level(afterGoal, "N5")?.upNext.count == 5)
    #expect(asked.withLock { $0.map(\.goal) } == [20, 20, 5])
  }

  @Test("the model asks again when the calendar day changes")
  func asksAgainOnANewDay() async throws {
    let knowledge = await loadedKnowledge()
    let center = NotificationCenter()
    let now = OSAllocatedUnfairLock(initialState: october28)
    let model = JLPTCoverageModel(
      knowledge: knowledge, goal: 20, ask: { [data] in try await data.jlptCoverage($0) },
      calendar: calendar, today: { now.withLock { $0 } }, center: center)
    let following = Task { await model.follow() }
    defer { following.cancel() }

    let first = await settled(model) { _ in true }
    #expect(level(first, "N5")?.pace == JLPTCoverage.Pace(date: "2026-12-01", days: 34))

    now.withLock { $0 = $0.addingTimeInterval(120) }
    let deadline = ContinuousClock.now + .seconds(60)
    while level(model.coverage, "N5")?.pace?.date == "2026-12-01",
      ContinuousClock.now < deadline
    {
      center.post(name: .NSCalendarDayChanged, object: nil)
      try await Task.sleep(for: .milliseconds(50))
    }
    #expect(level(model.coverage, "N5")?.pace == JLPTCoverage.Pace(date: "2026-12-02", days: 34))
  }
}
