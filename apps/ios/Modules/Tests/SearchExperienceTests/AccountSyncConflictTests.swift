import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: conflicts and rejections")
struct AccountSyncConflictTests {
  private typealias Fixture = AccountFixture

  private func signedIn() async throws -> Fixture {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    return fixture
  }

  private func answerFirst(
    _ fixture: Fixture, with result: @escaping @Sendable (StubSyncRequest.Mutation) -> [String: Any]
  ) {
    fixture.serve { request in
      guard let first = request.mutations.first else { return StubSync.answer(cursor: "c") }
      let rest: [[String: Any]] = request.mutations.dropFirst().map {
        ["id": $0.id, "status": "applied", "version": 1]
      }
      return StubSync.answer(results: [result(first)] + rest, cursor: "c")
    }
  }

  @Test("a known word that changed elsewhere first takes the account's copy")
  func knownWordConflict() async throws {
    let fixture = try await signedIn()
    fixture.markKnown(Fixture.taberu)
    answerFirst(fixture) {
      StubSync.conflict($0.id, StubSync.knownWord(Fixture.taberu, known: false, version: 3))
    }
    try await fixture.syncNow()

    #expect(!fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.sync.state.versions["knownWord:\(Fixture.taberu)"] == 3)

    fixture.markKnown(Fixture.taberu)
    #expect(fixture.sync.state.queue.last?.baseVersion == 3)
  }

  @Test("a rejected known word goes back to how it was")
  func knownWordRejected() async throws {
    let fixture = try await signedIn()
    fixture.markKnown(Fixture.taberu)
    answerFirst(fixture) { StubSync.rejected($0.id, "invalid_mutation") }
    try await fixture.syncNow()
    #expect(!fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
  }

  @Test("a rename that lost to another takes the list's name as it is now")
  func listConflict() async throws {
    let fixture = try await signedIn()
    let favorites = fixture.favorites
    fixture.wordLists.renameList(favorites, to: "Mine")
    #expect(fixture.sync.state.queue.first?.fields == ["name": .string("Mine")])
    #expect(fixture.sync.state.queue.first?.baseVersion == 1)
    answerFirst(fixture) {
      StubSync.conflict($0.id, StubSync.list(favorites, name: "Theirs", version: 2))
    }
    try await fixture.syncNow()
    #expect(fixture.wordLists.lists.first { $0.id == favorites }?.name == "Theirs")
  }

  @Test("a rejected list is removed, and a rejected rename is undone")
  func listRejected() async throws {
    let fixture = try await signedIn()
    let anime = try #require(fixture.wordLists.createList(named: "Anime"))
    answerFirst(fixture) { StubSync.rejected($0.id, "too_many_lists") }
    try await fixture.syncNow()
    #expect(!fixture.wordLists.hasList(anime.id))

    fixture.wordLists.renameList(fixture.favorites, to: "Mine")
    answerFirst(fixture) { StubSync.rejected($0.id, "invalid_fields") }
    try await fixture.syncNow()
    #expect(fixture.wordLists.lists.first?.name == "Favorites")
  }

  @Test("a list deleted elsewhere is dropped with its words")
  func listDeletedElsewhere() async throws {
    let fixture = try await signedIn()
    let favorites = fixture.favorites
    fixture.addMiru(to: favorites)
    try await fixture.syncNow()
    let listID = favorites.uuidString.lowercased()
    fixture.serve { _ in
      StubSync.answer(changes: [StubSync.gone("list", listID, version: 3)], cursor: "c2")
    }
    try await fixture.syncNow()

    #expect(!fixture.wordLists.hasList(favorites))
    #expect(fixture.wordLists.words(in: favorites).isEmpty)
    #expect(fixture.sync.state.versions["listWord:\(listID)/\(Fixture.miru)"] == nil)
  }

  @Test("deleting a list here sends one delete, and its words go with it")
  func listDeletedHere() async throws {
    let fixture = try await signedIn()
    let favorites = fixture.favorites
    fixture.addMiru(to: favorites)
    fixture.wordLists.deleteList(favorites)
    #expect(fixture.queuedOperations.last == "list delete \(favorites.uuidString.lowercased())")
    try await fixture.syncNow()
    #expect(fixture.wordLists.lists.isEmpty)
  }

  @Test("a word added to a list that's gone is taken back out")
  func listWordRejected() async throws {
    let fixture = try await signedIn()
    let favorites = fixture.favorites
    fixture.addMiru(to: favorites)
    answerFirst(fixture) { StubSync.rejected($0.id, "unknown_list") }
    try await fixture.syncNow()
    #expect(fixture.wordLists.words(in: favorites).isEmpty)
  }

  @Test("removing a word someone else added again keeps it")
  func listWordRemoveConflict() async throws {
    let fixture = try await signedIn()
    let favorites = fixture.favorites
    fixture.addMiru(to: favorites)
    try await fixture.syncNow()
    fixture.wordLists.removeWord(LanguageReferenceID(rawValue: Fixture.miru), from: favorites)
    #expect(fixture.sync.state.queue.first?.baseVersion == 1)
    answerFirst(fixture) {
      StubSync.conflict($0.id, StubSync.listWord(favorites, Fixture.miru, version: 3))
    }
    try await fixture.syncNow()
    #expect(fixture.wordLists.words(in: favorites).map(\.entryID) == [Fixture.miru])
  }

  @Test("the account's copy doesn't overwrite a change still waiting to be sent")
  func queuedChangeWins() async throws {
    let fixture = try await signedIn()
    let calls = CallCount()
    fixture.serve { request in
      guard calls.next() == 1 else { return .offline }
      return StubSync.answer(
        results: StubSync.applied(request, version: 5),
        changes: [
          StubSync.knownWord(Fixture.taberu, known: true, version: 5),
          StubSync.knownWord(Fixture.miru, known: true, version: 2),
        ],
        cursor: "c")
    }
    fixture.markKnown(Fixture.taberu)
    fixture.clearKnown(Fixture.taberu)

    await #expect(throws: AccountServiceError.unreachable) { try await fixture.syncNow() }

    #expect(!fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.miru))
    #expect(fixture.queuedOperations == ["knownWord clear \(Fixture.taberu)"])
    #expect(fixture.sync.state.queue.first?.baseVersion == 5)
  }

  @Test("signing in again keeps lists the account already has")
  func uploadsAreNeverUndone() async throws {
    let fixture = Fixture()
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map { StubSync.rejected($0.id, "already_exists") },
        cursor: "c")
    }
    await fixture.launch()
    try await fixture.signIn()
    #expect(fixture.wordLists.lists.map(\.name) == ["Favorites"])
  }
}
