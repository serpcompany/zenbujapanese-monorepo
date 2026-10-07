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
    let server = StubAccountServer()
    let service = FakeAccountService(on: server)
    let phone = await install(on: server)
    let favorites = phone.favorites
    try await phone.signIn()
    await phone.account.signOut()
    phone.wordLists.renameList(favorites, to: "Mine")
    service.change(
      for: Fixture.email,
      .init(
        id: "elsewhere-1", entity: "list", operation: "update",
        entityId: favorites.uuidString.lowercased(), baseVersion: 1,
        fields: ["name": .string("Theirs")]))

    try await phone.signIn()

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

    try await first.signIn()
    try await second.signIn()
    try await first.syncNow()

    let both = Set([Fixture.taberu, Fixture.miru])
    for phone in [first, second] {
      #expect(phone.wordLists.lists.map(\.id) == [WordLists.favoritesID])
      #expect(Set(phone.wordLists.words(in: WordLists.favoritesID).map(\.entryID)) == both)
    }
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

    try await second.signIn()

    let kept = try #require(second.wordLists.lists.first)
    #expect(second.wordLists.lists.count == 1)
    #expect(kept.id != WordLists.favoritesID && kept.name == "Favorites")
    #expect(second.wordLists.words(in: kept.id).map(\.entryID) == [Fixture.miru])
    #expect(service.liveKeys(for: Fixture.email, entity: "list") == [listKey(kept.id)])
    #expect(service.data(of: wordKey(kept.id, Fixture.miru), for: Fixture.email) != nil)
  }
}
