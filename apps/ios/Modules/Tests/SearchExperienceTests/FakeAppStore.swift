import Foundation

@testable import SearchExperience

final class FakeAppStore: AppStorePurchases, @unchecked Sendable {
  enum Outcome: Sendable {
    case buys
    case waitsForApproval
    case cancels
    case fails
  }

  struct Purchase: Equatable, Sendable {
    let productID: String
    let appAccountToken: UUID
  }

  private let lock = NSLock()
  private var outcome = Outcome.buys
  private var bought: [Purchase] = []
  private var current: [String] = []
  private var finishedTransactions: [String] = []
  private var syncs = 0
  private let (updates, sendUpdate) = AsyncStream.makeStream(of: StoreTransaction.self)
  private let (finishes, sendFinish) = AsyncStream.makeStream(of: String.self)

  var purchases: [Purchase] { lock.withLock { bought } }
  var finished: [String] { lock.withLock { finishedTransactions } }
  var syncCount: Int { lock.withLock { syncs } }

  func willAnswer(_ outcome: Outcome) {
    lock.withLock { self.outcome = outcome }
  }

  func holds(_ signedTransactions: [String]) {
    lock.withLock { current = signedTransactions }
  }

  func update(_ signedTransaction: String) {
    sendUpdate.yield(transaction(signedTransaction))
  }

  func finishing(_ signedTransaction: String) async {
    var finishes = finishes.makeAsyncIterator()
    while !finished.contains(signedTransaction), await finishes.next() != nil {}
  }

  static func signed(_ productID: String, for appAccountToken: UUID) -> String {
    "signed.\(productID).\(appAccountToken.uuidString)"
  }

  func offers(for productIDs: [String]) async throws -> [SubscriptionOffer] {
    productIDs.map {
      SubscriptionOffer(id: $0, name: "Zenbu Sync", summary: "Sync", price: "$4.99", period: "a month")
    }
  }

  @MainActor
  func purchase(_ productID: String, for appAccountToken: UUID) async throws -> StorePurchase {
    let outcome = lock.withLock {
      bought.append(Purchase(productID: productID, appAccountToken: appAccountToken))
      return self.outcome
    }
    switch outcome {
    case .buys: return .purchased(transaction(Self.signed(productID, for: appAccountToken)))
    case .waitsForApproval: return .pending
    case .cancels: return .cancelled
    case .fails: throw StorePurchaseError.unverified
    }
  }

  func currentTransactions() async -> [StoreTransaction] {
    lock.withLock { current }.map(transaction)
  }

  func syncWithAppStore() async throws {
    lock.withLock { syncs += 1 }
  }

  func transactionUpdates() -> AsyncStream<StoreTransaction> { updates }

  private func transaction(_ signed: String) -> StoreTransaction {
    StoreTransaction(signedTransaction: signed) { [self] in
      lock.withLock { finishedTransactions.append(signed) }
      sendFinish.yield(signed)
    }
  }
}
