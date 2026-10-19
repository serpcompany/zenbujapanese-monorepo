import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: waits and recovery")
struct AccountSyncRecoveryTests {
  private typealias Fixture = AccountFixture

  @Test("a list word held for its list survives a sync that stops after the first page")
  func heldWordsSurviveAnInterruptedSync() async throws {
    let fixture = Fixture()
    let drama = UUID()
    let calls = CallCount()
    fixture.serve { request in
      switch calls.next() {
      case 1:
        StubSync.answer(
          results: StubSync.applied(request),
          changes: [StubSync.listWord(drama, Fixture.miru, version: 1)], cursor: "page-1",
          hasMore: true)
      case 2: .offline
      default:
        StubSync.answer(
          changes: [StubSync.list(drama, name: "Drama", version: 1)], cursor: "page-2")
      }
    }
    await fixture.launch()
    try await fixture.signIn()
    fixture.account.scheduler.stop()
    #expect(fixture.sync.state.cursor == "page-1")
    #expect(fixture.sync.state.heldWords.map(\.key.listWordParts?.storedID) == [Fixture.miru])

    await fixture.launch()
    try await fixture.syncNow()

    #expect(fixture.server.requests(to: "POST /v1/sync").last?.sync.cursor == "page-1")
    #expect(fixture.wordLists.words(in: drama).map(\.entryID) == [Fixture.miru])
    #expect(fixture.sync.state.heldWords.isEmpty)
  }

  @Test("a device away past what the account forgot reads everything again and drops what's gone, keeping what it wrote meanwhile")
  func rereadDropsWhatTheAccountForgot() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    let taberu = SavedItemID(rawValue: Fixture.taberu)
    let deleted = UUID().uuidString.lowercased()
    try await phone.signIn()
    await phone.notes.save(LearnerWordNote(id: deleted, text: "朝"), for: taberu)
    await phone.notes.save(LearnerWordNote(text: "夜"), for: taberu)
    try await phone.syncNow()
    try await pad.signIn()
    await phone.notes.save(LearnerWordNote(id: deleted, text: ""), for: taberu)
    try await phone.syncNow()
    service.forget("wordNote:\(deleted)", for: Fixture.email)
    await pad.notes.save(LearnerWordNote(text: "昼"), for: taberu)

    try await pad.syncNow()

    #expect(Set(await pad.notes.load(taberu).map(\.text)) == ["夜", "昼"])
    #expect(pad.sync.state.versions["wordNote:\(deleted)"] == nil)
    #expect(pad.sync.state.rereadSeen == nil)
    try await phone.syncNow()
    #expect(Set(await phone.notes.load(taberu).map(\.text)) == ["夜", "昼"])
  }

  @Test("a re-read after a 410 that stops partway drops nothing until it reaches its end, across a relaunch")
  func rereadCutOff() async throws {
    let fixture = Fixture()
    fixture.serve { request in
      StubSync.answer(
        results: StubSync.applied(request),
        changes: [
          StubSync.knownWord(Fixture.taberu, known: true, version: 1),
          StubSync.knownWord(Fixture.miru, known: true, version: 1),
        ], cursor: "cursor-1")
    }
    await fixture.launch()
    try await fixture.signIn()
    let calls = CallCount()
    fixture.serve { request in
      switch request.cursor {
      case "cursor-1": .error(410, "invalid_cursor")
      case nil:
        StubSync.answer(
          results: StubSync.applied(request),
          changes: [StubSync.knownWord(Fixture.miru, known: true, version: 1)], cursor: "page-1",
          hasMore: true)
      default: calls.next() == 1 ? .offline : StubSync.answer(cursor: "page-2")
      }
    }

    await #expect(throws: (any Error).self) { try await fixture.syncNow() }
    #expect(fixture.sync.state.cursor == "page-1")
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    fixture.account.scheduler.stop()
    await fixture.launch()
    try await fixture.syncNow()

    #expect(!fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.miru))
    #expect(fixture.sync.state.versions["knownWord:\(Fixture.taberu)"] == nil)
    #expect(fixture.sync.state.rereadSeen == nil)
  }

  @Test("after a 429, nothing syncs before Retry-After, not even Sync Now")
  func retryAfterHolds() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    fixture.serve { _ in .error(429, "too_many_requests", headers: ["Retry-After": "120"]) }
    fixture.markKnown(Fixture.taberu)

    await fixture.account.scheduler.refresh()
    let sent = fixture.server.requests(to: "POST /v1/sync").count
    #expect(
      fixture.account.scheduler.remainingWait(atLeast: AccountSyncScheduler.afterLocalChange) == 120
    )

    await fixture.account.scheduler.refresh()
    #expect(fixture.server.requests(to: "POST /v1/sync").count == sent)
    fixture.account.scheduler.stop()
  }

  @Test("after a server error, changes wait out the backoff, but Sync Now tries at once")
  func backoffHoldsUntilAsked() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    fixture.serve { _ in .error(503, "unavailable") }
    fixture.markKnown(Fixture.taberu)

    await fixture.account.scheduler.refresh()
    let sent = fixture.server.requests(to: "POST /v1/sync").count
    #expect(fixture.account.scheduler.remainingWait(atLeast: 0) >= SyncRetry.firstDelay / 2)

    await fixture.account.scheduler.refresh()
    #expect(fixture.server.requests(to: "POST /v1/sync").count == sent + 1)
    fixture.account.scheduler.stop()
  }

  @Test("a request stays under the service's 64 KB body limit")
  func requestsStaySmall() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    for number in 0..<60 {
      fixture.wordLists.createList(named: "\(number)" + String(repeating: "語", count: 495))
    }
    try await fixture.signIn()

    let bodies = fixture.server.requests(to: "POST /v1/sync").map(\.body)
    #expect(bodies.count >= 2)
    #expect(bodies.allSatisfy { $0.count < 64 * 1024 })
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("a deletion whose answer was lost is finished once the account is gone")
  func lostDeletionAnswer() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    fixture.markKnown(Fixture.taberu)
    try await fixture.signIn()
    fixture.server.respond { request in
      request.route == "DELETE /v1/me" ? .offline : .error(401, "unauthorized")
    }

    try await fixture.account.deleteAccount(appleAuthorizationCode: nil)

    #expect(fixture.sync.account == nil)
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
  }

  @Test("signing in again to delete ends the session it replaces")
  func reauthenticationEndsTheEarlierSession() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.answerNextSignIn(as: Fixture.userID, sessionToken: "session-2.signed")

    try await fixture.account.confirmIdentity(email: Fixture.email, code: "222222")

    #expect(fixture.storage.read() == "session-2.signed")
    let signOut = try #require(fixture.server.requests(to: "POST /v1/auth/sign-out").last)
    #expect(signOut.header("Authorization") == "Bearer \(Fixture.sessionToken)")
  }
}
