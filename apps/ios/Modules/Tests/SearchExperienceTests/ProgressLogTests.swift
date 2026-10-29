import Foundation
import Observation
import Testing

@testable import SearchExperience

@MainActor
@Suite("The progress log")
final class ProgressLogTests {
  private final class Clock {
    var now = Date()
  }

  private let folder = URL.temporaryDirectory.appending(
    path: "progress-log-\(UUID().uuidString)", directoryHint: .isDirectory)
  private let suite = "progress-log-\(UUID().uuidString)"
  private let defaults: UserDefaults
  private let tokyo = TimeZone(identifier: "Asia/Tokyo") ?? .gmt
  private let clock = Clock()
  private let taberu = LanguageReferenceID(rawValue: "042e07f7052f611fed33ddddf37f55fd")
  private let miru = LanguageReferenceID(rawValue: "7f490a9c9c0da94f4e9474f4efe74be1")
  private let eki = LanguageReferenceID(rawValue: "d49b2f3c5cbf3002ebf317043cbebdad")
  private var logURL: URL { folder.appending(path: "progress-log.json") }
  init() {
    defaults = UserDefaults(suiteName: suite) ?? .standard
  }

  deinit {
    try? FileManager.default.removeItem(at: folder)
    UserDefaults.standard.removePersistentDomain(forName: suite)
  }

  private func october(_ day: Int, _ hour: Int, _ minute: Int) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = tokyo
    let parts = DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute)
    return calendar.date(from: parts) ?? Date()
  }

  private func log() async -> ProgressLog {
    let log = ProgressLog(fileURL: logURL, defaults: defaults, timeZone: tokyo)
    log.now = { [clock] in clock.now }
    await log.flush()
    return log
  }

  private func stores() async -> (WordKnowledge, ProgressLog) {
    let knowledge = WordKnowledge(fileURL: folder.appending(path: "word-knowledge.json"))
    knowledge.now = { [clock] in clock.now }
    let log = await log()
    await log.listen(to: knowledge).value
    return (knowledge, log)
  }

  private func learn(_ id: LanguageReferenceID, _ headword: String, in knowledge: WordKnowledge) {
    knowledge.setStatus(.learning, id: id, headword: headword, reading: headword)
  }

  private func saveEkiAsKnown() async {
    let first = WordKnowledge(fileURL: folder.appending(path: "word-knowledge.json"))
    await first.flush()
    first.setStatus(.known, id: eki, headword: "駅", reading: "えき")
    await first.flush()
  }

  private func ids(on day: String, in log: ProgressLog) -> [String] {
    log.days[day]?.changes.map(\.id) ?? []
  }

  private func share(
    _ id: LanguageReferenceID, _ headword: String, _ status: WordKnowledgeStatus, madeAt made: Date
  ) throws -> SharedChanges {
    try SharedChanges.holding(
      KnownWordChange(storedID: id.rawValue, headword: headword, reading: headword, status: status),
      madeAt: made, in: folder)
  }

  private func opened(applying inbox: SharedChanges, at time: Date) async -> (
    WordKnowledge, ProgressLog
  ) {
    clock.now = time
    let (knowledge, log) = await stores()
    await inbox.apply(to: WordLists(fileURL: folder.appending(path: "word-lists.json")), knowledge)
    await log.flush()
    return (knowledge, log)
  }

  @Test("changes at 23:59 and at 00:01 fall on two days, each kept as it happened")
  func changesAcrossMidnight() async {
    clock.now = october(27, 23, 59)
    let (knowledge, log) = await stores()
    learn(taberu, "食べる", in: knowledge)
    clock.now = october(28, 0, 1)
    learn(miru, "見る", in: knowledge)
    await log.flush()

    let reloaded = await self.log()
    #expect(ids(on: "2026-10-27", in: reloaded) == [taberu.rawValue])
    #expect(ids(on: "2026-10-28", in: reloaded) == [miru.rawValue])
    #expect(
      reloaded.days["2026-10-27"]?.changes
        == [
          ProgressLogChange(
            id: taberu.rawValue, before: "unknown", after: "learning", at: october(27, 23, 59))
        ])
    #expect(reloaded.days["2026-10-28"]?.totals == ProgressTotals(known: 0, learning: 2))
    #expect(reloaded.days["2026-10-28"]?.goal == DailyGoal.standard)
  }

  private func todayAfter(
    from start: Date, to later: Date, _ turn: (ProgressLog, NotificationCenter) async -> Void
  ) async -> (before: String, heard: Bool, after: String) {
    let center = NotificationCenter()
    clock.now = start
    let log = ProgressLog(fileURL: logURL, defaults: defaults, timeZone: tokyo, center: center)
    log.now = { [clock] in clock.now }
    await log.flush()
    let (changes, change) = AsyncStream.makeStream(of: Void.self)
    let before = withObservationTracking { log.today } onChange: { change.yield() }
    clock.now = later
    await turn(log, center)
    change.finish()
    var heard = false
    for await _ in changes { heard = true }
    return (before, heard, log.today)
  }

  @Test("the day turning while the app is open moves today, so Account asks for the new day's stats")
  func dayTurns() async {
    let turned = await todayAfter(from: october(27, 23, 59), to: october(28, 7, 0)) { _, center in
      center.post(name: .NSCalendarDayChanged, object: nil)
      await withCheckedContinuation { done in OperationQueue.main.addOperation { done.resume() } }
    }
    #expect(turned.before == "2026-10-27")
    #expect(turned.heard)
    #expect(turned.after == "2026-10-28")
  }

  @Test("the app becoming active on a new day moves today, with no day change posted")
  func resumeOnANewDay() async {
    let resumed = await todayAfter(from: october(27, 23, 59), to: october(28, 7, 0)) { log, _ in
      log.refreshDay()
    }
    #expect(resumed.before == "2026-10-27")
    #expect(resumed.heard)
    #expect(resumed.after == "2026-10-28")
  }

  @Test("the app becoming active on the same day leaves today as it was")
  func resumeOnTheSameDay() async {
    let resumed = await todayAfter(from: october(27, 8, 0), to: october(27, 23, 0)) { log, _ in
      log.refreshDay()
    }
    #expect(!resumed.heard)
    #expect(resumed.after == "2026-10-27")
  }

  @Test("a share sheet change made at 23:59 and applied the next morning falls on its own day")
  func shareSheetChangeKeepsItsDay() async throws {
    let made = october(27, 23, 59)
    let inbox = try share(eki, "駅", .learning, madeAt: made)

    let (_, log) = await opened(applying: inbox, at: october(28, 8, 0))

    #expect(ids(on: "2026-10-27", in: log) == [eki.rawValue])
    #expect(log.days["2026-10-27"]?.changes.first?.at == made)
    #expect(ids(on: "2026-10-28", in: log).isEmpty)
    #expect(log.days["2026-10-28"]?.totals == ProgressTotals(known: 0, learning: 1))
  }

  @Test("a share sheet change applied the next morning moves its own day's totals")
  func shareSheetChangeMovesItsDaysTotals() async throws {
    clock.now = october(27, 20, 0)
    let (first, firstLog) = await stores()
    learn(taberu, "食べる", in: first)
    await first.flush()
    await firstLog.flush()
    let inbox = try share(eki, "駅", .known, madeAt: october(27, 23, 59))

    clock.now = october(28, 8, 0)
    let (knowledge, log) = await stores()
    #expect(log.days["2026-10-28"]?.totals == ProgressTotals(known: 0, learning: 1))
    await inbox.apply(to: WordLists(fileURL: folder.appending(path: "word-lists.json")), knowledge)
    await log.flush()

    #expect(ids(on: "2026-10-27", in: log) == [taberu.rawValue, eki.rawValue])
    #expect(log.days["2026-10-27"]?.totals == ProgressTotals(known: 1, learning: 1))
    #expect(log.days["2026-10-28"]?.totals == ProgressTotals(known: 1, learning: 1))
  }

  @Test("a share sheet change counts on every logged day after its own until today")
  func shareSheetChangeMovesLaterDays() async throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let seeded = """
      {"version":1,"days":{
      "2026-10-26":{"changes":[],"goal":20,"known":2,"learning":3},
      "2026-10-27":{"changes":[],"goal":20,"known":2,"learning":3}}}
      """
    try Data(seeded.utf8).write(to: logURL)
    let inbox = try share(eki, "駅", .learning, madeAt: october(25, 23, 59))

    let (knowledge, log) = await opened(applying: inbox, at: october(28, 8, 0))

    #expect(log.days["2026-10-25"]?.totals == ProgressTotals(known: 0, learning: 1))
    #expect(log.days["2026-10-26"]?.totals == ProgressTotals(known: 2, learning: 4))
    #expect(log.days["2026-10-27"]?.totals == ProgressTotals(known: 2, learning: 4))
    #expect(log.days["2026-10-28"]?.totals == knowledge.totals)
  }

  @Test("two share sheet changes on two past days applied together each count once")
  func twoShareSheetChangesOnTwoPastDays() async throws {
    _ = try share(eki, "駅", .learning, madeAt: october(25, 12, 0))
    let inbox = try share(taberu, "食べる", .learning, madeAt: october(27, 12, 0))

    let (_, log) = await opened(applying: inbox, at: october(29, 8, 0))

    #expect(log.days["2026-10-25"]?.totals == ProgressTotals(known: 0, learning: 1))
    #expect(log.days["2026-10-27"]?.totals == ProgressTotals(known: 0, learning: 2))
    #expect(log.days["2026-10-29"]?.totals == ProgressTotals(known: 0, learning: 2))
  }

  @Test("a synced change updates the day's totals and isn't recorded as a change")
  func syncedChange() async {
    clock.now = october(28, 9, 0)
    let (knowledge, log) = await stores()
    learn(taberu, "食べる", in: knowledge)
    knowledge.applySynced(
      KnownWordChange(storedID: eki.rawValue, headword: "駅", reading: "えき", status: .known))
    await log.flush()

    #expect(ids(on: "2026-10-28", in: log) == [taberu.rawValue])
    #expect(log.days["2026-10-28"]?.totals == ProgressTotals(known: 1, learning: 1))
  }

  @Test("the log listening leaves sync's change observer working")
  func syncStillHearsChanges() async {
    clock.now = october(28, 9, 0)
    let knowledge = WordKnowledge(fileURL: folder.appending(path: "word-knowledge.json"))
    knowledge.now = { [clock] in clock.now }
    var told: [SavedItemChange] = []
    knowledge.changeObserver = { told.append($0) }
    let log = await log()
    await log.listen(to: knowledge).value
    knowledge.setStatus(.known, id: eki, headword: "駅", reading: "えき")

    guard case .known(let change, let previous)? = told.first else {
      Issue.record("Sync wasn't told of the change")
      return
    }
    #expect(told.count == 1)
    #expect(change.storedID == eki.rawValue)
    #expect(change.changedAt == october(28, 9, 0))
    #expect(previous == .unknown)
    #expect(ids(on: "2026-10-28", in: log) == [eki.rawValue])
  }

  @Test("a log from a newer version opens read-only and is never saved over")
  func newerVersion() async throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let newer = Data(
      #"{"version":2,"days":{"2026-10-27":{"changes":[],"goal":5,"known":3,"learning":1}}}"#.utf8)
    try newer.write(to: logURL)
    clock.now = october(28, 9, 0)
    let (knowledge, log) = await stores()
    learn(taberu, "食べる", in: knowledge)
    await log.flush()

    #expect(log.readOnlyReason == .newerVersion)
    #expect(log.days["2026-10-27"]?.goal == 5)
    #expect(try Data(contentsOf: logURL) == newer)
    #expect(knowledge.status(taberu) == .learning)
  }

  @Test("a log it can't read is kept aside and loses none of the learner's words")
  func unreadableLog() async throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    await saveEkiAsKnown()
    try Data("{".utf8).write(to: logURL)

    clock.now = october(28, 9, 0)
    let (knowledge, log) = await stores()
    learn(taberu, "食べる", in: knowledge)
    await log.flush()
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: folder.appending(path: "word-knowledge.json"))
    await reloaded.flush()
    #expect(reloaded.isKnown(eki))
    #expect(reloaded.status(taberu) == .learning)
    #expect(ids(on: "2026-10-28", in: log) == [taberu.rawValue])
    let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
    #expect(names.contains { $0.hasPrefix("progress-log.unreadable-") })
  }

  @Test("a log with a change it can't read is kept aside before it's written again")
  func unreadableChange() async throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let at = Int(october(27, 9, 0).timeIntervalSince1970 * 1000)
    let damaged = Data(
      """
      {"version":1,"days":{"2026-10-27":{"changes":[
      {"id":"\(taberu.rawValue)","before":"unknown","after":"learning","at":\(at)},
      {"id":"\(miru.rawValue)","before":"unknown"}],"goal":20,"known":0,"learning":2}}}
      """.utf8)
    try damaged.write(to: logURL)

    clock.now = october(28, 9, 0)
    let log = await log()

    #expect(ids(on: "2026-10-27", in: log) == [taberu.rawValue])
    let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
    let kept = try #require(names.first { $0.hasPrefix("progress-log.unreadable-") })
    #expect(try Data(contentsOf: folder.appending(path: kept)) == damaged)
    #expect(try Data(contentsOf: logURL) != damaged)
  }

  @Test("the first launch writes today's real totals when the defaults change before it listens")
  func firstLaunchAfterADefaultsWrite() async {
    await saveEkiAsKnown()

    clock.now = october(28, 9, 0)
    let knowledge = WordKnowledge(fileURL: folder.appending(path: "word-knowledge.json"))
    knowledge.now = { [clock] in clock.now }
    let log = await log()
    defaults.set(7.0, forKey: DailyGoal.key)
    await withCheckedContinuation { done in OperationQueue.main.addOperation { done.resume() } }
    await log.listen(to: knowledge).value

    #expect(log.days["2026-10-28"] == ProgressLogDay(goal: 7, totals: ProgressTotals(known: 1, learning: 0)))
  }

  @Test("the first launch with the log writes today's totals, and today keeps the goal set")
  func firstLaunchAndGoal() async throws {
    await saveEkiAsKnown()

    clock.now = october(28, 9, 0)
    let (_, log) = await stores()
    #expect(log.days["2026-10-28"] == ProgressLogDay(goal: 20, totals: ProgressTotals(known: 1, learning: 0)))
    defaults.set(7.0, forKey: DailyGoal.key)
    for _ in 0..<100 where log.days["2026-10-28"]?.goal != 7 {
      try await Task.sleep(for: .milliseconds(10))
    }
    #expect(log.days["2026-10-28"]?.goal == 7)
  }

  @Test("the goal is read from one key, 20 unless set, rounded and kept from 1 to 200")
  func goalValue() {
    #expect(DailyGoal.read(defaults) == 20)
    for (stored, read) in [(0.0, 1), (500.0, 200), (7.6, 8), (Double.nan, 20)] {
      defaults.set(stored, forKey: DailyGoal.key)
      #expect(DailyGoal.read(defaults) == read)
    }
    defaults.set("lots", forKey: DailyGoal.key)
    #expect(DailyGoal.read(defaults) == 20)
  }

  @Test("the app reads the core's progress stats for a seeded log through the bundle")
  func statsThroughTheBundle() async throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let at = Int(october(27, 9, 0).timeIntervalSince1970 * 1000)
    let seeded = """
      {"version":1,"days":{
      "2026-10-26":{"changes":[{"id":"\(miru.rawValue)","before":"unknown","after":"learning","at":\(at)}],"goal":1,"known":0,"learning":1},
      "2026-10-27":{"changes":[{"id":"\(taberu.rawValue)","before":"unknown","after":"learning","at":\(at)},{"id":"kanji:語","before":"unknown","after":"known","at":\(at)}],"goal":1,"known":1,"learning":2}}}
      """
    try Data(seeded.utf8).write(to: logURL)
    defaults.set(3.0, forKey: DailyGoal.key)
    clock.now = october(28, 9, 0)
    let log = await log()

    let stats = try #require(await log.stats())
    #expect(stats.today == ProgressStats.Day(day: "2026-10-28", added: 0, markedKnown: 0, goal: 3, met: false))
    #expect(stats.streak == 2)
    #expect(stats.bestStreak == ProgressStats.Streak(length: 2, first: "2026-10-26", last: "2026-10-27"))
    #expect(stats.totals == ProgressStats.Totals(
      known: 1, learning: 2, markedKnownLast7: 1, addedLast7: 2, addedLast30: 2))
    #expect(stats.last7.map(\.added) == [0, 0, 0, 0, 1, 1, 0])
    #expect(stats.goalMet.last7 == ProgressStats.GoalMet(met: 2, days: 2))
    #expect(stats.knownOverTime.map(\.known) == [0, 1, 1])
    #expect(stats.dailyAverage == ProgressStats.DailyAverage(average: 1, days: 2))
    #expect(stats.words.last == ProgressStats.Words(
      day: "2026-10-27", addedToLearning: [taberu.rawValue], markedKnown: ["kanji:語"]))
  }

  @Test("the app reads the words marked Known in a week through the bundle")
  func knownByDateThroughTheBundle() async throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let at = Int(october(20, 9, 0).timeIntervalSince1970 * 1000)
    let seeded = """
      {"version":1,"days":{
      "2026-10-20":{"changes":[{"id":"\(miru.rawValue)","before":"learning","after":"known","at":\(at)}],"goal":1,"known":1,"learning":0},
      "2026-10-27":{"changes":[{"id":"\(taberu.rawValue)","before":"learning","after":"known","at":\(at)},{"id":"kanji:語","before":"unknown","after":"known","at":\(at)}],"goal":1,"known":3,"learning":0}}}
      """
    try Data(seeded.utf8).write(to: logURL)
    clock.now = october(28, 9, 0)
    let log = await log()

    let week = try #require(await log.knownByDate(week: 0))
    #expect(week.days.map(\.count) == [0, 0, 0, 0, 0, 2, 0])
    #expect(week.days[5] == KnownByDate.Day(day: "2026-10-27", markedKnown: [taberu.rawValue, "kanji:語"], count: 2))
    #expect(week.total == 2)
    #expect(week.change == 1)
    #expect(week.hasEarlier && !week.hasLater)
    #expect(week.firstDay == "2026-10-20")
    let earlier = try #require(await log.knownByDate(week: 1))
    #expect(earlier.total == 1)
    #expect(earlier.change == nil)
    #expect(!earlier.hasEarlier && earlier.hasLater)
  }
}
