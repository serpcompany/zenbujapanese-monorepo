import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: the profile")
struct AccountSyncProfileTests {
  private typealias Fixture = AccountFixture
  private let other = "other@example.com"

  private func profileUpdates(in fixture: Fixture) -> [StubSyncRequest.Mutation] {
    fixture.server.requests(to: "POST /v1/sync").flatMap(\.sync.mutations)
      .filter { $0.entity == SyncEntity.profile }
  }

  private func reads(in fixture: Fixture) -> Int {
    fixture.server.requests(to: "GET /v1/me").count
  }

  @Test("the first sync reads the profile, takes the account's fields, and fills its empty ones")
  func firstSyncTakesTheAccountsFields() async throws {
    let fixture = Fixture()
    fixture.serve(profile: .json(200, Fixture.profile(name: "Devin Schumacher", version: 4)))
    await fixture.launch()
    fixture.profile.edit(ProfileFields(name: "Phone Name", username: "phone_user"))
    fixture.profile.email = "phone@example.com"

    try await fixture.signIn()

    #expect(reads(in: fixture) == 1)
    #expect(fixture.profile.name == "Devin Schumacher")
    #expect(fixture.profile.username == "phone_user")
    let update = try #require(profileUpdates(in: fixture).first)
    #expect(update.operation == "update")
    #expect(update.entityId == Fixture.userID)
    #expect(update.baseVersion == 4)
    #expect(update.fields == ["username": .string("phone_user")])
    await fixture.launch()
    try await fixture.syncNow()
    #expect(reads(in: fixture) == 1)
    #expect(fixture.profile.email == "phone@example.com")
  }

  @Test("a profile whose fields the account already has sends nothing up")
  func firstSyncSendsNothingTheAccountHas() async throws {
    let fixture = Fixture()
    fixture.serve(profile: .json(200, Fixture.profile(name: "Kana Fan", username: "kana_fan")))
    await fixture.launch()

    try await fixture.signIn()

    #expect(fixture.profile.fields == ProfileFields(name: "Kana Fan", username: "kana_fan"))
    #expect(profileUpdates(in: fixture).isEmpty)
  }

  @Test("a profile the service won't read leaves the rest of sync going, and is read next time")
  func unreadProfileDoesntStopSync() async throws {
    for unread in [StubReply.error(403, "insufficient_scope"), .json(200, ["name": 1])] {
      let fixture = Fixture()
      fixture.serve(profile: unread)
      await fixture.launch()
      fixture.markKnown(Fixture.taberu)

      try await fixture.signIn()
      #expect(fixture.sync.state.versions["knownWord:\(Fixture.taberu)"] == 1)
      #expect(!fixture.sync.state.knowsProfile)

      fixture.serve(profile: .json(200, Fixture.profile(name: "Kana Fan")))
      try await fixture.syncNow()
      #expect(fixture.profile.name == "Kana Fan")
    }
  }

  @Test("edits wait until the profile is read, then the account's fields still win")
  func editsWaitForTheRead() async throws {
    let fixture = Fixture()
    fixture.serve(profile: .json(200, Fixture.profile(name: "Web Name")))
    await fixture.launch()
    try await fixture.signIn()
    await fixture.account.signOut()
    fixture.profile.edit(ProfileFields(name: "Phone Name"))

    fixture.serve(profile: .error(503, "unavailable"))
    try await fixture.signIn()
    #expect(profileUpdates(in: fixture).isEmpty)
    #expect(fixture.profile.name == "Phone Name")
    #expect(!fixture.sync.state.queue.isEmpty)
    #expect(fixture.sync.queuedChangeCount == 0)

    fixture.serve(profile: .json(200, Fixture.profile(name: "Web Name")))
    try await fixture.syncNow()
    #expect(profileUpdates(in: fixture).isEmpty)
    #expect(fixture.profile.name == "Web Name")
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("an edit in the app reaches the account, and one on the website reaches the app")
  func editsGoBothWays() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    phone.profile.edit(ProfileFields(name: "Kana", username: "kana_fan"))
    try await phone.signIn()
    try await pad.signIn()
    #expect(pad.profile.fields == ProfileFields(name: "Kana", username: "kana_fan"))
    let readsBefore = reads(in: phone)

    pad.profile.edit(ProfileFields(name: "Kana Fan"))
    try await pad.syncNow()
    #expect(service.profile(for: Fixture.email)["name"] as? String == "Kana Fan")

    service.editProfileOnTheWebsite(for: Fixture.email, ["username": .null])
    try await phone.syncNow()
    #expect(phone.profile.fields == ProfileFields(name: "Kana Fan", username: ""))
    #expect(reads(in: phone) == readsBefore)
  }

  @Test("an edit made on both sides before a sync ends with the account's copy")
  func conflictTakesTheAccountsCopy() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    try await phone.signIn()
    service.editProfileOnTheWebsite(for: Fixture.email, ["name": .string("Website Name")])

    phone.profile.edit(ProfileFields(name: "Phone Name"))
    try await phone.syncNow()

    #expect(phone.profile.name == "Website Name")
    #expect(phone.sync.state.queue.isEmpty)
    #expect(service.profile(for: Fixture.email)["name"] as? String == "Website Name")
  }

  @Test("a username the account refuses goes back, says why, and leaves an edit after it alone")
  func refusedUsernameGoesBack() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.editProfileOnTheWebsite(for: other, ["username": .string("kana_fan")])
    try await phone.signIn()

    phone.profile.edit(ProfileFields(username: "kana_fan"))
    phone.profile.edit(ProfileFields(name: "Kana F"))
    try await phone.syncNow()

    #expect(phone.profile.fields == ProfileFields(name: "Kana F", username: ""))
    #expect(phone.profile.refusal == .usernameTaken)
    #expect(service.profile(for: Fixture.email)["name"] as? String == "Kana F")
    phone.profile.edit(ProfileFields(username: "kana_fan_2"))
    #expect(phone.profile.refusal == nil)
  }

  @Test("a refused first upload takes back only the field the account refused")
  func refusedFirstUploadKeepsTheName() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.editProfileOnTheWebsite(for: other, ["username": .string("kana_fan")])
    phone.profile.edit(ProfileFields(name: "Kana", username: "kana_fan"))

    try await phone.signIn()

    #expect(phone.profile.fields == ProfileFields(name: "Kana", username: ""))
    #expect(phone.profile.refusal == .usernameTaken)
    #expect(service.profile(for: Fixture.email)["name"] as? String == "Kana")
  }

  @Test("a change the account refuses for another reason goes back and says so")
  func otherRefusalsGoBack() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map { StubSync.rejected($0.id, "invalid_fields") },
        cursor: "cursor-2")
    }

    fixture.profile.edit(ProfileFields(name: "Kana"))
    try await fixture.syncNow()

    #expect(fixture.profile.name == "")
    #expect(fixture.profile.refusal == .other)
  }

  @Test("two refused edits of one field end on the account's value, not the first refused one")
  func twoRefusedEditsGoBack() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.editProfileOnTheWebsite(for: other, ["username": .string("taken_a")])
    service.editProfileOnTheWebsite(for: "third@example.com", ["username": .string("taken_b")])
    service.editProfileOnTheWebsite(for: Fixture.email, ["username": .string("kana_fan")])
    try await phone.signIn()

    phone.profile.edit(ProfileFields(username: "taken_a"))
    phone.profile.edit(ProfileFields(username: "taken_b"))
    try await phone.syncNow()

    #expect(phone.profile.username == "kana_fan")
    #expect(phone.profile.refusal == .usernameTaken)
    #expect(phone.sync.state.queue.isEmpty)
  }

  @Test("signing in again keeps the account's fields over edits made signed out, and fills the rest")
  func signingInAgainTakesTheAccountsFields() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.editProfileOnTheWebsite(for: Fixture.email, ["name": .string("Kana Fan")])
    phone.profile.email = "phone@example.com"
    try await phone.signIn()
    await phone.account.signOut()
    #expect(phone.profile.name == "Kana Fan")

    phone.profile.edit(ProfileFields(name: ""))
    phone.profile.edit(ProfileFields(username: "kana"))
    #expect(phone.sync.state.queue.allSatisfy { $0.fields?["name"] == nil })
    await phone.launch()
    try await phone.signIn()

    #expect(reads(in: phone) == 2)
    #expect(phone.profile.fields == ProfileFields(name: "Kana Fan", username: "kana"))
    #expect(phone.profile.email == "phone@example.com")
    #expect(service.profile(for: Fixture.email)["username"] as? String == "kana")
    #expect(service.profile(for: Fixture.email)["name"] as? String == "Kana Fan")
  }

  @Test("signing in to another account takes its profile as it is, without the last account's")
  func anotherAccountTakesItsOwnProfile() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.editProfileOnTheWebsite(
      for: Fixture.email, ["name": .string("Kana Fan"), "username": .string("kana_fan")])
    try await phone.signIn()
    await phone.account.signOut()

    try await phone.signIn(as: other)

    #expect(phone.profile.fields == ProfileFields(name: "", username: ""))
    #expect(profileUpdates(in: phone).isEmpty)
    #expect(phone.profile.refusal == nil)
  }

  @Test("a name or username the account can't take stays on the phone through later syncs")
  func unsendableFieldsStay() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    phone.profile.edit(ProfileFields(name: "Kana", username: "kana.fan"))

    try await phone.signIn()
    #expect(phone.profile.fields == ProfileFields(name: "Kana", username: "kana.fan"))
    #expect(service.profile(for: Fixture.email)["username"] is NSNull)

    service.editProfileOnTheWebsite(for: Fixture.email, ["name": .string("Kana Fan")])
    try await phone.syncNow()
    #expect(phone.profile.fields == ProfileFields(name: "Kana Fan", username: "kana.fan"))

    let softHyphen = "Ka\u{AD}na"
    pad.profile.edit(ProfileFields(name: softHyphen))
    try await pad.signIn(as: other)
    service.editProfileOnTheWebsite(for: other, ["username": .string("kana_pad")])
    try await pad.syncNow()
    #expect(pad.profile.fields == ProfileFields(name: softHyphen, username: "kana_pad"))
    #expect(service.profile(for: other)["name"] as? String == "")
  }

  @Test("a profile pulled before the profile is read waits, and the read decides")
  func pulledProfileWaitsForTheRead() async throws {
    let fixture = Fixture()
    let pulled = StubSync.put(
      SyncEntity.profile, Fixture.userID, 5, Fixture.profile(name: "Pulled", version: 5))
    let pulledData = try JSONSerialization.data(withJSONObject: pulled)
    fixture.serve(profile: .error(503, "unavailable")) { request in
      let change = (try? JSONSerialization.jsonObject(with: pulledData)) ?? [:]
      return StubSync.answer(
        results: StubSync.applied(request), changes: [change as? [String: Any] ?? [:]],
        cursor: "cursor-1")
    }
    await fixture.launch()
    fixture.profile.edit(ProfileFields(name: "Phone"))

    try await fixture.signIn()
    #expect(fixture.profile.name == "Phone")

    fixture.serve(profile: .json(200, Fixture.profile(name: "Read Name", version: 6)))
    try await fixture.syncNow()
    #expect(fixture.profile.name == "Read Name")
  }

  @Test("a later edit of a refused field that the account takes leaves no refusal showing")
  func laterEditOfARefusedFieldClearsIt() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.editProfileOnTheWebsite(for: other, ["username": .string("taken_a")])
    try await phone.signIn()

    phone.profile.edit(ProfileFields(username: "taken_a"))
    phone.profile.edit(ProfileFields(username: "kana_free"))
    try await phone.syncNow()

    #expect(phone.profile.username == "kana_free")
    #expect(phone.profile.refusal == nil)
    #expect(service.profile(for: Fixture.email)["username"] as? String == "kana_free")
  }
}
