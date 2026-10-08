import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: signed out, other accounts, and Favorites")
struct AccountSignedOutTests {
  private typealias Fixture = AccountFixture
  private let other = "other@example.com"

  private func install(on server: StubAccountServer) async -> Fixture {
    let fixture = Fixture(server: server)
    await fixture.launch()
    return fixture
  }

  private func signedInPhone(
    with listNames: [String] = []
  ) async throws -> (service: FakeAccountService, phone: Fixture, lists: [WordList]) {
    let server = StubAccountServer()
    let service = FakeAccountService(on: server)
    let phone = await install(on: server)
    let lists = listNames.compactMap { phone.wordLists.createList(named: $0) }
    try await phone.signIn()
    return (service, phone, lists)
  }

  private func changeElsewhere(
    _ service: FakeAccountService, list id: UUID, _ operation: String,
    fields: [String: SyncFieldValue]? = nil
  ) {
    service.change(
      for: Fixture.email,
      .init(
        id: UUID().uuidString.lowercased(), entity: "list", operation: operation,
        entityId: id.uuidString.lowercased(), baseVersion: 1, fields: fields))
  }

  private func listKey(_ id: UUID) -> String { "list:\(id.uuidString.lowercased())" }

  private func wordKey(_ list: UUID, _ item: String) -> String {
    "listWord:\(list.uuidString.lowercased())/\(item)"
  }

  @Test("changes made while signed out go to the same account at their versions when it signs in")
  func signedOutChangesResume() async throws {
    let server = StubAccountServer()
    let service = FakeAccountService(on: server)
    let phone = await install(on: server)
    let favorites = phone.favorites
    let drama = try #require(phone.wordLists.createList(named: "Drama"))
    phone.markKnown(Fixture.taberu)
    phone.addMiru(to: favorites)
    try await phone.signIn()
    let cursor = phone.sync.state.cursor

    await phone.account.signOut()
    phone.clearKnown(Fixture.taberu)
    phone.wordLists.deleteList(drama.id)
    phone.wordLists.removeWord(LanguageReferenceID(rawValue: Fixture.miru), from: favorites)
    phone.wordLists.renameList(favorites, to: "Mine")
    #expect(phone.sync.state.queue.map(\.operation) == ["clear", "delete", "remove", "update"])
    #expect(phone.sync.state.queue.allSatisfy { $0.baseVersion == 1 })
    #expect(phone.server.requests(to: "POST /v1/sync").count == 1)

    await phone.launch()
    try await phone.signIn()

    let resumed = try #require(phone.server.requests(to: "POST /v1/sync").last?.sync)
    #expect(resumed.cursor == cursor)
    #expect(!resumed.mutations.contains { $0.operation == "create" || $0.operation == "add" })
    let email = Fixture.email
    #expect(service.data(of: "knownWord:\(Fixture.taberu)", for: email)?["known"] as? Bool == false)
    #expect(service.data(of: listKey(drama.id), for: email) == nil)
    #expect(service.data(of: wordKey(favorites, Fixture.miru), for: email) == nil)
    #expect(service.data(of: listKey(favorites), for: email)?["name"] as? String == "Mine")
    #expect(phone.wordLists.lists.map(\.name) == ["Mine"])
    #expect(phone.sync.state.queue.isEmpty)
  }

  @Test("a change made elsewhere while signed out wins over this phone's older one")
  func signedOutChangeConflicts() async throws {
    let (service, phone, _) = try await signedInPhone()
    let favorites = phone.favorites
    await phone.account.signOut()
    phone.wordLists.renameList(favorites, to: "Mine")
    changeElsewhere(service, list: favorites, "update", fields: ["name": .string("Theirs")])

    try await phone.signIn()

    let resumed = try #require(phone.server.requests(to: "POST /v1/sync").last?.sync)
    #expect(resumed.mutations.map(\.operation) == ["update"])
    #expect(resumed.mutations.first?.baseVersion == 1)
    #expect(phone.wordLists.lists.map(\.name) == ["Theirs"])
  }

  @Test("signing in to another account drops the kept changes and sends the phone at version 0")
  func anotherAccountStartsOver() async throws {
    let server = StubAccountServer()
    let service = FakeAccountService(on: server)
    let phone = await install(on: server)
    phone.markKnown(Fixture.taberu)
    try await phone.signIn()
    await phone.account.signOut()
    phone.clearKnown(Fixture.taberu)
    phone.markKnown(Fixture.miru, headword: "見る")

    try await phone.signIn(as: other)

    let first = try #require(phone.server.requests(to: "POST /v1/sync").last?.sync)
    #expect(first.cursor == nil)
    #expect(first.mutations.allSatisfy { $0.baseVersion == 0 })
    #expect(service.liveKeys(for: other, entity: "knownWord") == ["knownWord:\(Fixture.miru)"])
    #expect(
      service.data(of: "knownWord:\(Fixture.taberu)", for: Fixture.email)?["known"] as? Bool == true
    )
    #expect(phone.sync.account?.userID == service.userID(for: other))
  }

  @Test("after deleting the account, nothing is kept or queued, and signing in starts over")
  func deletedAccountKeepsNothing() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.markKnown(Fixture.taberu)
    try await fixture.account.confirmIdentity(email: Fixture.email, code: "654321")
    try await fixture.account.deleteAccount(appleAuthorizationCode: nil)
    fixture.clearKnown(Fixture.taberu)

    #expect(fixture.sync.state == AccountSyncState())
    try await fixture.signIn()
    let first = try #require(fixture.server.requests(to: "POST /v1/sync").last?.sync)
    #expect(first.cursor == nil)
    #expect(first.mutations.allSatisfy { $0.baseVersion == 0 })
  }

  @Test("two phones signing in to one account end with one Favorites holding both phones' words")
  func twoPhonesShareFavorites() async throws {
    let server = StubAccountServer()
    let service = FakeAccountService(on: server)
    let first = await install(on: server)
    let second = await install(on: server)
    #expect(first.favorites == WordLists.favoritesID && second.favorites == WordLists.favoritesID)
    first.markKnown(Fixture.taberu)
    first.wordLists.addWord(
      LanguageReferenceID(rawValue: Fixture.taberu), headword: "食べる", reading: "たべる",
      to: first.favorites)
    second.addMiru(to: second.favorites)
    second.markMany(60)

    try await first.signIn()
    first.wordLists.renameList(WordLists.favoritesID, to: "Shared")
    try await first.syncNow()
    try await second.signIn()
    try await first.syncNow()

    let both = Set([Fixture.taberu, Fixture.miru])
    for phone in [first, second] {
      #expect(phone.wordLists.lists.map(\.name) == ["Shared"])
      #expect(phone.wordLists.lists.map(\.id) == [WordLists.favoritesID])
      #expect(Set(phone.wordLists.words(in: WordLists.favoritesID).map(\.entryID)) == both)
    }
    second.wordLists.renameList(WordLists.favoritesID, to: "Ours")
    try await second.syncNow()
    #expect(second.wordLists.lists.map(\.name) == ["Ours"])
    #expect(
      service.data(of: listKey(WordLists.favoritesID), for: Fixture.email)?["name"] as? String
        == "Ours")
    #expect(
      service.liveKeys(for: Fixture.email, entity: "list") == [listKey(WordLists.favoritesID)])
  }

  @Test("an install's Favorites moves to the shared ID before its first upload")
  func olderFavoritesMoves() async throws {
    let fixture = Fixture()
    fixture.serve()
    let older = UUID()
    let file = """
      {"version":2,"lists":[{"id":"\(older.uuidString)","name":"Favorites","position":0,\
      "createdAt":1700000000000,"updatedAt":1700000000000}],"memberships":[{"listID":\
      "\(older.uuidString)","entryID":"\(Fixture.miru)","headword":"見る","reading":"みる",\
      "addedAt":1700000001000}]}
      """
    try FileManager.default.createDirectory(
      at: fixture.directory, withIntermediateDirectories: true)
    try Data(file.utf8).write(to: fixture.directory.appending(path: "word-lists.json"))
    await fixture.launch()
    #expect(fixture.favorites == older)

    try await fixture.signIn()

    #expect(fixture.wordLists.lists.map(\.id) == [WordLists.favoritesID])
    #expect(fixture.wordLists.words(in: WordLists.favoritesID).map(\.entryID) == [Fixture.miru])
    let sent = try #require(fixture.server.requests(to: "POST /v1/sync").first?.sync)
    #expect(sent.mutations.map(\.entityId).contains(WordLists.favoritesID.uuidString.lowercased()))
    #expect(!sent.mutations.map(\.entityId).contains(older.uuidString.lowercased()))
  }

  @Test("if the account deleted Favorites, a phone signing in keeps its Favorites as a new list")
  func deletedFavoritesKeepsThePhonesWords() async throws {
    let server = StubAccountServer()
    let service = FakeAccountService(on: server)
    let first = await install(on: server)
    try await first.signIn()
    first.wordLists.deleteList(WordLists.favoritesID)
    try await first.syncNow()
    let second = await install(on: server)
    second.addMiru(to: second.favorites)
    second.markMany(60)

    try await second.signIn()

    let kept = try #require(second.wordLists.lists.first)
    #expect(second.wordLists.lists.count == 1)
    #expect(kept.id != WordLists.favoritesID && kept.name == "Favorites")
    #expect(second.wordLists.currentID(of: WordLists.favoritesID) == kept.id)
    #expect(second.wordLists.words(in: kept.id).map(\.entryID) == [Fixture.miru])
    #expect(service.liveKeys(for: Fixture.email, entity: "list") == [listKey(kept.id)])
    #expect(service.data(of: wordKey(kept.id, Fixture.miru), for: Fixture.email) != nil)
  }

  @Test("any other list the account deleted is deleted here when this phone signs in again")
  func otherDeletedListsGo() async throws {
    let (service, phone, lists) = try await signedInPhone(with: ["Drama"])
    let drama = try #require(lists.first)
    await phone.account.signOut()
    changeElsewhere(service, list: drama.id, "delete")
    try await phone.signIn(as: other)
    await phone.account.signOut()

    try await phone.signIn()

    #expect(!phone.wordLists.hasList(drama.id))
    #expect(phone.wordLists.lists.map(\.id) == [WordLists.favoritesID])
    #expect(
      service.liveKeys(for: Fixture.email, entity: "list") == [listKey(WordLists.favoritesID)])
  }

  @Test("while signed out, each word and list queues as one change, which goes on sign-in")
  func signedOutQueueStaysSmall() async throws {
    let (service, phone, _) = try await signedInPhone()
    let favorites = phone.favorites
    await phone.account.signOut()
    let miru = LanguageReferenceID(rawValue: Fixture.miru)
    for round in 0..<3 {
      phone.markKnown(Fixture.taberu)
      phone.clearKnown(Fixture.taberu)
      phone.addMiru(to: favorites)
      phone.wordLists.removeWord(miru, from: favorites)
      phone.wordLists.renameList(favorites, to: "Mine \(round)")
    }
    let drama = try #require(phone.wordLists.createList(named: "Drama"))
    phone.wordLists.renameList(drama.id, to: "Drama S2")
    phone.addMiru(to: drama.id)

    #expect(
      phone.queuedOperations == [
        "list update \(favorites.uuidString.lowercased())",
        "knownWord clear \(Fixture.taberu)",
        "listWord remove \(favorites.uuidString.lowercased())/\(Fixture.miru)",
        "list create \(drama.id.uuidString.lowercased())",
        "listWord add \(drama.id.uuidString.lowercased())/\(Fixture.miru)",
      ])
    try await phone.signIn()

    let email = Fixture.email
    #expect(service.data(of: listKey(favorites), for: email)?["name"] as? String == "Mine 2")
    #expect(service.data(of: listKey(drama.id), for: email)?["name"] as? String == "Drama S2")
    #expect(service.data(of: wordKey(drama.id, Fixture.miru), for: email) != nil)
    #expect(service.data(of: wordKey(favorites, Fixture.miru), for: email) == nil)
    #expect(phone.sync.state.queue.isEmpty)
  }

  @Test("while signed out, deleting a renamed list queues only the delete")
  func signedOutDeleteReplacesRename() async throws {
    let (service, phone, lists) = try await signedInPhone(with: ["Old"])
    let old = try #require(lists.first)
    await phone.account.signOut()
    phone.wordLists.renameList(old.id, to: "Older")
    phone.wordLists.deleteList(old.id)

    #expect(phone.queuedOperations == ["list delete \(old.id.uuidString.lowercased())"])
    try await phone.signIn()
    #expect(service.data(of: listKey(old.id), for: Fixture.email) == nil)
  }

  @Test("a change that settles nothing still takes the account's copy it held back")
  func heldCopyAfterANoOp() async throws {
    let (service, phone, lists) = try await signedInPhone(with: ["Drama"])
    let drama = try #require(lists.first)
    changeElsewhere(service, list: drama.id, "update", fields: ["position": .number(0)])
    phone.wordLists.renameList(drama.id, to: "Mine")
    phone.wordLists.moveLists(fromOffsets: [1], toOffset: 0)

    try await phone.syncNow()

    #expect(phone.wordLists.lists.first { $0.id == drama.id }?.name == "Drama")
    #expect(service.data(of: listKey(drama.id), for: Fixture.email)?["name"] as? String == "Drama")
  }

  @Test("two phones show lists that share a place in the same order, by the account's dates and IDs")
  func listsSharingAPlaceKeepOneOrder() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    let drama = try #require(phone.wordLists.createList(named: "Drama"))
    try await phone.signIn()
    changeElsewhere(service, list: drama.id, "update", fields: ["position": .number(0)])
    try await pad.signIn()
    try await phone.syncNow()

    let accountDate = try #require(
      try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(
        "2026-10-06T10:00:00.000Z"))
    #expect(phone.wordLists.lists.map(\.position) == [0, 0])
    #expect(phone.wordLists.lists.map(\.id) == pad.wordLists.lists.map(\.id))
    #expect(phone.wordLists.lists.allSatisfy { $0.createdAt == accountDate })
    #expect(pad.wordLists.lists.allSatisfy { $0.createdAt == accountDate })
  }
}
