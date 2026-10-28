import Foundation
import Observation

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
}

struct JLPTCoverageRequest: Encodable, Hashable, Sendable {
  let known: [String]
  let learning: [String]
  let goal: Int
  let today: String

  init(known: [String], learning: [String], goal: Int, today: String) {
    self.known = known
    self.learning = learning
    self.goal = goal
    self.today = today
  }

  @MainActor
  init(knowledge: WordKnowledge, goal: Int, on day: Date, in calendar: Calendar) {
    let words = { (status: WordKnowledgeStatus) in
      knowledge.marked(status).filter { $0.kanji == nil }.map(\.entryID).sorted()
    }
    let parts = calendar.dateComponents([.year, .month, .day], from: day)
    self.init(
      known: words(.known), learning: words(.learning), goal: goal,
      today: String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0))
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

  var goal: Int
  private(set) var coverage: JLPTCoverage?
  @ObservationIgnored private let knowledge: WordKnowledge
  @ObservationIgnored private let ask: Ask
  @ObservationIgnored private let calendar: Calendar
  @ObservationIgnored private let today: @MainActor () -> Date
  @ObservationIgnored private let center: NotificationCenter
  @ObservationIgnored private var answered: JLPTCoverageRequest?
  private var daysTurned = 0

  init(
    knowledge: WordKnowledge,
    goal: Int,
    ask: @escaping Ask = JLPTCoverageModel.live,
    calendar: Calendar = .current,
    today: @escaping @MainActor () -> Date = { Date() },
    center: NotificationCenter = .default
  ) {
    self.knowledge = knowledge
    self.goal = goal
    self.ask = ask
    self.calendar = calendar
    self.today = today
    self.center = center
  }

  func follow() async {
    let days = Task { [weak self, center] in
      for await _ in center.notifications(named: .NSCalendarDayChanged).map({ _ in }) {
        self?.daysTurned += 1
      }
    }
    defer { days.cancel() }
    while !Task.isCancelled {
      let (changed, change) = AsyncStream.makeStream(
        of: Void.self, bufferingPolicy: .bufferingNewest(1))
      let request = withObservationTracking {
        _ = daysTurned
        return JLPTCoverageRequest(knowledge: knowledge, goal: goal, on: today(), in: calendar)
      } onChange: {
        change.yield()
        change.finish()
      }
      await answer(request)
      for await _ in changed { break }
    }
  }

  private func answer(_ request: JLPTCoverageRequest) async {
    guard request != answered, let found = try? await ask(request) else { return }
    answered = request
    coverage = found
  }
}
