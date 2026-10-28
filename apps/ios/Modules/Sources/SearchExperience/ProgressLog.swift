import Foundation
import Observation

struct ProgressTotals: Codable, Hashable, Sendable {
  var known: Int
  var learning: Int
}

enum WordKnowledgeEvent: Sendable {
  case changed(KnownWordChange, previous: WordKnowledgeStatus, totals: ProgressTotals)
  case synced(totals: ProgressTotals)
}

struct ProgressLogChange: Codable, Hashable, Sendable {
  let id: String
  let before: String
  let after: String
  let at: Date
}

struct ProgressLogDay: Codable, Hashable, Sendable {
  var changes: [ProgressLogChange]
  var goal: Int
  var known: Int
  var learning: Int

  init(goal: Int, totals: ProgressTotals) {
    changes = []
    self.goal = goal
    known = totals.known
    learning = totals.learning
  }

  private enum CodingKeys: String, CodingKey { case changes, goal, known, learning }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    changes = try container.decode([LossyDecodable<ProgressLogChange>].self, forKey: .changes)
      .compactMap(\.value)
    goal = try container.decode(Int.self, forKey: .goal)
    known = try container.decode(Int.self, forKey: .known)
    learning = try container.decode(Int.self, forKey: .learning)
  }

  var totals: ProgressTotals {
    get { ProgressTotals(known: known, learning: learning) }
    set {
      known = newValue.known
      learning = newValue.learning
    }
  }
}

enum DailyGoal {
  static let key = "progress.dailyGoal"
  static let standard = 20
  static let range = 1...200

  static func read(_ defaults: UserDefaults) -> Int {
    guard let stored = defaults.object(forKey: key) as? Double, stored.isFinite else {
      return standard
    }
    return Int(min(max(stored.rounded(), Double(range.lowerBound)), Double(range.upperBound)))
  }
}

@MainActor
@Observable
final class ProgressLog: LocalFileStore {
  static let shared = ProgressLog()

  private(set) var isLoaded = false
  private(set) var readOnlyReason: LocalFileReadOnlyReason?
  private(set) var days: [String: ProgressLogDay] = [:]
  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var now: () -> Date = Date.init
  @ObservationIgnored private let writer: ProgressLogWriter
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let calendar: Calendar
  @ObservationIgnored private var heardBeforeLoading: [WordKnowledgeEvent] = []
  @ObservationIgnored private var goalObserver: NSObjectProtocol?
  var canChange: Bool { isLoaded && readOnlyReason == nil }
  var goal: Int { DailyGoal.read(defaults) }

  init(
    fileURL: URL = ProgressLog.defaultFileURL, defaults: UserDefaults = .standard,
    timeZone: TimeZone = .autoupdatingCurrent
  ) {
    let writer = ProgressLogWriter(fileURL: fileURL)
    self.writer = writer
    self.defaults = defaults
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    self.calendar = calendar
    writes.load { [self] in
      let (loaded, needsRewrite, readOnlyReason) = await writer.load()
      days = loaded
      self.readOnlyReason = readOnlyReason
      isLoaded = true
      if needsRewrite { persist() }
      let heard = heardBeforeLoading
      heardBeforeLoading = []
      heard.forEach(record)
    }
    goalObserver = NotificationCenter.default.addObserver(
      forName: UserDefaults.didChangeNotification, object: defaults, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.keepTodaysGoal() }
    }
  }

  @discardableResult
  func listen(to knowledge: WordKnowledge) -> Task<Void, Never> {
    knowledge.progressObserver = { [weak self] event in self?.record(event) }
    return Task {
      await knowledge.flush()
      await flush()
      guard knowledge.canChange, canChange else { return }
      let today = day(of: now())
      guard days[today] == nil else { return }
      days[today] = ProgressLogDay(goal: goal, totals: knowledge.totals)
      persist()
    }
  }

  func day(of time: Date) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: time)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  func record(_ event: WordKnowledgeEvent) {
    guard isLoaded else { return heardBeforeLoading.append(event) }
    guard canChange else { return }
    switch event {
    case .changed(let change, let previous, let totals):
      let time = change.changedAt ?? now()
      let changed = day(of: time)
      days[changed, default: ProgressLogDay(goal: goal, totals: totals)].changes.append(
        ProgressLogChange(
          id: change.storedID, before: previous.stored, after: change.status.stored, at: time))
      if days.keys.allSatisfy({ $0 <= changed }) { days[changed]?.totals = totals }
      keepToday(totals)
    case .synced(let totals):
      keepToday(totals)
    }
    persist()
  }

  private func keepToday(_ totals: ProgressTotals) {
    let today = day(of: now())
    days[today, default: ProgressLogDay(goal: goal, totals: totals)].totals = totals
    days[today]?.goal = goal
  }

  private func keepTodaysGoal() {
    let today = day(of: now())
    guard canChange, days[today]?.goal != goal else { return }
    let latest = days.max { $0.key < $1.key }?.value.totals ?? ProgressTotals(known: 0, learning: 0)
    days[today, default: ProgressLogDay(goal: goal, totals: latest)].goal = goal
    persist()
  }

  func persist() {
    guard canChange else { return }
    let writer = writer
    writes.save { [self] in await writer.write(days) }
  }

  nonisolated static let defaultFileURL = WordKnowledge.defaultFileURL
    .deletingLastPathComponent().appending(path: "progress-log.json")
}

private actor ProgressLogWriter {
  private struct StoredFile: Encodable {
    static let currentVersion = 1
    var version = currentVersion
    var days: [String: ProgressLogDay]
  }

  private struct LoadedFile: Decodable {
    let days: [String: LossyDecodable<ProgressLogDay>]
  }

  private let file: LocalJSONFile

  init(fileURL: URL) {
    file = LocalJSONFile(
      fileURL: fileURL, currentVersion: StoredFile.currentVersion, description: "progress log",
      logCategory: "ProgressLog")
  }

  func load() async -> (
    days: [String: ProgressLogDay], needsRewrite: Bool, readOnlyReason: LocalFileReadOnlyReason?
  ) {
    let data: Data
    switch await file.read() {
    case .missing:
      return ([:], false, nil)
    case .unreadable:
      return ([:], false, .couldNotRead)
    case .newerVersion(let newer):
      return (Self.readable(try? JSONDecoder.localStore.decode(LoadedFile.self, from: newer)),
        false, .newerVersion)
    case .current(let current):
      data = current
    }
    guard let stored = try? JSONDecoder.localStore.decode(LoadedFile.self, from: data) else {
      return await file.keepUnreadableCopy() ? ([:], true, nil) : ([:], false, .couldNotKeepCopy)
    }
    let days = Self.readable(stored)
    guard days.count != stored.days.count else { return (days, false, nil) }
    return await file.keepUnreadableCopy()
      ? (days, true, nil) : (days, false, .couldNotKeepCopy)
  }

  private static func readable(_ file: LoadedFile?) -> [String: ProgressLogDay] {
    (file?.days ?? [:]).compactMapValues(\.value)
  }

  func write(_ days: [String: ProgressLogDay]) async -> Bool {
    guard let data = try? JSONEncoder.localStore.encode(StoredFile(days: days)) else {
      return false
    }
    return await file.write(data)
  }
}
