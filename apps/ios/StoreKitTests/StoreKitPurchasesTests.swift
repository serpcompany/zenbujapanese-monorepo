import Foundation
import StoreKit
import StoreKitTest
import Testing

@MainActor
@Suite(.serialized)
struct StoreKitPurchasesTests {
  static let monthly = "com.zenbujapanese.sync.monthly"
  static let yearly = "com.zenbujapanese.sync.yearly"
  static let retired = "com.zenbujapanese.sync.retired"

  @Test func offersTheServicesProductsInItsOrderWithTheirPricesAndPeriods() async throws {
    let session = try Self.session()
    let offers = try await StoreKitPurchases().offers(
      for: [Self.yearly, Self.retired, Self.monthly])
    #expect(offers.map(\.id) == [Self.yearly, Self.monthly])
    #expect(offers.map(\.price) == ["$49.99", "$4.99"])
    #expect(offers.map(\.period) == ["a year", "a month"])
    #expect(offers.map(\.name) == ["Zenbu Sync, Yearly", "Zenbu Sync"])
    session.clearTransactions()
  }

  @Test func buysForTheAccountsTokenAndHandsOverTheSignedTransaction() async throws {
    let session = try Self.session()
    let store = StoreKitPurchases()
    let token = UUID()
    let purchase = try await store.purchase(Self.monthly, for: token)
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
    let session = try Self.session()
    try await session.buyProduct(identifier: Self.yearly)
    let current = try await StoreKitPurchases().currentTransactions().map {
      try Self.payload(of: $0.signedTransaction)["productId"] as? String
    }
    #expect(current == [Self.yearly])
    session.clearTransactions()
  }

  @Test func handsOverAPurchaseMadeOutsideTheAppThatIsNotFinished() async throws {
    let session = try Self.session()
    try await session.buyProduct(identifier: Self.yearly)
    var updates = StoreKitPurchases().transactionUpdates().makeAsyncIterator()
    let update = try #require(await updates.next())
    #expect(try Self.payload(of: update.signedTransaction)["productId"] as? String == Self.yearly)
    await update.finish()
    session.clearTransactions()
  }

  @Test func waitsForAskToBuy() async throws {
    let session = try Self.session()
    session.askToBuyEnabled = true
    let purchase = try await StoreKitPurchases().purchase(Self.monthly, for: UUID())
    guard case .pending = purchase else {
      Issue.record("Ask to Buy didn't wait: \(purchase)")
      return
    }
    session.clearTransactions()
  }

  @Test func refusesAProductTheStoreDoesNotSell() async throws {
    let session = try Self.session()
    await #expect(throws: StorePurchaseError.notOffered) {
      try await StoreKitPurchases().purchase(Self.retired, for: UUID())
    }
    session.clearTransactions()
  }

  private static func session() throws -> SKTestSession {
    let configuration = URL(filePath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent().appending(path: "App/ZenbuSync.storekit")
    let session = try SKTestSession(contentsOf: configuration)
    session.disableDialogs = true
    session.askToBuyEnabled = false
    session.clearTransactions()
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
