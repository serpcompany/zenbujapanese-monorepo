import Foundation
import Observation

struct ProgressTotals: Codable, Hashable, Sendable {
  var known: Int
  var learning: Int

  func moving(from before: WordKnowledgeStatus, to after: WordKnowledgeStatus) -> ProgressTotals {
    var moved = self
    for (status, step) in [(before, -1), (after, 1)] {
      switch status {
      case .known: moved.known = max(0, moved.known + step)
      case .learning: moved.learning = max(0, moved.learning + step)
      case .unknown, .unrecognized: break
      }
    }
    return moved
  }
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

  init(changes: [ProgressLogChange] = [], goal: Int, totals: ProgressTotals) {
    self.changes = changes
    self.goal = goal
    known = totals.known
    learning = totals.learning
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
    clamped(defaults.object(forKey: key) as? Double)
  }

  static func clamped(_ stored: Double?) -> Int {
    guard let stored, stored.isFinite else { return standard }
    return Int(min(max(stored.rounded(), Double(range.lowerBound)), Double(range.upperBound)))
  }

  static func write(_ goal: Int, to defaults: UserDefaults) {
    defaults.set(Double(clamped(Double(goal))), forKey: key)
  }

  static func synced(_ value: SyncFieldValue) -> Int? {
    let number: Double
    switch value {
    case .number(let whole): number = Double(whole)
    case .decimal(let decimal): number = decimal
    default: return nil
    }
    guard number >= Double(range.lowerBound), number <= Double(range.upperBound) else { return nil }
    return clamped(number)
  }

  static let setting = SyncedSetting(
    name: key, standard: .number(standard),
    read: { defaults in
      defaults.object(forKey: key) is Double ? .number(DailyGoal.read(defaults)) : nil
    },
    write: { defaults, value in
      guard let goal = DailyGoal.synced(value) else { return }
      DailyGoal.write(goal, to: defaults)
    })
}

@MainActor
@Observable
final class ProgressLog: LocalFileStore {
  static let shared = ProgressLog()

  private(set) var isLoaded = false
  private(set) var readOnlyReason: LocalFileReadOnlyReason?
  private(set) var days: [String: ProgressLogDay] = [:]
  private var readDay: String
  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var now: () -> Date = Date.init {
    didSet { readDay = day(of: now()) }
  }
  @ObservationIgnored var changeRecorded: ((KnownWordChange, WordKnowledgeStatus, String) -> Void)?
  @ObservationIgnored private let writer: ProgressLogWriter
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let calendar: Calendar
  @ObservationIgnored private var heardBeforeLoading: [WordKnowledgeEvent] = []
  @ObservationIgnored private var goalObserver: NSObjectProtocol?
  @ObservationIgnored private var dayObserver: NSObjectProtocol?
  @ObservationIgnored private weak var knowledge: WordKnowledge?
  var canChange: Bool { isLoaded && readOnlyReason == nil }
  var goal: Int { DailyGoal.read(defaults) }
  var today: String { readDay }

  init(
    fileURL: URL = ProgressLog.defaultFileURL, defaults: UserDefaults = .standard,
    timeZone: TimeZone = .autoupdatingCurrent, center: NotificationCenter = .default
  ) {
    let writer = ProgressLogWriter(fileURL: fileURL)
    self.writer = writer
    self.defaults = defaults
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    self.calendar = calendar
    readDay = Self.day(of: Date(), in: calendar)
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
    dayObserver = center.addObserver(forName: .NSCalendarDayChanged, object: nil, queue: .main) {
      [weak self] _ in
      MainActor.assumeIsolated { self?.refreshDay() }
    }
  }

  @discardableResult
  func listen(to knowledge: WordKnowledge) -> Task<Void, Never> {
    self.knowledge = knowledge
    knowledge.progressObserver = { [weak self] event in self?.record(event) }
    return Task {
      await knowledge.flush()
      await flush()
      if startToday() { persist() }
    }
  }

  private func startToday() -> Bool {
    let today = day(of: now())
    guard canChange, days[today] == nil, let knowledge, knowledge.canChange else { return false }
    days[today] = ProgressLogDay(goal: goal, totals: knowledge.totals)
    return true
  }

  func refreshDay() {
    let current = day(of: now())
    if current != readDay { readDay = current }
  }

  func day(of time: Date) -> String {
    Self.day(of: time, in: calendar)
  }

  nonisolated static func day(of time: Date, in calendar: Calendar) -> String {
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
      let today = day(of: now())
      if changed < today {
        movePastTotals(from: previous, to: change.status, since: changed, before: today, totals)
      } else {
        days[changed, default: ProgressLogDay(goal: goal, totals: totals)].totals = totals
      }
      days[changed]?.changes.append(
        ProgressLogChange(
          id: change.storedID, before: previous.stored, after: change.status.stored, at: time))
      keepToday(totals)
      changeRecorded?(change, previous, changed)
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

  private func movePastTotals(
    from before: WordKnowledgeStatus, to after: WordKnowledgeStatus, since changed: String,
    before today: String, _ totals: ProgressTotals
  ) {
    if days[changed] == nil {
      let earlier = days.filter { $0.key < changed }.max { $0.key < $1.key }?.value
      days[changed] = ProgressLogDay(
        goal: earlier?.goal ?? goal,
        totals: earlier?.totals ?? totals.moving(from: after, to: before))
    }
    for key in days.keys where key >= changed && key < today {
      guard let past = days[key]?.totals else { continue }
      days[key]?.totals = past.moving(from: before, to: after)
    }
  }

  private func keepTodaysGoal() {
    let today = day(of: now())
    guard canChange else { return }
    if let current = days[today]?.goal {
      guard current != goal else { return }
      days[today]?.goal = goal
    } else {
      guard startToday() else { return }
    }
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

  private struct LoadedDay: Decodable {
    let changes: [LossyDecodable<ProgressLogChange>]
    let goal: Int
    let known: Int
    let learning: Int
  }

  private struct LoadedFile: Decodable {
    let days: [String: LossyDecodable<LoadedDay>]
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
    await file.load(LoadedFile.self, empty: [String: ProgressLogDay]()) { stored in
      let loaded = stored.days.compactMapValues(\.value)
      let days = loaded.mapValues { day in
        ProgressLogDay(
          changes: day.changes.compactMap(\.value), goal: day.goal,
          totals: ProgressTotals(known: day.known, learning: day.learning))
      }
      let read = days.values.map(\.changes.count).reduce(0, +)
      let written = loaded.values.map(\.changes.count).reduce(0, +)
      return (days, loaded.count == stored.days.count && read == written)
    }
  }

  func write(_ days: [String: ProgressLogDay]) async -> Bool {
    guard let data = try? JSONEncoder.localStore.encode(StoredFile(days: days)) else {
      return false
    }
    return await file.write(data)
  }
}
