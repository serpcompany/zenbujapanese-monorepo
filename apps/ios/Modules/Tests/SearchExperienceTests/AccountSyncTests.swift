import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: queue, cursor, and order")
struct AccountSyncTests {
  private typealias Fixture = AccountFixture

  @Test("the first sync after signing in uploads the phone's words and lists at version 0")
  func firstSyncUploads() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    fixture.markKnown(Fixture.taberu)
    let anime = try #require(fixture.wordLists.createList(named: "Anime"))
    fixture.addMiru(to: anime.id)

    try await fixture.signIn()

    let sent = try #require(fixture.server.requests(to: "POST /v1/sync").first?.sync)
    let favorites = fixture.favorites.uuidString.lowercased()
    let animeID = anime.id.uuidString.lowercased()
    #expect(sent.cursor == nil)
    #expect(
      sent.mutations.map { "\($0.entity) \($0.operation) \($0.entityId)" } == [
        "knownWord mark \(Fixture.taberu)", "list create \(favorites)", "list create \(animeID)",
        "listWord add \(animeID)/\(Fixture.miru)",
      ])
    #expect(sent.mutations.allSatisfy { $0.baseVersion == 0 })
    #expect(sent.mutations[2].fields == ["name": .string("Anime"), "position": .number(1)])
    #expect(sent.mutations[3].fields == ["headword": .string("見る"), "reading": .string("みる")])
    #expect(fixture.sync.state.queue.isEmpty)
    #expect(fixture.sync.state.cursor == "cursor-1")
    #expect(fixture.sync.lastSyncedAt == fixture.now)
  }

  @Test("changes are queued with their base versions, and the queue and cursor survive a relaunch")
  func queueSurvivesRelaunch() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    fixture.markKnown(Fixture.taberu)
    try await fixture.signIn()
    #expect(fixture.sync.state.versions["knownWord:\(Fixture.taberu)"] == 1)

    fixture.server.respond { _ in .offline }
    fixture.clearKnown(Fixture.taberu)
    fixture.markKnown(Fixture.miru, headword: "見る")
    await #expect(throws: AccountServiceError.unreachable) { try await fixture.syncNow() }
    let queued = fixture.sync.state.queue
    #expect(queued.map(\.operation) == ["clear", "mark"])
    #expect(queued.map(\.baseVersion) == [1, 0])

    await fixture.launch()
    #expect(fixture.sync.state.queue == queued)
    #expect(fixture.sync.state.cursor == "cursor-1")
    #expect(!fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))

    fixture.serve()
    try await fixture.syncNow()
    let resent = try #require(fixture.server.requests(to: "POST /v1/sync").last?.sync)
    #expect(resent.cursor == "cursor-1")
    #expect(resent.mutations.map(\.id) == queued.map(\.id))
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("an answer lost on the way is asked for again under the same mutation IDs")
  func retriesKeepMutationIDs() async throws {
    let fixture = Fixture()
    let calls = CallCount()
    fixture.serve { request in
      calls.next() == 1
        ? .error(500, "internal")
        : StubSync.answer(results: StubSync.applied(request), cursor: "cursor-1")
    }
    await fixture.launch()
    fixture.markKnown(Fixture.taberu)
    try await fixture.signIn()
    fixture.account.scheduler.stop()
    #expect(
      fixture.sync.lastFailure
        == .refused(status: 500, code: "internal", message: "internal", retryAfter: nil))
    try await fixture.syncNow()

    let syncs = fixture.server.requests(to: "POST /v1/sync").map(\.sync)
    #expect(syncs.count == 2)
    #expect(syncs[0].mutations == syncs[1].mutations)
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("two changes to one word go one at a time, the second made on the first's version")
  func oneChangePerEntityPerRequest() async throws {
    let fixture = Fixture()
    fixture.serve { request in
      let base = request.mutations.first?.baseVersion ?? 0
      return StubSync.answer(results: StubSync.applied(request, version: base + 1), cursor: "c")
    }
    await fixture.launch()
    try await fixture.signIn()
    fixture.markKnown(Fixture.taberu)
    fixture.clearKnown(Fixture.taberu)
    try await fixture.syncNow()

    let sent = fixture.server.requests(to: "POST /v1/sync").dropFirst().map(\.sync.mutations)
    #expect(sent.map { $0.map(\.operation) } == [["mark"], ["clear"]])
    #expect(sent.map { $0.map(\.baseVersion) } == [[0], [1]])
    #expect(!fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.sync.state.versions["knownWord:\(Fixture.taberu)"] == 2)
  }

  @Test("pages are read while hasMore is true, and the last cursor is kept")
  func paging() async throws {
    let fixture = Fixture()
    let list = UUID()
    fixture.serve { request in
      switch request.cursor {
      case nil:
        StubSync.answer(
          results: StubSync.applied(request),
          changes: [StubSync.knownWord(Fixture.taberu, known: true, version: 4)],
          cursor: "page-1", hasMore: true)
      default:
        StubSync.answer(changes: [StubSync.list(list, name: "Drama", version: 2)], cursor: "page-2")
      }
    }
    await fixture.launch()
    try await fixture.signIn()

    let cursors = fixture.server.requests(to: "POST /v1/sync").map(\.sync.cursor)
    #expect(cursors == [nil, "page-1"])
    #expect(fixture.sync.state.cursor == "page-2")
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.wordLists.lists.contains { $0.id == list && $0.name == "Drama" })
  }

  @Test("a list word that arrives before its list waits until the last page")
  func listWordWaitsForItsList() async throws {
    let fixture = Fixture()
    let drama = UUID()
    let gone = UUID()
    fixture.serve { request in
      switch request.cursor {
      case nil:
        StubSync.answer(
          results: StubSync.applied(request),
          changes: [
            StubSync.listWord(drama, Fixture.miru, version: 1),
            StubSync.listWord(gone, Fixture.miru, version: 1),
          ],
          cursor: "page-1", hasMore: true)
      default:
        StubSync.answer(
          changes: [StubSync.list(drama, name: "Drama", version: 1)], cursor: "page-2")
      }
    }
    await fixture.launch()
    try await fixture.signIn()

    #expect(fixture.wordLists.words(in: drama).map(\.entryID) == [Fixture.miru])
    #expect(!fixture.wordLists.hasList(gone))
    #expect(
      fixture.sync.state.versions["listWord:\(drama.uuidString.lowercased())/\(Fixture.miru)"] == 1)
  }

  @Test("410 drops the cursor and reads everything again, still sending the queue")
  func invalidCursor() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    fixture.serve { request in
      request.cursor == "cursor-1"
        ? .error(410, "invalid_cursor")
        : StubSync.answer(
          results: StubSync.applied(request),
          changes: [StubSync.knownWord(Fixture.miru, known: true, version: 9)], cursor: "fresh")
    }
    fixture.markKnown(Fixture.taberu)
    try await fixture.syncNow()

    let syncs = fixture.server.requests(to: "POST /v1/sync").suffix(2).map(\.sync)
    #expect(syncs.map(\.cursor) == ["cursor-1", nil])
    #expect(syncs.map { $0.mutations.map(\.entityId) } == [[Fixture.taberu], [Fixture.taberu]])
    #expect(syncs[0].mutations == syncs[1].mutations)
    #expect(fixture.sync.state.cursor == "fresh")
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.miru))
  }

  @Test("429 keeps the queue and waits as long as Retry-After says")
  func tooManyRequests() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    fixture.serve { _ in .error(429, "too_many_requests", headers: ["Retry-After": "7"]) }
    fixture.markKnown(Fixture.taberu)

    var failure: Error?
    do { try await fixture.syncNow() } catch { failure = error }

    #expect(
      failure as? AccountServiceError
        == .refused(
          status: 429, code: "too_many_requests", message: "too_many_requests", retryAfter: 7))
    #expect(fixture.sync.state.queue.count == 1)
    #expect(SyncRetry.delay(after: try #require(failure), failures: 3) == 7)
  }

  @Test("network failures and 5xx back off exponentially, with jitter, then stop")
  func backoff() {
    let top = { (range: ClosedRange<Double>) in range.upperBound }
    let bottom = { (range: ClosedRange<Double>) in range.lowerBound }
    let offline = AccountServiceError.unreachable
    #expect(SyncRetry.delay(after: offline, failures: 0, jitter: top) == 2)
    #expect(SyncRetry.delay(after: offline, failures: 3, jitter: top) == 16)
    #expect(SyncRetry.delay(after: offline, failures: 3, jitter: bottom) == 8)
    #expect(SyncRetry.delay(after: offline, failures: 7, jitter: top) == 256)
    #expect(SyncRetry.delay(after: offline, failures: 8, jitter: top) == 300)
    #expect(SyncRetry.delay(after: CancellationError(), failures: 0, jitter: top) == nil)
    let busy = AccountServiceError.refused(status: 503, code: "x", message: "x", retryAfter: nil)
    #expect(SyncRetry.delay(after: busy, failures: 1, jitter: top) == 4)
    let bad = AccountServiceError.refused(
      status: 400, code: "bad_request", message: "", retryAfter: nil)
    #expect(SyncRetry.delay(after: bad, failures: 0, jitter: top) == nil)
  }

  @Test("syncing is due on launch with queued changes or after 15 minutes")
  func dueness() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    #expect(!fixture.sync.isDue(staleAfter: AccountSyncScheduler.staleAfter))
    try await fixture.signIn()
    #expect(!fixture.sync.isDue(staleAfter: AccountSyncScheduler.staleAfter))
    fixture.now += 16 * 60
    #expect(fixture.sync.isDue(staleAfter: AccountSyncScheduler.staleAfter))
    fixture.now -= 16 * 60
    fixture.markKnown(Fixture.taberu)
    #expect(fixture.sync.isDue(staleAfter: AccountSyncScheduler.staleAfter))
  }

  @Test("signing out forgets the session, keeps the phone's data, and keeps queuing changes")
  func signOutKeepsData() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    fixture.markKnown(Fixture.taberu)

    await fixture.account.signOut()
    await fixture.settle()

    let signOut = try #require(fixture.server.requests(to: "POST /v1/auth/sign-out").first)
    #expect(signOut.header("Authorization") == "Bearer \(Fixture.sessionToken)")
    #expect(fixture.sync.account == nil)
    #expect(fixture.sync.state.signedOutFrom?.userID == Fixture.userID)
    #expect(fixture.sync.state.cursor == "cursor-1")
    #expect(fixture.storage.read() == nil)
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.wordLists.lists.count == 1)
    fixture.markKnown(Fixture.miru)
    #expect(fixture.queuedOperations.last == "knownWord mark \(Fixture.miru)")

    await fixture.launch()
    #expect(fixture.sync.account == nil)
    #expect(fixture.sync.state.queue.count == 2)
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.miru))
  }

  @Test("deleting the account after signing in again signs out and keeps the phone's data")
  func deleteKeepsData() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    fixture.markKnown(Fixture.taberu)
    try await fixture.signIn()

    #expect(try await fixture.account.signInMethods() == ["email"])
    try await fixture.account.confirmIdentity(email: Fixture.email, code: "654321")
    try await fixture.account.deleteAccount(appleAuthorizationCode: nil)
    await fixture.settle()

    let deletion = try #require(fixture.server.requests(to: "DELETE /v1/me").first)
    #expect(deletion.json["confirm"] as? Bool == true)
    #expect(deletion.json["appleAuthorizationCode"] == nil)
    #expect(deletion.header("Authorization")?.hasPrefix("Bearer ey") == true)
    #expect(fixture.sync.account == nil)
    #expect(fixture.storage.read() == nil)
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.wordLists.lists.count == 1)
  }

  @Test("signing in again as another account doesn't delete, and that session is signed out")
  func deleteNeedsTheSameAccount() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.answerNextSignIn(as: "someone-else", sessionToken: "other")

    await #expect(throws: AccountServiceError.differentAccount) {
      try await fixture.account.confirmIdentity(email: "other@example.com", code: "111111")
    }

    #expect(
      fixture.server.requests(to: "POST /v1/auth/sign-out").last?.header("Authorization")
        == "Bearer other")
    #expect(fixture.storage.read() == Fixture.sessionToken)
    #expect(fixture.server.requests(to: "DELETE /v1/me").isEmpty)
  }

  @Test("a refused deletion deletes nothing and keeps the learner signed in")
  func refusedDeletion() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    let token = StubTokens.access(expiresAt: fixture.now + 900)
    fixture.server.respond { request in
      request.route == "GET /v1/auth/token"
        ? .json(200, ["token": token]) : .error(400, "apple_account_mismatch")
    }

    await #expect(throws: (any Error).self) {
      try await fixture.account.deleteAccount(appleAuthorizationCode: "apple-code")
    }
    let deletion = try #require(fixture.server.requests(to: "DELETE /v1/me").first)
    #expect(deletion.json["appleAuthorizationCode"] as? String == "apple-code")
    #expect(fixture.sync.account != nil)
    #expect(fixture.storage.read() == Fixture.sessionToken)
  }
}
