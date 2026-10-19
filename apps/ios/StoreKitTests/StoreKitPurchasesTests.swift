import Foundation
import StoreKit
import StoreKitTest
import Testing

@MainActor
@Suite(.serialized, .timeLimit(.minutes(1)))
struct StoreKitPurchasesTests {
  static let monthly = "com.zenbujapanese.sync.monthly"
  static let yearly = "com.zenbujapanese.sync.yearly"
  static let retired = "com.zenbujapanese.sync.retired"

  @Test func offersTheServicesProductsInItsOrderWithTheirPricesAndPeriods() async throws {
    let session = try await Self.session()
    let offers = try await StoreKitPurchases().offers(
      for: [Self.yearly, Self.retired, Self.monthly])
    #expect(offers.map(\.id) == [Self.yearly, Self.monthly])
    #expect(offers.map(\.price) == ["$49.99", "$4.99"])
    #expect(offers.map(\.period) == ["a year", "a month"])
    #expect(offers.map(\.name) == ["Zenbu Sync, Yearly", "Zenbu Sync"])
    #expect(offers.map(\.introduction) == ["1 week free", nil])
    session.clearTransactions()
  }

  @Test func offersNoIntroductoryOfferToAnAppleAccountThatHadThePlan() async throws {
    let (session, store) = try await Self.holding(Self.yearly)
    defer { session.clearTransactions() }
    try await Self.until("no introductory offer") {
      (try? await store.offers(for: [Self.yearly]).map(\.introduction)) == [nil]
    }
  }

  @Test func buysForTheAccountsTokenAndHandsOverTheSignedTransaction() async throws {
    let session = try await Self.session()
    let store = StoreKitPurchases()
    let token = UUID()
    let purchase = try await store.purchase(Self.monthly, for: token, confirmingWith: nil)
    guard case .purchased(let bought) = purchase else {
      Issue.record("The purchase didn't complete: \(purchase)")
      return
    }
    let payload = try Self.payload(of: bought.signedTransaction)
    #expect((payload["appAccountToken"] as? String)?.lowercased() == token.uuidString.lowercased())
    #expect(payload["productId"] as? String == Self.monthly)
    #expect(payload["environment"] as? String == "Xcode")
    await bought.finish()
    session.clearTransactions()
  }

  @Test func listsTheAppleAccountsCurrentPurchases() async throws {
    let (session, store) = try await Self.holding(Self.yearly)
    defer { session.clearTransactions() }
    let current = try await store.currentTransactions().map {
      try Self.payload(of: $0.signedTransaction)["productId"] as? String
    }
    #expect(current == [Self.yearly])
  }

  @Test func handsOverAPurchaseMadeOutsideTheAppThatIsNotFinishedOnceOnly() async throws {
    let session = try await Self.session()
    defer { session.clearTransactions() }
    let store = StoreKitPurchases()
    try await session.buyProduct(identifier: Self.yearly)
    try await Self.until("the purchase among unfinished transactions") {
      await Self.products(store.unfinishedTransactions()) == [Self.yearly]
    }
    for transaction in await store.unfinishedTransactions() { await transaction.finish() }
    try await Self.until("no unfinished transaction") {
      await store.unfinishedTransactions().isEmpty
    }
  }

  @Test func waitsForAskToBuyThenHandsOverTheApprovedPurchase() async throws {
    let session = try await Self.session()
    defer { session.clearTransactions() }
    session.askToBuyEnabled = true
    let store = StoreKitPurchases()
    let purchase = try await store.purchase(Self.monthly, for: UUID(), confirmingWith: nil)
    guard case .pending = purchase else {
      Issue.record("Ask to Buy didn't wait: \(purchase)")
      return
    }
    #expect(await store.currentTransactions().isEmpty)
    let asked = try #require(session.allTransactions().last)
    try session.approveAskToBuyTransaction(identifier: asked.identifier)
    try await Self.until("the approved purchase among current entitlements") {
      await Self.products(store.currentTransactions()) == [Self.monthly]
    }
    try await Self.until("the approved purchase among unfinished transactions") {
      await Self.products(store.unfinishedTransactions()) == [Self.monthly]
    }
    for transaction in await store.unfinishedTransactions() { await transaction.finish() }
  }

  @Test func handsOverARenewalAndDropsAnExpiredSubscription() async throws {
    let (session, store) = try await Self.holding(Self.monthly)
    defer { session.clearTransactions() }
    let first = await store.currentTransactions().map(\.id)
    try session.forceRenewalOfSubscription(productIdentifier: Self.monthly)
    try await Self.until("the renewal among current entitlements") {
      let renewed = await store.currentTransactions().map(\.id)
      return renewed.count == 1 && renewed != first
    }
    try session.expireSubscription(productIdentifier: Self.monthly)
    try await Self.until("no current entitlement after the expiry") {
      await store.currentTransactions().isEmpty
    }
  }

  @Test func dropsARefundedPurchase() async throws {
    let (session, store) = try await Self.holding(Self.yearly)
    defer { session.clearTransactions() }
    let bought = try #require(await store.currentTransactions().first.flatMap { UInt($0.id) })
    try session.refundTransaction(identifier: bought)
    try await Self.until("no current entitlement after the refund") {
      await store.currentTransactions().isEmpty
    }
  }

  @Test func restoresBySyncingWithTheAppStoreThenListingWhatItHolds() async throws {
    let (session, store) = try await Self.holding(Self.yearly)
    defer { session.clearTransactions() }
    try await store.syncWithAppStore()
    #expect(Self.products(await store.currentTransactions()) == [Self.yearly])
  }

  @Test func refusesAProductTheStoreDoesNotSell() async throws {
    let session = try await Self.session()
    await #expect(throws: StorePurchaseError.notOffered) {
      try await StoreKitPurchases().purchase(Self.retired, for: UUID(), confirmingWith: nil)
    }
    session.clearTransactions()
  }

  private static func holding(_ product: String) async throws
    -> (SKTestSession, StoreKitPurchases)
  {
    let session = try await Self.session()
    let store = StoreKitPurchases()
    try await session.buyProduct(identifier: product)
    try await Self.until("the purchase among current entitlements") {
      await Self.products(store.currentTransactions()) == [product]
    }
    return (session, store)
  }

  private static func products(_ transactions: [StoreTransaction]) -> [String] {
    transactions.map(\.productID)
  }

  private static func until(_ what: String, _ holds: () async -> Bool) async throws {
    for _ in 0..<500 {
      if await holds() { return }
      try await Task.sleep(for: .milliseconds(20))
    }
    Issue.record("StoreKit never showed \(what)")
    throw CancellationError()
  }

  private static func session() async throws -> SKTestSession {
    let configuration = URL(filePath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent().appending(path: "App/ZenbuSync.storekit")
    let session = try SKTestSession(contentsOf: configuration)
    session.disableDialogs = true
    session.askToBuyEnabled = false
    session.clearTransactions()
    let store = StoreKitPurchases()
    try await until("a cleared store") {
      let current = await store.currentTransactions()
      let unfinished = await store.unfinishedTransactions()
      return current.isEmpty && unfinished.isEmpty
    }
    return session
  }

  private static func payload(of jws: String) throws -> [String: Any] {
    let parts = jws.split(separator: ".")
    try #require(parts.count == 3)
    var base64 = parts[1].replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    let data = try #require(Data(base64Encoded: base64))
    return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
  }
}
