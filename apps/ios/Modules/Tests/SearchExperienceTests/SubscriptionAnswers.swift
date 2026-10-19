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

  static let anothers = StubReply.error(409, "subscription_belongs_to_another_account")

  static func noneButAnothers(_ request: StubRequest) -> StubReply {
    request.method == "GET" ? .json(200, answer()) : anothers
  }

  @MainActor
  static func signedIn(
    holding purchases: [String],
    subscription: @escaping @Sendable (StubRequest) -> StubReply = noneButAnothers
  ) async throws -> AccountFixture {
    let fixture = AccountFixture()
    fixture.serve(subscription: subscription)
    await fixture.launch()
    fixture.store.holds(purchases)
    try await fixture.signIn()
    await fixture.account.subscriptionWork?.value
    return fixture
  }

  @MainActor
  static func holdingAnotherAccountsPurchase() async throws -> AccountFixture {
    try await signedIn(holding: [FakeAppStore.signed(monthly, for: UUID())])
  }

  @MainActor
  static func waitingForApproval() async throws -> AccountFixture {
    let fixture = try await signedIn(answeringPurchases: .json(200, subscribed()))
    fixture.store.willAnswer(.waitsForApproval)
    await fixture.account.subscription.subscribe(to: monthly)
    return fixture
  }

  @MainActor
  static func standing(
    on server: StubAccountServer, as signedInAs: @escaping @MainActor () -> String?,
    announce: @escaping @MainActor (String) -> Void = { _ in }
  ) async -> AccountSubscription {
    let api = AccountAPI(baseURL: server.baseURL, session: server.session)
    let subscription = AccountSubscription(
      api: api, tokens: AccountTokens(api: api, storage: MemorySessionTokenStorage("s.signed")),
      store: FakeAppStore(),
      fileURL: FileManager.default.temporaryDirectory.appending(path: "\(UUID()).json"),
      signedInAs: signedInAs, announce: announce)
    await subscription.flush()
    return subscription
  }

  @MainActor
  static func signedIn(answeringPurchases purchases: StubReply, reading: StubReply? = nil)
    async throws -> AccountFixture
  {
    let read = reading ?? .json(200, answer())
    return try await signedIn { $0.method == "GET" ? read : purchases }
  }
}

final class StubProfiles: @unchecked Sendable {
  private let lock = NSLock()
  private var name = ""
  private var username: String?
  private var version = 1
  private var dropsNextAnswer = false

  var held: (name: String, username: String?) { lock.withLock { (name, username) } }

  func dropNextAnswer() {
    lock.withLock { dropsNextAnswer = true }
  }

  func reply(to request: StubRequest) -> StubReply {
    lock.withLock {
      guard request.method == "PATCH" else { return current }
      let body = request.json
      guard body["baseVersion"] as? Int == version else { return .error(409, "version_conflict") }
      if let edited = body["name"] as? String { name = edited }
      if let edited = body["username"] as? String { username = edited }
      version += 1
      guard !dropsNextAnswer else {
        dropsNextAnswer = false
        return .offline
      }
      return current
    }
  }

  private var current: StubReply {
    .json(200, AccountFixture.profile(name: name, username: username, version: version))
  }
}

@MainActor
final class Said {
  private(set) var lines: [String] = []

  func say(_ line: String) {
    lines.append(line)
  }
}
