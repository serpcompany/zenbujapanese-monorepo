import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account subscription: accounts, relaunches, and sync", .timeLimit(.minutes(1)))
struct AccountSubscriptionStateTests {
  typealias Answers = SubscriptionAnswers

  @Test func keepsTheSubscriptionForTheAccountItWasReadForOnly() async throws {
    let none = StubReply.json(200, Answers.answer())
    let fixture = try await Answers.signedIn { _ in none }
    let current = try #require(fixture.account.subscription.current)
    #expect(current.status == .none)
    #expect(current.appAccountToken == Answers.token)
    #expect(fixture.account.syncNeedsSubscription)

    await fixture.account.subscription.flush()
    await fixture.launch()
    await fixture.account.subscription.flush()
    #expect(fixture.account.subscription.current?.cloudAccess == .subscriptionRequired)

    await fixture.account.signOut()
    #expect(fixture.account.subscription.current == nil)
    #expect(!fixture.account.syncNeedsSubscription)
    fixture.answerNextSignIn(as: "learner-2", sessionToken: "session-2.signed")
    try await fixture.signIn(as: "second@example.com")
    #expect(fixture.account.subscription.current == nil)
  }

  @Test func forgetsAnotherAccountsNoteOnSigningOut() async throws {
    let fixture = try await Answers.signedIn(
      answeringPurchases: .error(409, "subscription_belongs_to_another_account"))
    await fixture.account.subscription.subscribe(to: Answers.monthly)
    #expect(fixture.account.subscription.problem == .anotherAccount)

    await fixture.account.signOut()

    #expect(fixture.account.subscription.problem == nil)
  }

  @Test func keepsAskToBuysNoteAcrossARelaunch() async throws {
    let fixture = try await Answers.waitingForApproval()
    await fixture.account.subscription.flush()

    await fixture.launch()
    await fixture.account.subscription.flush()

    #expect(fixture.account.subscription.problem == .pendingApproval)
  }

  @Test func dropsAnAnswerThatComesAfterTheLearnerSignedInToAnotherAccount() async throws {
    let server = StubAccountServer()
    let signedIn = SignedInBox("learner-1")
    let subscribed = StubReply.json(200, Answers.subscribed())
    let token = StubTokens.access(expiresAt: Date().addingTimeInterval(15 * 60))
    server.respond { request in
      switch request.route {
      case "GET /v1/auth/token": return .json(200, ["token": token])
      case "GET /v1/me/subscription":
        signedIn.switchTo("learner-2")
        return subscribed
      default: return .error(404, "not_found")
      }
    }
    let subscription = await Answers.standing(on: server, as: { signedIn.current })

    await subscription.refresh()

    #expect(server.requests(to: "GET /v1/me/subscription").count == 1)
    #expect(subscription.known == nil)
    #expect(subscription.current == nil)
  }

  @Test func keepsTheNewerAnswerWhenAnOlderReadArrivesLate() async throws {
    let reads = CallCount()
    let late = LaterReply()
    let none = StubReply.json(200, Answers.answer())
    let fixture = try await Answers.signedIn { request in
      guard request.method == "GET" else { return .json(200, Answers.subscribed()) }
      return reads.next() == 2 ? .later(late) : none
    }
    let subscription = fixture.account.subscription
    let older = Task { await subscription.refresh() }
    await late.asked()

    await subscription.subscribe(to: Answers.monthly)
    late.send(none)
    await older.value

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 1)
    #expect(subscription.current?.active == true)
    await fixture.account.scheduler.settled()
  }

  @Test func sendsNothingWhileSignedOut() async throws {
    let fixture = AccountFixture()
    fixture.serve(subscription: { _ in .json(200, Answers.subscribed()) })
    await fixture.launch()
    fixture.store.holds([FakeAppStore.signed(Answers.monthly, for: UUID())])

    await fixture.account.subscription.restore()
    await fixture.account.subscription.refresh()

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").isEmpty)
    #expect(fixture.server.requests(to: "GET /v1/me/subscription").isEmpty)
    #expect(fixture.store.finished.isEmpty)
  }

  @Test func sendsNoSyncTheServiceWouldRefuseButStillSendsTheProfile() async throws {
    let required = StubReply.json(200, Answers.answer())
    let fixture = try await Answers.signedIn { _ in required }
    let syncs = fixture.server.requests(to: "POST /v1/sync").count
    fixture.markKnown(AccountFixture.taberu)
    fixture.profile.edit(ProfileFields(name: "Kana Fan"))

    try await fixture.syncNow()

    #expect(fixture.server.requests(to: "POST /v1/sync").count == syncs)
    #expect(fixture.queuedOperations.contains("knownWord set \(AccountFixture.taberu)"))
    let patched = try #require(fixture.server.requests(to: "PATCH /v1/me").last)
    #expect(patched.json["name"] as? String == "Kana Fan")
    #expect(patched.json["baseVersion"] as? Int == 1)
    #expect(!fixture.queuedOperations.contains { $0.hasPrefix("profile") })
  }

  @Test func syncsAgainOnceTheSubscriptionAllowsIt() async throws {
    let reads = CallCount()
    let required = StubReply.json(200, Answers.answer())
    let free = StubReply.json(200, Answers.answer(cloudAccess: "free"))
    let fixture = try await Answers.signedIn { _ in reads.next() == 1 ? required : free }
    let syncs = fixture.server.requests(to: "POST /v1/sync").count
    fixture.markKnown(AccountFixture.taberu)

    await fixture.account.subscription.refresh()
    await fixture.account.scheduler.settled()

    #expect(fixture.server.requests(to: "POST /v1/sync").count > syncs)
  }

  @Test func readsTheSubscriptionNowAndThenWhileSyncWaitsForOne() async throws {
    let required = StubReply.json(200, Answers.answer())
    let fixture = try await Answers.signedIn { _ in required }
    let reads = { fixture.server.requests(to: "GET /v1/me/subscription").count }
    fixture.markKnown(AccountFixture.taberu)
    fixture.now += ZenbuAccount.waitingReadEvery + 1
    let before = reads()

    try await fixture.syncNow()
    await fixture.account.subscriptionWork?.value
    try await fixture.syncNow()
    await fixture.account.subscriptionWork?.value
    #expect(reads() == before + 1)

    fixture.now += ZenbuAccount.waitingReadEvery + 1
    try await fixture.syncNow()
    await fixture.account.subscriptionWork?.value
    #expect(reads() == before + 2)
  }

  @Test func syncNowReadsTheSubscriptionFirstSoAWebsitePurchaseSyncsAtOnce() async throws {
    let calls = CallCount()
    let required = StubReply.json(200, Answers.answer())
    let website = StubReply.json(200, Answers.subscribed("website"))
    let fixture = try await Answers.signedIn { _ in calls.next() <= 2 ? required : website }
    fixture.markKnown(AccountFixture.taberu)
    try await fixture.syncNow()
    await fixture.account.subscriptionWork?.value
    let syncs = fixture.server.requests(to: "POST /v1/sync").count

    await fixture.account.syncNowAsked()
    await fixture.account.scheduler.settled()

    #expect(fixture.server.requests(to: "POST /v1/sync").count > syncs)
    #expect(!fixture.queuedOperations.contains("knownWord set \(AccountFixture.taberu)"))
  }

  @Test func keepsAUsernameEditedAfterANameEditWhoseAnswerWasLost() async throws {
    let profiles = StubProfiles()
    let fixture = AccountFixture()
    let required = StubReply.json(200, Answers.answer())
    fixture.serve(subscription: { _ in required }, profiles: profiles)
    await fixture.launch()
    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value
    await fixture.account.scheduler.settled()

    profiles.dropNextAnswer()
    fixture.profile.edit(ProfileFields(name: "Kana Fan"))
    await #expect(throws: AccountServiceError.self) { try await fixture.syncNow() }
    fixture.profile.edit(ProfileFields(name: "Kana Fan", username: "kanafan"))
    try await fixture.syncNow()

    #expect(profiles.held.name == "Kana Fan")
    #expect(profiles.held.username == "kanafan")
    #expect(!fixture.queuedOperations.contains { $0.hasPrefix("profile") })
  }

  @Test func keepsTheQueueAndReadsTheSubscriptionAgainWhenSyncNeedsOne() async throws {
    let fixture = AccountFixture()
    fixture.serve(sync: { _ in .error(402, "subscription_required") })
    await fixture.launch()
    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value
    let reads = fixture.server.requests(to: "GET /v1/me/subscription").count
    fixture.markKnown(AccountFixture.taberu)

    await #expect(throws: AccountServiceError.self) { try await fixture.syncNow() }
    await fixture.account.subscriptionWork?.value

    #expect(fixture.queuedOperations.contains("knownWord set \(AccountFixture.taberu)"))
    #expect(fixture.account.syncNeedsSubscription)
    #expect(fixture.server.requests(to: "GET /v1/me/subscription").count == reads + 1)
  }

  @Test func readsEverySubscriptionStillRunningAndValuesItDoesNotKnow() throws {
    let both = try Answers.decoded(
      Answers.answer(
        status: "active", active: true,
        running: [Answers.running("app_store"), Answers.running("website", status: "billing_retry")],
        canSubscribe: false, cloudAccess: "subscribed"))
    #expect(both.running.map(\.managedIn) == [.appStore, .website])
    #expect(both.running.map(\.status) == [.active, .billingRetry])
    #expect(both.runsInTheAppStore)
    #expect(both.paysTwice)
    #expect(both.shown.count == 2)

    var later = Answers.answer(status: "frozen", cloudAccess: "metered")
    later["running"] = nil
    later["managedIn"] = "somewhere"
    let unknown = try Answers.decoded(later)
    #expect(unknown.status == .none)
    #expect(unknown.cloudAccess == .free)
    #expect(unknown.managedIn == nil)
    #expect(unknown.running.isEmpty)
    #expect(unknown.shown.isEmpty)
    #expect(!unknown.offersAppStorePurchase)

    let ended = try Answers.decoded(Answers.answer(status: "expired"))
    #expect(ended.shown.map(\.status) == [.expired])
    #expect(!ended.runsInTheAppStore)
    #expect(!ended.paysTwice)
  }

  @Test func deletingSaysWhenAnAppStoreSubscriptionKeepsBilling() async throws {
    let fixture = AccountFixture()
    fixture.serve(
      deletion: .json(200, ["status": "deleted", "appStoreSubscriptionContinues": true]))
    await fixture.launch()
    try await fixture.signIn()
    #expect(try await fixture.account.deleteAccount(appleAuthorizationCode: nil))

    let older = AccountFixture()
    older.serve()
    await older.launch()
    try await older.signIn()
    #expect(try await !older.account.deleteAccount(appleAuthorizationCode: nil))
  }
}

final class SignedInBox: @unchecked Sendable {
  private let lock = NSLock()
  private var userID: String

  init(_ userID: String) {
    self.userID = userID
  }

  var current: String { lock.withLock { userID } }

  func switchTo(_ userID: String) {
    lock.withLock { self.userID = userID }
  }
}
