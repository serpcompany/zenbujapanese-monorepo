import Foundation

#if DEBUG
  actor StandInAppStore: AppStorePurchases {
    static let monthly = "com.zenbujapanese.sync.monthly"
    static let yearly = "com.zenbujapanese.sync.yearly"

    private var purchased: [StoreTransaction] = []

    func offers(for productIDs: [String]) async throws -> [SubscriptionOffer] {
      productIDs.compactMap(Self.offer)
    }

    @MainActor
    func purchase(_ productID: String, for appAccountToken: UUID) async throws -> StorePurchase {
      let transaction = StoreTransaction(
        signedTransaction: "stand-in-transaction.\(productID).\(appAccountToken.uuidString)",
        finish: {})
      await keep(transaction)
      return .purchased(transaction)
    }

    func currentTransactions() async -> [StoreTransaction] { purchased }

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

    private let lock = NSLock()
    private let paywall: Bool
    private var source: String?

    init(_ environment: [String: String]) {
      paywall = environment[Self.paywallKey] == "1"
      source = environment[Self.subscriptionKey]
    }

    var refusesSync: Bool { lock.withLock { paywall && source == nil } }

    var runsInTheAppStore: Bool { lock.withLock { source == "apple" } }

    var answer: [String: Any] { lock.withLock { Self.answer(source: source, paywall: paywall) } }

    func buy(_ body: Data) -> [String: Any] {
      lock.withLock {
        let sent = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        if (sent?["signedTransaction"] as? String)?.isEmpty == false { source = "apple" }
        return Self.answer(source: source, paywall: paywall)
      }
    }

    private static func answer(source: String?, paywall: Bool) -> [String: Any] {
      let subscribed = source != nil
      let product: Any =
        switch source {
        case "apple": StandInAppStore.monthly
        case "stripe": "price_monthly"
        default: NSNull()
        }
      let managedIn: Any =
        switch source {
        case "apple": "app_store"
        case "stripe": "website"
        default: NSNull()
        }
      let running: [[String: Any]] =
        subscribed
        ? [
          [
            "source": source ?? "", "productId": product, "status": "active",
            "expiresAt": "2030-01-01T00:00:00.000Z", "willRenew": true, "managedIn": managedIn,
          ]
        ] : []
      return [
        "status": subscribed ? "active" : "none", "active": subscribed,
        "source": source ?? NSNull(), "productId": product,
        "expiresAt": subscribed ? "2030-01-01T00:00:00.000Z" : NSNull(),
        "willRenew": subscribed ? true : NSNull(), "managedIn": managedIn, "running": running,
        "canSubscribe": !subscribed,
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
