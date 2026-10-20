import Foundation
import StoreKit
import SwiftUI

#if DEBUG
  actor StandInAppStore: AppStorePurchases {
    static let monthly = "com.zenbujapanese.sync.monthly"
    static let yearly = "com.zenbujapanese.sync.yearly"

    private var purchased: [StoreTransaction] = []

    func offers(for productIDs: [String]) async throws -> [SubscriptionOffer] {
      productIDs.compactMap(Self.offer)
    }

    @MainActor
    func purchase(
      _ productID: String, for appAccountToken: UUID, confirmingWith action: PurchaseAction?
    ) async throws -> StorePurchase {
      let signed = "stand-in-transaction.\(productID).\(appAccountToken.uuidString)"
      guard action != nil else { throw StorePurchaseError.unverified }
      let transaction = StoreTransaction(
        id: signed, productID: productID, signedTransaction: signed, signedAt: Date(), finish: {})
      await keep(transaction)
      return .purchased(transaction)
    }

    func currentTransactions() async -> [StoreTransaction] { purchased }

    nonisolated func unfinishedTransactions() async -> [StoreTransaction] { [] }

    nonisolated func syncWithAppStore() async throws {}

    nonisolated func transactionUpdates() -> AsyncStream<StoreTransaction> {
      AsyncStream { _ in }
    }

    private func keep(_ transaction: StoreTransaction) {
      purchased.append(transaction)
    }

    private static func offer(_ id: String) -> SubscriptionOffer? {
      switch id {
      case monthly:
        SubscriptionOffer(
          id: id, name: "Zenbu Sync", summary: "Sync on all your devices", price: "$4.99",
          period: String(localized: "a month"))
      case yearly:
        SubscriptionOffer(
          id: id, name: "Zenbu Sync, Yearly", summary: "Sync on all your devices",
          price: "$49.99", period: String(localized: "a year"))
      default:
        nil
      }
    }
  }

  final class StandInSubscription: @unchecked Sendable {
    static let shared = StandInSubscription(ProcessInfo.processInfo.environment)
    static let paywallKey = "ZENBU_ACCOUNT_STAND_IN_PAYWALL"
    static let subscriptionKey = "ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION"
    static let appAccountToken = "6f1c3c3e-0b5d-4c4e-9a51-7d0c2f1e8a01"
    private static let paidThrough = "2030-01-01T00:00:00.000Z"

    private let lock = NSLock()
    private let paywall: Bool
    private var held: [String]

    init(_ environment: [String: String]) {
      paywall = environment[Self.paywallKey] == "1"
      held = (environment[Self.subscriptionKey] ?? "").split(separator: ",").map(String.init)
    }

    var refusesSync: Bool { lock.withLock { paywall && !Self.syncs(held) } }

    var runsInTheAppStore: Bool {
      lock.withLock { held.contains { $0.hasPrefix("apple") && !$0.hasSuffix(":ending") } }
    }

    var answer: [String: Any] { lock.withLock { Self.answer(held, paywall: paywall) } }

    func buy(_ body: Data) -> [String: Any] {
      lock.withLock {
        let sent = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        if (sent?["signedTransaction"] as? String)?.isEmpty == false { held = ["apple"] }
        return Self.answer(held, paywall: paywall)
      }
    }

    private static let waiting = [":billing_retry", ":paused", ":pending"]

    private static func syncs(_ held: [String]) -> Bool {
      held.contains { entry in !waiting.contains { entry.hasSuffix($0) } }
    }

    private static func running(_ entry: String) -> [String: Any] {
      let parts = entry.split(separator: ":").map(String.init)
      let apple = parts[0] == "apple"
      let state = parts.count > 1 ? parts[1] : "active"
      return [
        "source": apple ? "apple" : "stripe",
        "productId": apple ? StandInAppStore.monthly : "price_monthly",
        "status": state == "ending" ? "active" : state,
        "expiresAt": state == "pending" ? NSNull() : paidThrough, "willRenew": state != "ending",
        "managedIn": apple ? "app_store" : "website",
      ]
    }

    private static func answer(_ held: [String], paywall: Bool) -> [String: Any] {
      let running = held.map(running)
      let first = running.first
      let subscribed = syncs(held)
      return [
        "status": first?["status"] ?? "none", "active": subscribed,
        "source": first?["source"] ?? NSNull(), "productId": first?["productId"] ?? NSNull(),
        "expiresAt": first?["expiresAt"] ?? NSNull(),
        "willRenew": first?["willRenew"] ?? NSNull(), "managedIn": first?["managedIn"] ?? NSNull(),
        "running": running, "canSubscribe": running.isEmpty,
        "cloudAccess": subscribed ? "subscribed" : paywall ? "subscription_required" : "free",
        "appAccountToken": appAccountToken,
        "offers": [
          "appStore": [StandInAppStore.monthly, StandInAppStore.yearly],
          "website": ["price_monthly"],
        ],
      ]
    }
  }
#endif
