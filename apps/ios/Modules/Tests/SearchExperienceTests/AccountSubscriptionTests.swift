import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account subscription: buying and restoring", .timeLimit(.minutes(1)))
struct AccountSubscriptionTests {
  typealias Answers = SubscriptionAnswers

  @Test func buysWithTheAccountsTokenAndFinishesOnceTheServiceHasThePurchase() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .json(200, Answers.subscribed()))
    let subscription = fixture.account.subscription
    let syncs = fixture.server.requests(to: "POST /v1/sync").count
    #expect(subscription.offering)

    await subscription.subscribe(to: Answers.monthly)

    #expect(fixture.store.purchases == [.init(productID: Answers.monthly, appAccountToken: Answers.token)])
    let posted = fixture.server.requests(to: "POST /v1/me/subscription/apple")
    #expect(posted.map { $0.json["signedTransaction"] as? String } == [Answers.bought])
    #expect(fixture.store.finished == [Answers.bought])
    #expect(subscription.current?.active == true)
    #expect(!subscription.offering)
    #expect(subscription.problem == nil)
    await fixture.account.scheduler.settled()
    #expect(fixture.server.requests(to: "POST /v1/sync").count > syncs)
  }

  @Test func offersNothingWhileSyncIsFree() async throws {
    let free = StubReply.json(200, Answers.answer(cloudAccess: "free"))
    let fixture = try await Answers.signedIn { _ in free }
    let subscription = fixture.account.subscription
    #expect(subscription.current?.canSubscribe == true)
    #expect(!subscription.offering)

    await subscription.loadOffers()
    await subscription.subscribe(to: Answers.monthly)

    #expect(subscription.offers.isEmpty)
    #expect(fixture.store.purchases.isEmpty)
  }

  @Test func neverOffersASecondSubscription() async throws {
    let onTheWebsite = StubReply.json(200, Answers.subscribed("website"))
    let fixture = try await Answers.signedIn { _ in onTheWebsite }
    let subscription = fixture.account.subscription

    #expect(!subscription.offering)
    await subscription.subscribe(to: Answers.monthly)

    #expect(subscription.problem == .notOffered)
    #expect(fixture.store.purchases.isEmpty)
    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").isEmpty)
  }

  @Test func readsTheSubscriptionAgainBeforeBuyingSoAWebsitePurchaseThatJustLandedIsntSoldTwice()
    async throws
  {
    let reads = CallCount()
    let none = StubReply.json(200, Answers.answer())
    let website = StubReply.json(200, Answers.subscribed("website"))
    let fixture = try await Answers.signedIn { _ in reads.next() == 1 ? none : website }
    #expect(fixture.account.subscription.offering)

    await fixture.account.subscription.subscribe(to: Answers.monthly)

    #expect(fixture.store.purchases.isEmpty)
    #expect(fixture.account.subscription.current?.running.first?.managedIn == .website)
    await fixture.account.scheduler.settled()
  }

  @Test func offersNothingWhileTheAppleAccountHasTheSubscriptionAndKeepsAnotherAccountsNote()
    async throws
  {
    let fixture = try await Answers.holdingAnotherAccountsPurchase()
    let subscription = fixture.account.subscription
    #expect(subscription.problem == .anotherAccount)

    await subscription.loadOffers()
    await subscription.subscribe(to: Answers.monthly)

    #expect(subscription.problem == .anotherAccount)
    #expect(subscription.appleAccountSubscribed)
    #expect(!subscription.offering)
    #expect(subscription.offers.isEmpty)
    #expect(fixture.store.purchases.isEmpty)
  }

  @Test func leavesAPurchaseForStoreKitToHandOverAgainWhileTheServiceIsDownOrBusy() async throws {
    for refusal in [StubReply.error(503, "unavailable"), .error(429, "too_many_requests")] {
      let fixture = try await Answers.signedIn(answeringPurchases: refusal)
      await fixture.account.subscription.subscribe(to: Answers.monthly)
      #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 1)
      #expect(fixture.store.finished.isEmpty)
      #expect(fixture.account.subscription.problem == .unreachable)
    }
  }

  @Test func leavesAPurchaseUnfinishedWhenTheServiceKeepsRefusingItsToken() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .error(401, "unauthorized"))
    await fixture.account.subscription.subscribe(to: Answers.monthly)
    #expect(fixture.store.finished.isEmpty)
  }

  @Test func finishesAPurchaseTheServiceRefusesForGoodAndSaysWhenItIsAnotherAccounts() async throws {
    let refused = try await Answers.signedIn(answeringPurchases: .error(400, "invalid_transaction"))
    await refused.account.subscription.subscribe(to: Answers.monthly)
    #expect(refused.store.finished == [Answers.bought])

    let fixture = try await Answers.signedIn(
      answeringPurchases: .error(409, "subscription_belongs_to_another_account"))
    await fixture.account.subscription.subscribe(to: Answers.monthly)
    #expect(fixture.store.finished == [Answers.bought])
    #expect(fixture.account.subscription.problem == .anotherAccount)
  }

  @Test func saysNothingWhenTheLearnerCancelsAndSaysWhenTheStoreFails() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .json(200, Answers.subscribed()))
    let subscription = fixture.account.subscription
    fixture.store.willAnswer(.cancels)
    await subscription.subscribe(to: Answers.monthly)
    #expect(subscription.problem == nil)
    fixture.store.willAnswer(.fails)
    await subscription.subscribe(to: Answers.monthly)
    #expect(subscription.problem == .storeUnavailable)
    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").isEmpty)
  }

  @Test func saysWhenTheAppStoreDoesntSellTheSubscriptionHere() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .json(200, Answers.subscribed()))
    fixture.store.sellsOnly([])
    await fixture.account.subscription.loadOffers()
    #expect(fixture.account.subscription.problem == .notAvailableHere)
  }

  @Test func waitsForAskToBuyAndSendsTheApprovedPurchaseWhenStoreKitHandsItOver() async throws {
    let fixture = try await Answers.waitingForApproval()
    let subscription = fixture.account.subscription
    #expect(subscription.problem == .pendingApproval)

    subscription.listen()
    fixture.store.update(Answers.bought)
    await fixture.store.finishing(Answers.bought)

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 1)
    #expect(subscription.current?.active == true)
    #expect(subscription.problem == nil)
    await fixture.account.scheduler.settled()
  }

  @Test func sendsAPurchaseStoreKitHandsOverTwiceOnlyOnce() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .json(200, Answers.subscribed()))
    let subscription = fixture.account.subscription
    fixture.store.leavesUnfinished([Answers.bought])
    subscription.listen()
    fixture.store.update(Answers.bought)
    await subscription.sendUnfinished()
    await fixture.store.finishing(Answers.bought)
    await subscription.sendUnfinished()

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 1)
    await fixture.account.scheduler.settled()
  }

  @Test func restoresBySendingTheAppleAccountsCurrentPurchasesOrSaysTheresNone() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .json(200, Answers.subscribed()))
    await fixture.account.subscription.restore()
    #expect(fixture.account.subscription.problem == .nothingToRestore)

    let earlier = FakeAppStore.signed(Answers.monthly, for: UUID())
    fixture.store.holds([earlier])
    await fixture.account.subscription.restore()

    #expect(fixture.store.syncCount == 2)
    #expect(
      fixture.server.requests(to: "POST /v1/me/subscription/apple")
        .map { $0.json["signedTransaction"] as? String } == [earlier])
    #expect(fixture.account.subscription.current?.active == true)
    #expect(fixture.account.subscription.problem == nil)
    await fixture.account.scheduler.settled()
  }

  @Test func sendsTheAppleAccountsPurchasesOnSigningInSoAnEarlierOneUnlocks() async throws {
    let fixture = AccountFixture()
    let none = StubReply.json(200, Answers.answer())
    let bought = StubReply.json(200, Answers.subscribed())
    fixture.serve(subscription: { $0.method == "GET" ? none : bought })
    await fixture.launch()
    let earlier = FakeAppStore.signed(Answers.monthly, for: UUID())
    fixture.store.holds([earlier])

    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value

    #expect(fixture.store.finished == [earlier])
    #expect(fixture.account.subscription.current?.active == true)
    await fixture.account.scheduler.settled()
  }

  @Test func buysNothingOnAnOldAnswerWhenTheSubscriptionCantBeReadFirst() async throws {
    let reads = CallCount()
    let none = StubReply.json(200, Answers.answer())
    let fixture = try await Answers.signedIn { request in
      guard request.method == "GET" else { return .json(200, Answers.subscribed()) }
      return reads.next() == 1 ? none : .offline
    }
    #expect(fixture.account.subscription.offering)

    await fixture.account.subscription.subscribe(to: Answers.monthly)

    #expect(fixture.store.purchases.isEmpty)
    #expect(fixture.account.subscription.problem == .unreachable)
  }

  @Test func keepsThePurchasesAnswerOverARefreshThatReadBeforeIt() async throws {
    let reads = CallCount()
    let laterRead = LaterReply()
    let laterPurchase = LaterReply()
    let none = StubReply.json(200, Answers.answer())
    let fixture = try await Answers.signedIn { request in
      guard request.method == "GET" else { return .later(laterPurchase) }
      return reads.next() <= 2 ? none : .later(laterRead)
    }
    let subscription = fixture.account.subscription
    let buying = Task { await subscription.subscribe(to: Answers.monthly) }
    while !laterPurchase.isWaiting { try await Task.sleep(for: .milliseconds(5)) }
    let reading = Task { await subscription.refresh() }
    while !laterRead.isWaiting { try await Task.sleep(for: .milliseconds(5)) }

    laterPurchase.send(.json(200, Answers.subscribed()))
    await buying.value
    laterRead.send(none)
    await reading.value

    #expect(subscription.current?.active == true)
    await fixture.account.scheduler.settled()
  }

  @Test func sendsAnUpdateStoreKitSignsAgainForTheSamePurchase() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .json(200, Answers.subscribed()))
    let posted = { fixture.server.requests(to: "POST /v1/me/subscription/apple").count }
    fixture.account.subscription.listen()
    fixture.store.update(Answers.bought)
    await fixture.store.finishing(Answers.bought)
    fixture.store.update(Answers.bought)
    fixture.store.update(Answers.bought, signedAt: Date(timeIntervalSince1970: 1_800_000_000))
    while posted() < 2 { try await Task.sleep(for: .milliseconds(5)) }

    #expect(posted() == 2)
    await fixture.account.scheduler.settled()
  }

  @Test func listensFromLaunchOnceTheAccountsFileHasLoaded() async throws {
    let fixture = try await Answers.signedIn(answeringPurchases: .json(200, Answers.subscribed()))
    fixture.account.startSubscription()
    await fixture.account.subscriptionWork?.value

    fixture.store.update(Answers.bought)
    await fixture.store.finishing(Answers.bought)

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 1)
    await fixture.account.scheduler.settled()
  }
}
