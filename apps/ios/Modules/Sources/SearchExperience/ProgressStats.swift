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
    let addedLast30: Int
  }

  struct GoalMet: Decodable, Hashable, Sendable {
    let met: Int
    let days: Int
  }

  struct GoalMetDays: Decodable, Hashable, Sendable {
    let last7: GoalMet
    let last30: GoalMet
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
  let goalMet: GoalMetDays
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
