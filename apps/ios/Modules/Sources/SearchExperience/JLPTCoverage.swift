import Foundation
import Observation
import os

struct JLPTCoverage: Decodable, Equatable, Sendable {
  struct Pace: Decodable, Equatable, Sendable {
    let date: String
    let days: Int
  }

  struct Level: Decodable, Equatable, Identifiable, Sendable {
    let level: Int
    let name: String
    let words: Int
    let known: Int
    let learning: Int
    let notStarted: Int
    let percentKnown: Int
    let upNext: [String]
    let pace: Pace?

    var id: Int { level }
  }

  let levels: [Level]

  init(from decoder: Decoder) throws {
    levels = try decoder.singleValueContainer().decode([Level].self)
  }

  var startingLevel: Int {
    levels.sorted { $0.level > $1.level }.first { $0.percentKnown < 100 }?.level ?? 5
  }

  func level(_ number: Int) -> Level? {
    levels.first { $0.level == number }
  }
}

struct JLPTCoverageRequest: Encodable, Hashable, Sendable {
  let known: [String]
  let learning: [String]
  let goal: Int
  let today: String
  let upNext: Int?

  init(known: [String], learning: [String], goal: Int, today: String, upNext: Int? = nil) {
    self.known = known
    self.learning = learning
    self.goal = goal
    self.today = today
    self.upNext = upNext
  }

  @MainActor
  init(knowledge: WordKnowledge, goal: Int, today: String, upNext: Int? = nil) {
    let words = { (status: WordKnowledgeStatus) in
      knowledge.marked(status).filter { $0.kanji == nil }.map(\.entryID).sorted()
    }
    self.init(
      known: words(.known), learning: words(.learning), goal: goal, today: today, upNext: upNext)
  }
}

extension LanguageReferenceData {
  func jlptCoverage(_ request: JLPTCoverageRequest) throws -> JLPTCoverage {
    try preparedCore().answer("jlptCoverage", try DictionaryCore.argument(request))
  }
}

@MainActor
@Observable
final class JLPTCoverageModel {
  typealias Ask = @Sendable (JLPTCoverageRequest) async throws -> JLPTCoverage

  nonisolated static let live: Ask = { request in
    try await LanguageReferenceData.shared.jlptCoverage(request)
  }

  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
    category: "JLPTCoverage")

  var goal: Int
  private(set) var coverage: JLPTCoverage?
  @ObservationIgnored private let upNext: Int?
  @ObservationIgnored private let knowledge: WordKnowledge
  @ObservationIgnored private let ask: Ask
  @ObservationIgnored private let today: @MainActor () -> String
  @ObservationIgnored private var answered: JLPTCoverageRequest?

  init(
    knowledge: WordKnowledge,
    goal: Int,
    upNext: Int? = nil,
    ask: @escaping Ask = JLPTCoverageModel.live,
    today: @escaping @MainActor () -> String
  ) {
    self.knowledge = knowledge
    self.goal = goal
    self.upNext = upNext
    self.ask = ask
    self.today = today
  }

  func follow() async {
    while !Task.isCancelled {
      let (changed, change) = AsyncStream.makeStream(
        of: Void.self, bufferingPolicy: .bufferingNewest(1))
      let request = withObservationTracking {
        JLPTCoverageRequest(knowledge: knowledge, goal: goal, today: today(), upNext: upNext)
      } onChange: {
        change.yield()
        change.finish()
      }
      await answer(request)
      for await _ in changed { break }
    }
  }

  private func answer(_ request: JLPTCoverageRequest) async {
    guard request != answered else { return }
    do {
      coverage = try await ask(request)
      answered = request
    } catch {
      Self.logger.error("Couldn't ask for JLPT coverage: \(error, privacy: .public)")
    }
  }
}
