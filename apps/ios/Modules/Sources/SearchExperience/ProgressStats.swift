import Foundation

struct ProgressStats: Decodable, Hashable, Sendable {
  struct Day: Decodable, Hashable, Sendable {
    let day: String
    let added: Int
    let markedKnown: Int
    let goal: Int
    let met: Bool
  }

  struct Streak: Decodable, Hashable, Sendable {
    let length: Int
    let first: String
    let last: String
  }

  struct Totals: Decodable, Hashable, Sendable {
    let known: Int
    let learning: Int
    let markedKnownLast7: Int
    let addedLast7: Int
  }

  struct KnownOnDay: Decodable, Hashable, Sendable {
    let day: String
    let known: Int
  }

  struct DailyAverage: Decodable, Hashable, Sendable {
    let average: Double
    let days: Int
  }

  struct Words: Decodable, Hashable, Sendable {
    let day: String
    let addedToLearning: [String]
    let markedKnown: [String]
  }

  let today: Day
  let days: [Day]
  let streak: Int
  let bestStreak: Streak?
  let last7: [Day]
  let last30: [Day]
  let totals: Totals
  let knownOverTime: [KnownOnDay]
  let dailyAverage: DailyAverage
  let words: [Words]
}

struct ProgressStatsRequest: Encodable, Hashable, Sendable {
  let days: [String: ProgressLogDay]
  let goal: Int
  let today: String
}

extension ProgressLog {
  func stats(using core: PresentationCore = .shared) async -> ProgressStats? {
    let request = ProgressStatsRequest(days: days, goal: goal, today: day(of: now()))
    return await Self.answer(request, using: core)
  }

  nonisolated static func answer(
    _ request: ProgressStatsRequest, using core: PresentationCore
  ) async -> ProgressStats? {
    guard let asked = try? JSONEncoder.localStore.encode(request) else { return nil }
    return try? core.answer("progressStats", String(decoding: asked, as: UTF8.self))
  }
}

struct ProgressDaysRequest: Encodable, Sendable {
  struct Change: Encodable, Sendable {
    private enum CodingKeys: String, CodingKey { case day }

    let change: ProgressLogChange
    let day: String

    init(_ change: ProgressLogChange, day: String) {
      self.change = change
      self.day = day
    }

    func encode(to encoder: Encoder) throws {
      try change.encode(to: encoder)
      var container = encoder.container(keyedBy: CodingKeys.self)
      try container.encode(day, forKey: .day)
    }
  }

  let days: [String: ProgressLogDay]
  let changes: [Change]
  let goal: Int
  let today: String
  let totals: ProgressTotals
}

extension ProgressLog {
  nonisolated static func filledDays(_ request: ProgressDaysRequest) async -> [String: ProgressLogDay]?
  {
    guard let asked = try? JSONEncoder.localStore.encode(request) else { return nil }
    return try? PresentationCore.shared.answer(
      "progressDays", String(decoding: asked, as: UTF8.self), decodedBy: .localStore)
  }
}
