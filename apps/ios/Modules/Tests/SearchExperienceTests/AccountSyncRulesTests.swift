import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: settings, recent searches, and the first upload")
struct AccountSyncRulesTests {
  private typealias Fixture = AccountFixture
  private let speed = TranslateExperience.speechSpeedKey
  private let taberu = SavedItemID(rawValue: AccountFixture.taberu)

  private func sent(_ fixture: Fixture) -> [[String]] {
    fixture.server.requests(to: "POST /v1/sync").map {
      $0.sync.mutations.map { "\($0.entity) \($0.operation) \($0.entityId) \($0.baseVersion ?? -1)" }
    }
  }

  private func searches(of fixture: Fixture) async -> [String] {
    await fixture.searches.load().map(\.value)
  }

  @Test("each setting syncs on its own: changes to two settings on two phones both apply")
  func settingsApart() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    try await pad.signIn()
    phone.defaults.set(1.5, forKey: speed)
    DailyGoal.write(30, to: phone.defaults)
    pad.defaults.set("known", forKey: ResultsLearner.filterKey)
    try await phone.syncNow()
    try await pad.syncNow()
    try await phone.syncNow()

    #expect(pad.defaults.double(forKey: speed) == 1.5)
    #expect(DailyGoal.read(pad.defaults) == 30)
    #expect(phone.defaults.string(forKey: ResultsLearner.filterKey) == "known")
  }

  @Test("a setting the account refuses, such as the daily goal, stays on the device, and goes again the next time the app opens")
  func refusedSetting() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map { StubSync.rejected($0.id, "unknown_setting") }, cursor: "c2")
    }
    fixture.defaults.set(1.5, forKey: speed)
    DailyGoal.write(30, to: fixture.defaults)
    try await fixture.syncNow()
    #expect(fixture.sync.state.queue.isEmpty)
    #expect(fixture.defaults.double(forKey: speed) == 1.5)
    #expect(DailyGoal.read(fixture.defaults) == 30)

    fixture.serve()
    await fixture.launch()
    try await fixture.syncNow()
    #expect(sent(fixture).last?.contains { $0.hasPrefix("setting set translate.speechSpeed") } == true)
    #expect(sent(fixture).last?.contains { $0.hasPrefix("setting set progress.dailyGoal") } == true)
  }

  @Test("a setting whose conflict comes back as gone goes again at the account's version")
  func settingConflictWithAGap() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map {
          $0.baseVersion == 0
            ? ["id": $0.id, "status": "applied", "version": 1]
            : StubSync.conflict($0.id, StubSync.gone("setting", $0.entityId, version: 0))
        }, cursor: "c2")
    }
    fixture.defaults.set(1.5, forKey: speed)
    try await fixture.syncNow()
    fixture.defaults.set(0.75, forKey: speed)
    try await fixture.syncNow()

    #expect(
      sent(fixture).suffix(2) == [
        ["setting set translate.speechSpeed 1"], ["setting set translate.speechSpeed 0"],
      ])
    #expect(fixture.defaults.double(forKey: speed) == 0.75)
  }

  @Test("a search removed on one phone stays removed on another that searched it again without hearing")
  func removalBeatsAStaleSearch() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    await phone.searches.record(SearchQuery("猫"))
    try await phone.signIn()
    try await pad.signIn()
    await pad.searches.remove(SearchQuery("猫"))
    try await pad.syncNow()

    await phone.searches.record(SearchQuery("猫"))
    try await phone.syncNow()
    #expect(await searches(of: phone).isEmpty)
  }

  @Test("the account keeps the 50 latest searches; one pushed out elsewhere goes here too, and its version is let go in time")
  func searchesPruned() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    for number in 0..<AccountSyncState.goneKept + 1 { await phone.searches.record(SearchQuery("語\(number)")) }
    try await phone.signIn()
    try await pad.signIn()
    for number in 0..<AccountSyncState.goneKept + 10 { await pad.searches.record(SearchQuery("新\(number)")) }
    try await pad.syncNow()
    try await phone.syncNow()

    #expect(await searches(of: phone) == (0..<50).reversed().map { "新\($0 + AccountSyncState.goneKept - 40)" })
    #expect(phone.sync.state.goneSearches.count == AccountSyncState.goneKept)
  }

  @Test("a search removed before the account's key came is removed from the account once it does")
  func removalBeforeTheKey() async throws {
    let fixture = try await Fixture.afterSignIn()
    await fixture.searches.record(SearchQuery("猫"))
    await fixture.searches.record(SearchQuery("犬"))
    await fixture.searches.remove(SearchQuery("猫"))
    await fixture.searches.remove(SearchQuery("犬"))
    await fixture.searches.record(SearchQuery("犬"))
    let key = String(repeating: "1", count: 64)
    fixture.serve { request in
      StubSync.answer(results: StubSync.applied(request), cursor: "c2", searchKey: key)
    }
    try await fixture.syncNow()

    let cat = try #require(KeptChanges.searchID("猫", under: key))
    let dog = try #require(KeptChanges.searchID("犬", under: key))
    #expect(sent(fixture).last == ["recentSearch remove \(cat) 0", "recentSearch search \(dog) 0"])
    #expect(fixture.sync.state.searchRemovalsBeforeKey.isEmpty)
  }

  @Test("a search waits for the next sync rather than starting one, as other changes do")
  func searchesRideAlong() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { request in
      StubSync.answer(results: StubSync.applied(request), cursor: "c2", searchKey: String(repeating: "1", count: 64))
    }
    try await fixture.syncNow()
    var started = 0
    fixture.sync.onLocalChange = { started += 1 }

    await fixture.searches.record(SearchQuery("猫"))
    #expect(started == 0)
    #expect(fixture.queuedOperations.count == 1)
    fixture.markKnown(Fixture.taberu)
    #expect(started == 1)
  }

  @Test("a phone closed after signing in but before its first upload sends everything when it opens again, from no cursor")
  func relaunchBeforeTheFirstUpload() async throws {
    let (_, request) = try await Fixture.caughtUp(from: []) { fixture in
      fixture.markKnown(Fixture.taberu)
      fixture.watch("dQw4w9WgXcQ")
    }
    #expect(request.cursor == nil)
    #expect(Set(request.mutations.map(\.entity)).isSuperset(of: ["knownWord", "list", "watchedVideo"]))
    #expect(request.mutations.allSatisfy { $0.baseVersion == 0 })
  }

  @Test("signing in records that nothing has gone up yet, so a relaunch or a sign-out before the first upload still sends it")
  func interruptedFirstUpload() async throws {
    let fixture = Fixture()
    let (held, letGo) = AsyncStream.makeStream(of: Void.self)
    fixture.frequency = FrequencyChoice(changedFromStandard: {
      for await _ in held {}
      return nil
    })
    fixture.serve()
    await fixture.launch()
    await fixture.notes.save(LearnerWordNote(text: "朝"), for: taberu)

    try await fixture.account.signIn(email: Fixture.email, code: "123456")
    await fixture.sync.flush()
    let file = fixture.directory.appending(path: "account-sync.json")
    let stored = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
    let state = try #require(stored?["state"] as? [String: Any])
    #expect(state["syncedEntities"] as? [String] == [])
    await fixture.account.signOut()
    letGo.finish()
    await fixture.account.scheduler.settled()
    #expect(fixture.sync.state.queue.isEmpty)

    try await fixture.signIn()
    #expect(sent(fixture).flatMap { $0 }.contains { $0.hasPrefix("wordNote write") })
  }
}
