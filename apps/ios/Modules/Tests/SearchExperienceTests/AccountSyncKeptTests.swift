import CoreGraphics
import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: notes, settings, and recent searches")
struct AccountSyncKeptTests {
  private typealias Fixture = AccountFixture
  private let taberu = SavedItemID(rawValue: AccountFixture.taberu)
  private let noteID = UUID().uuidString.lowercased()
  private let photo = Data("朝ごはんの写真".utf8)

  private func sent(_ entity: String, in fixture: Fixture) -> [StubSyncRequest.Mutation] {
    fixture.server.requests(to: "POST /v1/sync").flatMap(\.sync.mutations)
      .filter { $0.entity == entity }
  }

  private func texts(of fixture: Fixture) async -> Set<String> {
    Set(await fixture.notes.load(taberu).map(\.text))
  }

  @Test("the app's ID for a recent search is the service's: the HMAC-SHA256 of the NFC query under the account's key")
  func searchIDsAreTheServices() {
    let key = String(repeating: "0", count: 64)
    #expect(
      KeptChanges.searchID("食べる", under: key)
        == "d08c89a51f2143101860e9ddce809ddb3c6d58c0e04ed0d10a32cc108dac35bc")
    #expect(
      KeptChanges.searchID("か\u{3099}", under: key)
        == "e3b72080c90808003284e9ccfa6ae3e003caffce7edccdc254f0e20cefdbea3f")
    #expect(KeptChanges.searchID("食べる", under: "not a key") == nil)
  }

  @Test("the first sync uploads each note, photo and its word, changed setting, and the profile photo, and recent searches once the account's key comes")
  func firstUpload() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    await phone.notes.save(LearnerWordNote(id: noteID, text: "朝に食べる。"), for: taberu)
    await phone.media.save(
      EncounterMediaAttachment(name: "朝.jpg", data: photo),
      for: EncounterWordReference(id: taberu, headword: "食べる", reading: "たべる"))
    phone.defaults.set(1.5, forKey: TranslateExperience.speechSpeedKey)
    phone.defaults.set("list", forKey: "translate.layout.v1")
    await phone.searches.record(SearchQuery("猫"))
    await phone.profile.setPhoto(try ProfilePhotoImage.png())

    try await phone.signIn()

    let first = try #require(phone.server.requests(to: "POST /v1/sync").first?.sync.mutations)
      .filter { SyncEntity.kept.contains($0.entity) }
    #expect(
      Set(first.map { "\($0.entity) \($0.operation)" }) == [
        "wordNote write", "photo add", "photoWord add", "profilePhoto set", "setting set",
      ])
    #expect(first.allSatisfy { $0.baseVersion == 0 })
    #expect(sent("setting", in: phone).map(\.entityId) == ["translate.speechSpeed"])
    #expect(sent("wordNote", in: phone).first?.fields?["text"] == .string("朝に食べる。"))
    #expect(sent("recentSearch", in: phone).map(\.entityId) == [service.searchID("猫", for: Fixture.email)])
    #expect(service.file(photo.sha256, for: Fixture.email) == photo)
    #expect(phone.sync.state.queue.isEmpty)
  }

  @Test("a note written on one phone shows on the other, and deleting it there deletes it here")
  func noteOnTwoPhones() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    await phone.notes.save(
      LearnerWordNote(id: noteID, text: "朝に食べる。", headword: "食べる", reading: "たべる"), for: taberu)
    try await phone.syncNow()
    try await pad.signIn()
    #expect(await texts(of: pad) == ["朝に食べる。"])

    await pad.notes.save(LearnerWordNote(id: noteID, text: ""), for: taberu)
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(await texts(of: phone).isEmpty)
    #expect(service.liveKeys(for: Fixture.email, entity: "wordNote").isEmpty)
  }

  @Test("two phones that edit one note keep both: the edit that lost becomes a new note on the word")
  func conflictingEdits() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    await phone.notes.save(LearnerWordNote(id: noteID, text: "朝"), for: taberu)
    try await phone.syncNow()
    try await pad.signIn()

    await phone.notes.save(LearnerWordNote(id: noteID, text: "朝ごはん"), for: taberu)
    try await phone.syncNow()
    await pad.notes.save(LearnerWordNote(id: noteID, text: "夜ごはん"), for: taberu)
    try await pad.syncNow()
    try await phone.syncNow()

    #expect(await texts(of: pad) == ["朝ごはん", "夜ごはん"])
    #expect(await texts(of: phone) == ["朝ごはん", "夜ごはん"])
  }

  @Test("a setting changed on one phone changes on the other, the first to sync a change wins, and Translate's layout stays on each")
  func settingsOnTwoPhones() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    try await pad.signIn()

    phone.defaults.set(1.5, forKey: TranslateExperience.speechSpeedKey)
    phone.defaults.set("list", forKey: "translate.layout.v1")
    try await phone.syncNow()
    pad.defaults.set(0.75, forKey: TranslateExperience.speechSpeedKey)
    try await pad.syncNow()

    #expect(pad.defaults.double(forKey: TranslateExperience.speechSpeedKey) == 1.5)
    #expect(pad.defaults.string(forKey: "translate.layout.v1") == nil)
    try await phone.syncNow()
    #expect(phone.defaults.double(forKey: TranslateExperience.speechSpeedKey) == 1.5)
  }

  @Test("recent searches sync under the account's key: a query is one search on both phones, and removing it on one removes it on the other")
  func searchesOnTwoPhones() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    await phone.searches.record(SearchQuery("猫"))
    await pad.searches.record(SearchQuery("猫"))
    try await phone.signIn()
    try await pad.signIn()
    #expect(service.liveKeys(for: Fixture.email, entity: "recentSearch").count == 1)
    await pad.searches.record(SearchQuery("犬"))
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(await phone.searches.load().map(\.value) == ["犬", "猫"])

    await pad.searches.remove(SearchQuery("猫"))
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(await phone.searches.load().map(\.value) == ["犬"])
  }

  @Test("searches wait for the account's key, and a new key sends each again under it and removes it under the old")
  func searchKeys() async throws {
    let fixture = try await Fixture.afterSignIn()
    await fixture.searches.record(SearchQuery("猫"))
    #expect(fixture.sync.state.queue.isEmpty)
    let first = String(repeating: "1", count: 64)
    let second = String(repeating: "2", count: 64)
    let firstID = try #require(KeptChanges.searchID("猫", under: first))
    let secondID = try #require(KeptChanges.searchID("猫", under: second))

    for (cursor, key) in [("c2", first), ("c3", second)] {
      fixture.serve { request in
        StubSync.answer(results: StubSync.applied(request), cursor: cursor, searchKey: key)
      }
      try await fixture.syncNow()
    }

    let requests = fixture.server.requests(to: "POST /v1/sync").map {
      $0.sync.mutations.map { "\($0.operation) \($0.entityId)" }
    }
    #expect(requests.suffix(3) == [["search \(firstID)"], [], ["remove \(firstID)", "search \(secondID)"]])
  }

  @Test("a recent search from the account whose ID isn't its query's under the key is left out")
  func mismatchedSearch() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { _ in
      StubSync.answer(
        changes: [
          StubSync.put(
            "recentSearch", String(repeating: "a", count: 64), 1,
            ["query": "猫", "searchedAt": "2026-10-06T10:00:00.000Z"])
        ], cursor: "c2", searchKey: String(repeating: "1", count: 64))
    }
    try await fixture.syncNow()
    #expect(await fixture.searches.load().isEmpty)
  }

  @Test("the frequency dictionaries the learner chooses go up as one setting, and the account's choice is handed to the packs")
  func frequencyChoice() async throws {
    let fixture = Fixture()
    let handed = HandedChoices()
    let relay = KeptChangeRelay()
    fixture.frequency = FrequencyChoice(
      relay: relay, changedFromStandard: { KeptChanges.settingSet(FrequencyChoice.setting, .string("")) },
      apply: { await handed.add($0) })
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    #expect(sent("setting", in: fixture).map(\.entityId) == [FrequencyChoice.setting])

    await relay.post(KeptChanges.settingSet(FrequencyChoice.setting, .string("a.pack,b.pack")))
    #expect(fixture.queuedOperations == ["setting set \(FrequencyChoice.setting)"])
    fixture.serve { request in
      StubSync.answer(
        results: StubSync.applied(request, version: 2),
        changes: [
          StubSync.put(
            "setting", FrequencyChoice.setting, 3,
            ["name": FrequencyChoice.setting, "value": "c.pack"])
        ], cursor: "c2")
    }
    try await fixture.syncNow()
    #expect(await handed.values == [.string("c.pack")])
  }

  @Test("signing in doesn't wait for the stores the first upload reads, and the first sync does")
  func signInDoesNotWaitForTheStores() async throws {
    let fixture = Fixture()
    let (held, letGo) = AsyncStream.makeStream(of: Void.self)
    fixture.frequency = FrequencyChoice(changedFromStandard: {
      for await _ in held {}
      return KeptChanges.settingSet(FrequencyChoice.setting, .string(""))
    })
    fixture.serve()
    await fixture.launch()

    try await fixture.account.signIn(email: Fixture.email, code: "123456")
    #expect(fixture.sync.account?.email == Fixture.email)
    #expect(fixture.server.requests(to: "POST /v1/sync").isEmpty)

    letGo.finish()
    await fixture.account.scheduler.settled()
    #expect(sent("setting", in: fixture).map(\.entityId) == [FrequencyChoice.setting])
  }

  @Test("a sync or a photo upload answered 402, not subscribed, keeps every change queued, and isn't tried again on its own")
  func notSubscribed() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve(
      sync: { _ in .error(402, "subscription_required") },
      files: { _ in .error(402, "subscription_required") })
    await fixture.notes.save(LearnerWordNote(id: noteID, text: "朝"), for: taberu)
    let syncs = fixture.server.requests(to: "POST /v1/sync").count
    await fixture.account.scheduler.refresh()
    #expect(fixture.server.requests(to: "POST /v1/sync").count == syncs + 1)
    #expect(fixture.queuedOperations == ["wordNote write \(noteID)"])

    await fixture.media.save(
      EncounterMediaAttachment(name: "朝.jpg", data: photo),
      for: EncounterWordReference(id: taberu, headword: "食べる", reading: "たべる"))
    await fixture.account.scheduler.refresh()
    #expect(fixture.server.requests(to: "PUT /v1/photos/\(photo.sha256)").count == 1)
    #expect(fixture.queuedOperations.count == 3)

    #expect(fixture.account.scheduler.remainingWait(atLeast: 0) == 0)
    #expect(fixture.retries.waits.isEmpty)
    #expect(fixture.server.requests(to: "POST /v1/sync").count == syncs + 1)
    guard case .refused(status: 402, _, _, _)? = fixture.sync.lastFailure else {
      Issue.record("expected a 402, got \(String(describing: fixture.sync.lastFailure))")
      return
    }
  }
}

actor HandedChoices {
  private(set) var values: [SyncFieldValue] = []

  func add(_ value: SyncFieldValue) { values.append(value) }
}

enum ProfilePhotoImage {
  static func png() throws -> Data {
    let image = try #require(
      ImageCoding.drawing(width: 8, height: 8) { context in
        context.setFillColor(CGColor(red: 0.8, green: 0.3, blue: 0.2, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
      })
    return try #require(ImageCoding.pngData(image))
  }
}
