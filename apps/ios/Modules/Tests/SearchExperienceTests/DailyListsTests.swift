import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Daily lists")
final class DailyListsTests {
  private final class Clock {
    var now = Date()
  }

  private struct Stores {
    let knowledge: WordKnowledge
    let log: ProgressLog
    let lists: WordLists
    let keeper: DailyListKeeper
  }

  private let folder = URL.temporaryDirectory.appending(
    path: "daily-lists-\(UUID().uuidString)", directoryHint: .isDirectory)
  private let defaults = MemoryDefaults()
  private let tokyo = TimeZone(identifier: "Asia/Tokyo") ?? .gmt
  private let english = Locale(identifier: "en_US")
  private let clock = Clock()
  private let taberu = LanguageReferenceID(rawValue: "042e07f7052f611fed33ddddf37f55fd")
  private let miru = LanguageReferenceID(rawValue: "7f490a9c9c0da94f4e9474f4efe74be1")
  private let eki = LanguageReferenceID(rawValue: "d49b2f3c5cbf3002ebf317043cbebdad")
  private var held: [Stores] = []

  deinit {
    try? FileManager.default.removeItem(at: folder)
  }

  private func at(_ time: String) -> Date {
    ISO8601DateFormatter().date(from: "2026-10-\(time):00+09:00") ?? .distantPast
  }

  private func stores() async -> Stores {
    let knowledge = WordKnowledge(fileURL: folder.appending(path: "word-knowledge.json"))
    knowledge.now = { [clock] in clock.now }
    let log = ProgressLog(
      fileURL: folder.appending(path: "progress-log.json"), defaults: defaults, timeZone: tokyo)
    log.now = { [clock] in clock.now }
    await log.flush()
    let lists = WordLists(fileURL: folder.appending(path: "word-lists.json"))
    await lists.flush()
    await log.listen(to: knowledge).value
    let keeper = DailyListKeeper(log: log, lists: lists, locale: english)
    keeper.start()
    let stores = Stores(knowledge: knowledge, log: log, lists: lists, keeper: keeper)
    held.append(stores)
    return stores
  }

  private func mark(
    _ status: WordKnowledgeStatus, _ id: LanguageReferenceID, _ headword: String,
    in stores: Stores
  ) async {
    stores.knowledge.setStatus(status, id: id, headword: headword, reading: headword)
    await stores.keeper.settled()
  }

  private func storesWithTwoWords() async -> Stores {
    clock.now = at("28T09:00")
    let stores = await stores()
    await mark(.learning, taberu, "食べる", in: stores)
    await mark(.learning, miru, "見る", in: stores)
    return stores
  }

  private func listID(_ day: String) throws -> UUID {
    try #require(AccountRules.shared.dailyListID(day))
  }

  private func words(on day: String, in stores: Stores) throws -> Set<String> {
    Set(stores.lists.words(in: try listID(day)).map(\.entryID))
  }

  @Test("the day's first Learning word makes the day's list, named by its date, and the next goes into it")
  func firstWordMakesTheList() async throws {
    clock.now = at("28T10:00")
    let stores = await stores()
    await mark(.learning, taberu, "食べる", in: stores)
    let list = try #require(stores.lists.lists.first { $0.id == (try listID("2026-10-28")) })
    #expect(list.name == "Oct 28, 2026")
    #expect(try words(on: "2026-10-28", in: stores) == [taberu.rawValue])

    await mark(.learning, miru, "見る", in: stores)
    #expect(try words(on: "2026-10-28", in: stores) == [taberu.rawValue, miru.rawValue])
    #expect(stores.lists.dailyLists.map(\.day) == ["2026-10-28"])
    #expect(stores.lists.ownLists.map(\.id) == [WordLists.favoritesID])
  }

  @Test("a word marked after midnight goes in the next day's list, a new one")
  func nextDayMakesANewList() async throws {
    clock.now = at("27T23:59")
    let stores = await stores()
    await mark(.learning, taberu, "食べる", in: stores)
    clock.now = at("28T00:01")
    await mark(.learning, miru, "見る", in: stores)

    #expect(stores.lists.dailyLists.map(\.day) == ["2026-10-28", "2026-10-27"])
    #expect(try words(on: "2026-10-27", in: stores) == [taberu.rawValue])
    #expect(try words(on: "2026-10-28", in: stores) == [miru.rawValue])
  }

  @Test("a word set back to Unknown the same day leaves, one marked Known stays, and a later day's change leaves an earlier list alone")
  func unknownLeavesKnownStays() async throws {
    let stores = await storesWithTwoWords()
    await mark(.learning, eki, "駅", in: stores)
    await mark(.unknown, taberu, "食べる", in: stores)
    await mark(.known, miru, "見る", in: stores)
    #expect(try words(on: "2026-10-28", in: stores) == [miru.rawValue, eki.rawValue])

    clock.now = at("29T09:00")
    await mark(.unknown, eki, "駅", in: stores)
    #expect(try words(on: "2026-10-28", in: stores) == [miru.rawValue, eki.rawValue])
    #expect(stores.lists.dailyLists.map(\.day) == ["2026-10-28"])
  }

  @Test("kanji, and words moved from Known back to Learning, aren't added")
  func onlyNewLearningWords() async throws {
    clock.now = at("28T09:00")
    let stores = await stores()
    let kanji = try #require(KanjiCharacter("見"))
    stores.knowledge.setStatus(.learning, for: SavedItem.kanji(kanji, reading: "み"))
    await stores.keeper.settled()
    await mark(.known, eki, "駅", in: stores)
    await mark(.learning, eki, "駅", in: stores)
    #expect(stores.lists.dailyLists.isEmpty)

    await mark(.learning, taberu, "食べる", in: stores)
    #expect(try words(on: "2026-10-28", in: stores) == [taberu.rawValue])
  }

  @Test("a word removed by hand isn't put back by another word's change, or by its own move to Known")
  func removedByHandStaysOut() async throws {
    let stores = await storesWithTwoWords()
    stores.lists.remove(storedID: taberu.rawValue, from: try listID("2026-10-28"))
    await mark(.learning, eki, "駅", in: stores)
    await mark(.known, taberu, "食べる", in: stores)
    #expect(try words(on: "2026-10-28", in: stores) == [miru.rawValue, eki.rawValue])
  }

  @Test("a word removed by hand isn't put back by moving it to Known and back to Learning the same day")
  func removedByHandStaysOutThroughKnown() async throws {
    let stores = await storesWithTwoWords()
    stores.lists.remove(storedID: taberu.rawValue, from: try listID("2026-10-28"))
    await mark(.known, taberu, "食べる", in: stores)
    await mark(.learning, taberu, "食べる", in: stores)
    #expect(try words(on: "2026-10-28", in: stores) == [miru.rawValue])
  }

  @Test("a progress log that opened read-only makes and changes no daily list")
  func readOnlyLogLeavesDailyListsAlone() async throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try Data(#"{"version":2,"days":{}}"#.utf8).write(to: folder.appending(path: "progress-log.json"))
    clock.now = at("28T09:00")
    let stores = await stores()
    #expect(stores.log.readOnlyReason == .newerVersion)
    await mark(.learning, taberu, "食べる", in: stores)
    #expect(stores.lists.dailyLists.isEmpty)
  }

  @Test("a deleted day's list isn't made again, here or after a relaunch, and one deleted elsewhere neither")
  func deletedListStaysDeleted() async throws {
    clock.now = at("28T09:00")
    let stores = await stores()
    await mark(.learning, taberu, "食べる", in: stores)
    stores.lists.deleteList(try listID("2026-10-28"))
    await mark(.learning, miru, "見る", in: stores)
    #expect(stores.lists.dailyLists.isEmpty)

    stores.lists.applySyncedRemoval(ofList: try listID("2026-10-29"))
    await stores.lists.flush()
    let relaunched = WordLists(fileURL: folder.appending(path: "word-lists.json"))
    await relaunched.flush()
    #expect(
      relaunched.deletedDailyListIDs == [try listID("2026-10-28"), try listID("2026-10-29")])
    #expect(relaunched.createList(named: "Oct 29, 2026", id: try listID("2026-10-29")) == nil)
    #expect(relaunched.createList(named: "Anime") != nil)
  }

  @Test("a change synced from the account touches no daily list")
  func syncedChangesLeaveDailyListsAlone() async throws {
    clock.now = at("28T09:00")
    let stores = await stores()
    stores.knowledge.applySynced(
      KnownWordChange(storedID: taberu.rawValue, headword: "食べる", reading: "たべる", status: .learning))
    await stores.keeper.settled()
    #expect(stores.lists.dailyLists.isEmpty)

    await mark(.learning, miru, "見る", in: stores)
    stores.knowledge.applySynced(
      KnownWordChange(storedID: miru.rawValue, headword: "見る", reading: "みる", status: .unknown))
    await stores.keeper.settled()
    #expect(try words(on: "2026-10-28", in: stores) == [miru.rawValue])
  }

  @Test("moving own lists leaves daily lists out of the order")
  func movesOwnListsOnly() async throws {
    clock.now = at("28T09:00")
    let stores = await stores()
    await mark(.learning, taberu, "食べる", in: stores)
    let anime = try #require(stores.lists.createList(named: "Anime"))
    stores.lists.moveLists(fromOffsets: [1], toOffset: 0)
    #expect(stores.lists.ownLists.map(\.id) == [anime.id, WordLists.favoritesID])
    #expect(stores.lists.ownLists.map(\.position) == [0, 1])
    #expect(stores.lists.dailyLists.map(\.day) == ["2026-10-28"])
  }

  @Test("a daily list is titled Today, Yesterday, or its weekday and date, and grouped by this week and then by month")
  func titlesAndGroups() throws {
    let today = "2026-10-28"
    let title = { (day: String) in DailyListDays.title(of: day, today: today, locale: self.english) }
    #expect(title("2026-10-28") == "Today")
    #expect(title("2026-10-27") == "Yesterday")
    #expect(title("2026-10-26") == "Monday, Oct 26")
    let days = ["2026-09-30", "2026-10-21", "2026-10-29", "2026-10-22", "2026-10-01", "2026-10-28"]
    let lists = try days.map { day in
      DailyList(
        list: WordList(
          id: try listID(day), name: day, position: 0, createdAt: .now, updatedAt: .now),
        day: day)
    }
    let groups = DailyListDays.groups(lists, today: today, locale: english)
    #expect(groups.map(\.heading) == ["This week", "October 2026", "September 2026"])
    #expect(
      groups.map { $0.lists.map(\.day) } == [
        ["2026-10-29", "2026-10-28", "2026-10-22"], ["2026-10-21", "2026-10-01"], ["2026-09-30"],
      ])
  }

  @Test("a daily list's row says how many words, whether the goal was met, and how many are now Known")
  func rowLine() {
    #expect(
      DailyListWording.line(words: 26, isToday: false, met: true, known: 8)
        == "26 words · goal met · 8 now Known")
    #expect(DailyListWording.line(words: 12, isToday: true, met: false, known: 0) == "12 words so far")
    #expect(DailyListWording.line(words: 1, isToday: false, met: false, known: 1) == "1 word · 1 now Known")
  }
}
