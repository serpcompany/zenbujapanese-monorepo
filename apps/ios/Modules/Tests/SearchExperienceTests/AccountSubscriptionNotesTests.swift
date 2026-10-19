import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account subscription: what it tells the learner", .timeLimit(.minutes(1)))
struct AccountSubscriptionNotesTests {
  typealias Answers = SubscriptionAnswers

  @Test func letsAskToBuysNoteGoAfterADayOrWhenTheLearnerTriesAgain() async throws {
    let fixture = try await Answers.waitingForApproval()
    let subscription = fixture.account.subscription
    #expect(subscription.problem == .pendingApproval)
    fixture.now += AccountSubscription.approvalWaitsFor + 60
    #expect(subscription.problem == nil)

    fixture.now -= AccountSubscription.approvalWaitsFor + 60
    #expect(subscription.problem == .pendingApproval)
    fixture.store.willAnswer(.cancels)
    await subscription.subscribe(to: Answers.monthly)
    #expect(subscription.problem == nil)
  }

  @Test func letsAnotherAccountsNoteGoOnceTheAppleAccountHasNoSubscription() async throws {
    let fixture = try await Answers.holdingAnotherAccountsPurchase()
    let subscription = fixture.account.subscription
    #expect(subscription.problem == .anotherAccount)

    fixture.store.holds([])
    await subscription.loadOffers()

    #expect(subscription.problem == nil)
    #expect(subscription.offering)
    #expect(!subscription.offers.isEmpty)
  }

  @Test func forgetsAKeptNoteOnSigningOutAcrossARelaunch() async throws {
    let fixture = try await Answers.waitingForApproval()
    await fixture.account.signOut()
    await fixture.account.subscription.flush()

    await fixture.launch()
    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value

    #expect(fixture.account.subscription.problem == nil)
  }

  @Test func saysWhyNothingIsOfferedRatherThanWaitingForOffers() async throws {
    let pending = StubReply.json(
      200,
      Answers.answer(
        status: "pending", running: [Answers.running("website", status: "pending")],
        canSubscribe: false))
    let waiting = try await Answers.signedIn { _ in pending }
    await waiting.account.subscription.loadOffers()
    #expect(waiting.account.subscription.problem == .paymentPending)

    let none = StubReply.json(200, Answers.answer())
    let fixture = try await Answers.signedIn(
      holding: [FakeAppStore.signed(Answers.monthly, for: UUID())], subscription: { _ in none })
    await fixture.account.subscription.loadOffers()
    #expect(fixture.account.subscription.problem == .appleAccountSubscribed)
    #expect(fixture.account.subscription.offers.isEmpty)
  }

  @Test func announcesEachNewNoteOnceForVoiceOver() async throws {
    let server = StubAccountServer()
    let token = StubTokens.access(expiresAt: Date().addingTimeInterval(15 * 60))
    server.respond { request in
      request.route == "GET /v1/auth/token" ? .json(200, ["token": token]) : .offline
    }
    let said = Said()
    let subscription = await Answers.standing(
      on: server, as: { "learner-1" }, announce: { said.say($0) })

    await subscription.refresh()
    await subscription.refresh()

    #expect(said.lines == [SubscriptionText.problem(.unreachable)])
  }

  @Test func sendsTheAppleAccountsPurchaseAgainForTheNextAccountSignedIn() async throws {
    let fixture = try await Answers.holdingAnotherAccountsPurchase()
    await fixture.account.signOut()

    fixture.serve(subscription: Answers.noneButAnothers, signsInAs: "learner-2")
    try await fixture.signIn(as: "second@example.com")
    await fixture.account.subscriptionWork?.value

    #expect(fixture.server.requests(to: "POST /v1/me/subscription/apple").count == 2)
    #expect(fixture.account.subscription.problem == .anotherAccount)
  }
}
