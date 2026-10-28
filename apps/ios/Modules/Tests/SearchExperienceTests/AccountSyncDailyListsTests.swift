import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: daily lists")
final class AccountSyncDailyListsTests {
  private typealias Fixture = AccountFixture
  private var keepers: [(ProgressLog, DailyListKeeper)] = []

  private func keep(on fixture: Fixture) async -> DailyListKeeper {
    let log = ProgressLog(
      fileURL: fixture.directory.appending(path: "progress-log.json"), defaults: fixture.defaults,
      timeZone: .current)
    await log.flush()
    await log.listen(to: fixture.wordKnowledge).value
    let keeper = DailyListKeeper(log: log, lists: fixture.wordLists)
    keeper.start()
    keepers.append((log, keeper))
    return keeper
  }

  private func learn(
    _ id: String, _ headword: String, on fixture: Fixture, keeper: DailyListKeeper
  ) async {
    fixture.wordKnowledge.setStatus(
      .learning, id: LanguageReferenceID(rawValue: id), headword: headword, reading: headword)
    await keeper.settled()
  }

  private func todaysListID() throws -> String {
    let day = try #require(keepers.first?.0.today)
    return try #require(AccountRules.shared.dailyListID(day)).uuidString.lowercased()
  }

  @Test("the day's list is made and synced even when the account has 500 lists of its own")
  func dailyListsSkipTheCap() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    try await phone.signIn()
    for number in 1..<500 {
      service.change(
        for: Fixture.email,
        StubSyncRequest.Mutation(
          id: UUID().uuidString, entity: "list", operation: "create",
          entityId: UUID().uuidString.lowercased(), baseVersion: nil,
          fields: ["name": .string("List \(number)"), "position": .number(number)]))
    }
    let keeper = await keep(on: phone)
    await learn(Fixture.taberu, "食べる", on: phone, keeper: keeper)
    phone.wordLists.createList(named: "Anime")
    try await phone.syncNow()

    let listID = try todaysListID()
    #expect(service.data(of: "list:\(listID)", for: Fixture.email) != nil)
    #expect(service.liveKeys(for: Fixture.email, entity: "listWord") == ["listWord:\(listID)/\(Fixture.taberu)"])
    #expect(service.liveKeys(for: Fixture.email, entity: "list").count == 501)
    #expect(!phone.wordLists.lists.contains { $0.name == "Anime" })
  }

  @Test("a day's list another device made first counts as made, and both devices' words go in it")
  func madeOnAnotherDevice() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    try await pad.signIn()
    let phoneKeeper = await keep(on: phone)
    let padKeeper = await keep(on: pad)
    await learn(Fixture.taberu, "食べる", on: phone, keeper: phoneKeeper)
    await learn(Fixture.miru, "見る", on: pad, keeper: padKeeper)
    try await phone.syncNow()
    try await pad.syncNow()
    try await phone.syncNow()

    let listID = try todaysListID()
    let id = try #require(UUID(uuidString: listID))
    #expect(
      service.liveKeys(for: Fixture.email, entity: "listWord") == [
        "listWord:\(listID)/\(Fixture.taberu)", "listWord:\(listID)/\(Fixture.miru)",
      ].sorted())
    #expect(pad.sync.state.queue.isEmpty)
    for fixture in [phone, pad] {
      #expect(
        Set(fixture.wordLists.words(in: id).map(\.entryID)) == [Fixture.taberu, Fixture.miru])
    }
  }

  @Test("a day's list deleted on another device isn't made again here")
  func deletedOnAnotherDevice() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    let phoneKeeper = await keep(on: phone)
    await learn(Fixture.taberu, "食べる", on: phone, keeper: phoneKeeper)
    try await phone.syncNow()
    let listID = try todaysListID()
    phone.wordLists.deleteList(try #require(UUID(uuidString: listID)))
    try await phone.syncNow()

    try await pad.signIn()
    let padKeeper = await keep(on: pad)
    await learn(Fixture.miru, "見る", on: pad, keeper: padKeeper)
    try await pad.syncNow()

    #expect(pad.wordLists.dailyLists.isEmpty)
    #expect(service.data(of: "list:\(listID)", for: Fixture.email) == nil)
    #expect(service.liveKeys(for: Fixture.email, entity: "listWord").isEmpty)
  }
}
