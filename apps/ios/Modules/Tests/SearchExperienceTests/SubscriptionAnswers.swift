import Foundation

@testable import SearchExperience

enum SubscriptionAnswers {
  static let monthly = FakeAppStore.monthly
  static let token = UUID(uuidString: "6F1C3C3E-0B5D-4C4E-9A51-7D0C2F1E8A01")!
  static let bought = FakeAppStore.signed(monthly, for: token)

  static func subscribed(_ managedIn: String = "app_store") -> [String: Any] {
    answer(
      status: "active", active: true, running: [running(managedIn)], canSubscribe: false,
      cloudAccess: "subscribed")
  }

  static func running(_ managedIn: String, status: String = "active", willRenew: Bool = true)
    -> [String: Any]
  {
    [
      "source": managedIn == "app_store" ? "apple" : "stripe", "productId": monthly,
      "status": status, "expiresAt": "2030-01-01T00:00:00.000Z", "willRenew": willRenew,
      "managedIn": managedIn,
    ]
  }

  static func answer(
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

  static func decoded(_ answer: [String: Any]) throws -> KnownSubscription {
    try JSONDecoder.accountService.decode(
      KnownSubscription.self, from: JSONSerialization.data(withJSONObject: answer))
  }

  @MainActor
  static func signedIn(
    subscription: @escaping @Sendable (StubRequest) -> StubReply
  ) async throws -> AccountFixture {
    let fixture = AccountFixture()
    fixture.serve(subscription: subscription)
    await fixture.launch()
    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value
    await fixture.account.scheduler.settled()
    return fixture
  }

  @MainActor
  static func signedIn(answeringPurchases purchases: StubReply, reading: StubReply? = nil)
    async throws -> AccountFixture
  {
    let read = reading ?? .json(200, answer())
    return try await signedIn { $0.method == "GET" ? read : purchases }
  }
}
