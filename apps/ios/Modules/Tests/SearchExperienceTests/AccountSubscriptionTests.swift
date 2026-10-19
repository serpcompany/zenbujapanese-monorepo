import Foundation
import Testing

@testable import SearchExperience

@MainActor
struct AccountSubscriptionTests {
  nonisolated static let monthly = "com.zenbujapanese.sync.monthly"
  nonisolated static let token = UUID(uuidString: "6F1C3C3E-0B5D-4C4E-9A51-7D0C2F1E8A01")!

  @Test func readsTheSubscriptionOnSigningInAndKeepsItForThatAccountOnly() async throws {
    let none = StubReply.json(200, Self.answer())
    let fixture = try await Self.signedIn { _ in none }
    let current = try #require(fixture.account.subscription.current)
    #expect(current.status == .none)
    #expect(current.appAccountToken == Self.token)
    #expect(current.offersAppStorePurchase)
    #expect(fixture.account.syncNeedsSubscription)

    await fixture.account.subscription.flush()
    await fixture.launch()
    await fixture.account.subscription.flush()
    #expect(fixture.account.subscription.current?.cloudAccess == .subscriptionRequired)

    await fixture.account.signOut()
    #expect(fixture.account.subscription.current == nil)
    #expect(!fixture.account.syncNeedsSubscription)
  }

  @Test func buysWithTheAccountsTokenAndFinishesOnceTheServiceHasThePurchase() async throws {
    let fixture = try await Self.signedIn(answeringPurchases: .json(200, Self.subscribed()))
    let subscription = fixture.account.subscription
    let syncs = fixture.server.requests(to: "POST /v1/sync").count

    await subscription.subscribe(to: Self.monthly)

    #expect(fixture.store.purchases == [.init(productID: Self.monthly, appAccountToken: Self.token)])
    let posted = fixture.server.requests(to: "POST /v1/me/subscription/apple")
    #expect(posted.map { $0.json["signedTransaction"] as? String }
      == [FakeAppStore.signed(Self.monthly, for: Self.token)])
    #expect(fixture.store.finished == [FakeAppStore.signed(Self.monthly, for: Self.token)])
    #expect(subscription.current?.active == true)
    #expect(subscription.current?.offersAppStorePurchase == false)
    #expect(subscription.problem == nil)
    await fixture.account.scheduler.settled()
    #expect(fixture.server.requests(to: "POST /v1/sync").count > syncs)
  }

  @Test func neverOffersASecondSubscription() async throws {
    let onTheWebsite = StubReply.json(
      200,
      Self.answer(
        status: "active", active: true, running: [Self.running("website")], canSubscribe: false,
        cloudAccess: "subscribed"))
    let fixture = try await Self.signedIn { _ in onTheWebsite }
    let subscription = fixture.account.subscription

    #expect(subscription.current?.offersAppStorePurchase == false)
    await subscription.subscribe(to: Self.monthly)

    #expect(subscription.problem == .notOffered)
    #expect(fixture.store.purchases.isEmpty)
    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").isEmpty)
  }

  @Test func leavesAPurchaseForStoreKitToHandOverAgainWhileTheServiceIsDown() async throws {
    let fixture = try await Self.signedIn(answeringPurchases: .error(503, "unavailable"))

    await fixture.account.subscription.subscribe(to: Self.monthly)

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 1)
    #expect(fixture.store.finished.isEmpty)
    #expect(fixture.account.subscription.problem == .unreachable)
  }

  @Test func finishesAPurchaseTheServiceRefusesAndSaysWhenItIsAnotherAccounts() async throws {
    let fixture = try await Self.signedIn(
      answeringPurchases: .error(409, "subscription_belongs_to_another_account"))

    await fixture.account.subscription.subscribe(to: Self.monthly)

    #expect(fixture.store.finished == [FakeAppStore.signed(Self.monthly, for: Self.token)])
    #expect(fixture.account.subscription.problem == .anotherAccount)
  }

  @Test func waitsForAskToBuyAndSendsTheApprovedPurchaseWhenStoreKitHandsItOver() async throws {
    let fixture = try await Self.signedIn(answeringPurchases: .json(200, Self.subscribed()))
    let subscription = fixture.account.subscription
    fixture.store.willAnswer(.waitsForApproval)

    await subscription.subscribe(to: Self.monthly)
    #expect(subscription.problem == .pendingApproval)

    subscription.listen()
    let approved = FakeAppStore.signed(Self.monthly, for: Self.token)
    fixture.store.update(approved)
    await fixture.store.finishing(approved)

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 1)
    #expect(subscription.current?.active == true)
    await fixture.account.scheduler.settled()
  }

  @Test func restoresBySendingTheAppleAccountsCurrentPurchases() async throws {
    let fixture = try await Self.signedIn(answeringPurchases: .json(200, Self.subscribed()))
    let earlier = FakeAppStore.signed(Self.monthly, for: UUID())
    fixture.store.holds([earlier])

    await fixture.account.subscription.restore()

    #expect(fixture.store.syncCount == 1)
    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple")
      .map { $0.json["signedTransaction"] as? String } == [earlier])
    #expect(fixture.account.subscription.current?.active == true)
    await fixture.account.scheduler.settled()
  }

  @Test func sendsTheAppleAccountsPurchasesOnSigningInSoAnEarlierOneUnlocks() async throws {
    let fixture = AccountFixture()
    let none = StubReply.json(200, Self.answer())
    let bought = StubReply.json(200, Self.subscribed())
    fixture.serve(subscription: { $0.method == "GET" ? none : bought })
    await fixture.launch()
    let earlier = FakeAppStore.signed(Self.monthly, for: UUID())
    fixture.store.holds([earlier])

    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value

    #expect(fixture.store.finished == [earlier])
    #expect(fixture.account.subscription.current?.active == true)
    await fixture.account.scheduler.settled()
  }

  @Test func sendsNothingWhileSignedOut() async throws {
    let fixture = AccountFixture()
    fixture.serve(subscription: { _ in .json(200, Self.subscribed()) })
    await fixture.launch()
    fixture.store.holds([FakeAppStore.signed(Self.monthly, for: UUID())])

    await fixture.account.subscription.restore()
    await fixture.account.subscription.refresh()

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").isEmpty)
    #expect(fixture.server.requests(to: "GET /v1/me/subscription").isEmpty)
    #expect(fixture.store.finished.isEmpty)
  }

  @Test func keepsTheQueueWhenSyncNeedsASubscription() async throws {
    let fixture = AccountFixture()
    fixture.serve(sync: { _ in .error(402, "subscription_required") })
    await fixture.launch()
    try await fixture.signIn()
    fixture.markKnown(AccountFixture.taberu)

    await #expect(throws: AccountServiceError.self) { try await fixture.syncNow() }

    #expect(fixture.queuedOperations.contains("knownWord mark \(AccountFixture.taberu)"))
    #expect(fixture.account.syncNeedsSubscription)
    let failure = try #require(fixture.sync.lastFailure)
    #expect(AccountMessage.text(for: failure)?.hasPrefix("Syncing needs a Zenbu subscription") == true)
  }

  @Test func readsEverySubscriptionStillRunningAndValuesItDoesNotKnow() throws {
    let both = try Self.decoded(
      Self.answer(
        status: "active", active: true,
        running: [Self.running("app_store"), Self.running("website", status: "billing_retry")],
        canSubscribe: false, cloudAccess: "subscribed"))
    #expect(both.running.map(\.managedIn) == [.appStore, .website])
    #expect(both.running.map(\.status) == [.active, .billingRetry])
    #expect(both.runsInTheAppStore)
    #expect(both.shown.count == 2)

    var later = Self.answer(status: "frozen", cloudAccess: "metered")
    later["running"] = nil
    later["managedIn"] = "somewhere"
    let unknown = try Self.decoded(later)
    #expect(unknown.status == .none)
    #expect(unknown.cloudAccess == .free)
    #expect(unknown.managedIn == nil)
    #expect(unknown.running.isEmpty)
    #expect(unknown.shown.isEmpty)

    let ended = try Self.decoded(Self.answer(status: "expired"))
    #expect(ended.shown.map(\.status) == [.expired])
    #expect(!ended.runsInTheAppStore)
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

  private static func signedIn(
    subscription: @escaping @Sendable (StubRequest) -> StubReply
  ) async throws -> AccountFixture {
    let fixture = AccountFixture()
    fixture.serve(subscription: subscription)
    await fixture.launch()
    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value
    return fixture
  }

  private static func signedIn(answeringPurchases purchases: StubReply) async throws
    -> AccountFixture
  {
    let none = StubReply.json(200, answer())
    return try await signedIn { $0.method == "GET" ? none : purchases }
  }

  private static func decoded(_ answer: [String: Any]) throws -> KnownSubscription {
    try JSONDecoder.accountService.decode(
      KnownSubscription.self, from: JSONSerialization.data(withJSONObject: answer))
  }

  nonisolated static func subscribed() -> [String: Any] {
    answer(
      status: "active", active: true, running: [running("app_store")], canSubscribe: false,
      cloudAccess: "subscribed")
  }

  nonisolated static func running(_ managedIn: String, status: String = "active")
    -> [String: Any]
  {
    [
      "source": managedIn == "app_store" ? "apple" : "stripe", "productId": monthly,
      "status": status, "expiresAt": "2030-01-01T00:00:00.000Z", "willRenew": true,
      "managedIn": managedIn,
    ]
  }

  nonisolated static func answer(
    status: String = "none", active: Bool = false, running: [[String: Any]] = [],
    canSubscribe: Bool = true, cloudAccess: String = "subscription_required"
  ) -> [String: Any] {
    [
      "status": status, "active": active, "source": NSNull(), "productId": NSNull(),
      "expiresAt": active ? "2030-01-01T00:00:00.000Z" : NSNull(),
      "willRenew": active ? true : NSNull(), "managedIn": running.first?["managedIn"] ?? NSNull(),
      "running": running, "canSubscribe": canSubscribe, "cloudAccess": cloudAccess,
      "appAccountToken": token.uuidString.lowercased(),
      "offers": ["appStore": [monthly], "website": ["price_monthly"]],
    ]
  }
}
