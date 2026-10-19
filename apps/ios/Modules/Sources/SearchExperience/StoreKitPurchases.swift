import Foundation
import StoreKit

enum StorePurchaseError: Error, Equatable {
  case notOffered
  case unverified
}

actor StoreKitPurchases: AppStorePurchases {
  private var products: [String: Product] = [:]

  func offers(for productIDs: [String]) async throws -> [SubscriptionOffer] {
    let found = try await Product.products(for: productIDs)
    for product in found { products[product.id] = product }
    var offers: [SubscriptionOffer] = []
    for id in productIDs {
      guard let product = found.first(where: { $0.id == id }) else { continue }
      offers.append(await Self.offer(product))
    }
    return offers
  }

  @MainActor
  func purchase(_ productID: String, for appAccountToken: UUID) async throws -> StorePurchase {
    guard let product = await product(productID) else { throw StorePurchaseError.notOffered }
    switch try await product.purchase(options: [.appAccountToken(appAccountToken)]) {
    case .success(let verification):
      guard let transaction = Self.verified(verification) else {
        throw StorePurchaseError.unverified
      }
      return .purchased(transaction)
    case .pending:
      return .pending
    case .userCancelled:
      return .cancelled
    @unknown default:
      return .cancelled
    }
  }

  nonisolated func currentTransactions() async -> [StoreTransaction] {
    var transactions: [StoreTransaction] = []
    for await entitlement in Transaction.currentEntitlements {
      if let transaction = Self.verified(entitlement) { transactions.append(transaction) }
    }
    return transactions
  }

  nonisolated func syncWithAppStore() async throws {
    do {
      try await AppStore.sync()
    } catch StoreKitError.userCancelled {
      return
    }
  }

  nonisolated func transactionUpdates() -> AsyncStream<StoreTransaction> {
    AsyncStream { continuation in
      let listening = Task {
        for await update in Transaction.updates {
          if let transaction = Self.verified(update) { continuation.yield(transaction) }
        }
        continuation.finish()
      }
      let unfinished = Task {
        for await waiting in Transaction.unfinished {
          if let transaction = Self.verified(waiting) { continuation.yield(transaction) }
        }
      }
      continuation.onTermination = { _ in
        listening.cancel()
        unfinished.cancel()
      }
    }
  }

  private func product(_ id: String) async -> Product? {
    if let known = products[id] { return known }
    let found = try? await Product.products(for: [id])
    if let product = found?.first { products[id] = product }
    return found?.first
  }

  private nonisolated static func verified(
    _ result: VerificationResult<Transaction>
  ) -> StoreTransaction? {
    guard case .verified(let transaction) = result else { return nil }
    return StoreTransaction(
      signedTransaction: result.jwsRepresentation, finish: { await transaction.finish() })
  }

  private nonisolated static func offer(_ product: Product) async -> SubscriptionOffer {
    let subscription = product.subscription
    let eligible = await subscription?.isEligibleForIntroOffer ?? false
    return SubscriptionOffer(
      id: product.id, name: product.displayName, summary: product.description,
      price: product.displayPrice,
      period: subscription.map { Self.period($0.subscriptionPeriod) } ?? "",
      introduction: eligible ? subscription?.introductoryOffer.map(Self.introduction) : nil)
  }

  private nonisolated static func introduction(_ offer: Product.SubscriptionOffer) -> String {
    let length = Self.length(of: offer.period, times: offer.periodCount)
    return switch offer.paymentMode {
    case .freeTrial: String(localized: "\(length) free")
    case .payAsYouGo:
      String(localized: "\(offer.displayPrice) \(Self.period(offer.period)) for \(length)")
    default: String(localized: "\(offer.displayPrice) for \(length)")
    }
  }

  private nonisolated static func length(
    of period: Product.SubscriptionPeriod, times count: Int
  ) -> String {
    let value = period.value * count
    var components = DateComponents()
    switch period.unit {
    case .day: components.day = value
    case .week: components.weekOfMonth = value
    case .month: components.month = value
    case .year: components.year = value
    @unknown default: components.day = value
    }
    let formatter = DateComponentsFormatter()
    formatter.unitsStyle = .full
    formatter.allowedUnits = [.day, .weekOfMonth, .month, .year]
    return formatter.string(from: components) ?? ""
  }

  private nonisolated static func period(_ period: Product.SubscriptionPeriod) -> String {
    switch (period.unit, period.value) {
    case (.month, 1): String(localized: "a month")
    case (.year, 1): String(localized: "a year")
    case (.week, 1): String(localized: "a week")
    default:
      period.formatted(Date.ComponentsFormatStyle(style: .wide, fields: [.day, .week, .month, .year]))
    }
  }
}
