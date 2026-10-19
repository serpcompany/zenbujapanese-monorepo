import Foundation

struct KnownSubscription: Codable, Equatable, Sendable {
  enum Status: String, Codable, Sendable {
    case none
    case active
    case gracePeriod = "grace_period"
    case billingRetry = "billing_retry"
    case pending
    case paused
    case expired
    case revoked

    init(from decoder: Decoder) throws {
      let raw = try decoder.singleValueContainer().decode(String.self)
      self = Status(rawValue: raw) ?? .none
    }
  }

  enum ManagedIn: String, Codable, Sendable {
    case appStore = "app_store"
    case website
  }

  enum CloudAccess: String, Codable, Sendable {
    case subscribed
    case free
    case subscriptionRequired = "subscription_required"

    init(from decoder: Decoder) throws {
      let raw = try decoder.singleValueContainer().decode(String.self)
      self = CloudAccess(rawValue: raw) ?? .free
    }
  }

  struct Running: Codable, Equatable, Sendable {
    let status: Status
    let expiresAt: Date?
    let willRenew: Bool?
    let managedIn: ManagedIn?

    init(status: Status, expiresAt: Date?, willRenew: Bool?, managedIn: ManagedIn?) {
      self.status = status
      self.expiresAt = expiresAt
      self.willRenew = willRenew
      self.managedIn = managedIn
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      status = try container.decode(Status.self, forKey: .status)
      expiresAt = try container.decodeIfPresent(Date.self, forKey: .expiresAt)
      willRenew = try container.decodeIfPresent(Bool.self, forKey: .willRenew)
      managedIn = try? container.decodeIfPresent(ManagedIn.self, forKey: .managedIn)
    }
  }

  struct Offers: Codable, Equatable, Sendable {
    let appStore: [String]
    let website: [String]
  }

  let status: Status
  let active: Bool
  let expiresAt: Date?
  let willRenew: Bool?
  let managedIn: ManagedIn?
  let running: [Running]
  let canSubscribe: Bool
  let cloudAccess: CloudAccess
  let appAccountToken: UUID
  let offers: Offers

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    status = try container.decode(Status.self, forKey: .status)
    active = try container.decode(Bool.self, forKey: .active)
    expiresAt = try container.decodeIfPresent(Date.self, forKey: .expiresAt)
    willRenew = try container.decodeIfPresent(Bool.self, forKey: .willRenew)
    managedIn = try? container.decodeIfPresent(ManagedIn.self, forKey: .managedIn)
    running = try container.decodeIfPresent([Running].self, forKey: .running) ?? []
    canSubscribe = try container.decode(Bool.self, forKey: .canSubscribe)
    cloudAccess = try container.decode(CloudAccess.self, forKey: .cloudAccess)
    appAccountToken = try container.decode(UUID.self, forKey: .appAccountToken)
    offers = try container.decode(Offers.self, forKey: .offers)
  }

  var syncNeedsSubscription: Bool { cloudAccess == .subscriptionRequired }
  var offersAppStorePurchase: Bool { canSubscribe && !offers.appStore.isEmpty }
  var runsInTheAppStore: Bool { running.contains { $0.managedIn == .appStore } }

  var shown: [Running] {
    if !running.isEmpty { return running }
    guard status != .none else { return [] }
    return [
      Running(status: status, expiresAt: expiresAt, willRenew: willRenew, managedIn: managedIn)
    ]
  }
}

struct SubscriptionOffer: Identifiable, Equatable, Sendable {
  let id: String
  let name: String
  let summary: String
  let price: String
  let period: String
}

struct StoreTransaction: Sendable {
  let signedTransaction: String
  let finish: @Sendable () async -> Void
}

enum StorePurchase: Sendable {
  case purchased(StoreTransaction)
  case pending
  case cancelled
}

protocol AppStorePurchases: Sendable {
  func offers(for productIDs: [String]) async throws -> [SubscriptionOffer]
  @MainActor func purchase(_ productID: String, for appAccountToken: UUID) async throws
    -> StorePurchase
  func currentTransactions() async -> [StoreTransaction]
  func syncWithAppStore() async throws
  func transactionUpdates() -> AsyncStream<StoreTransaction>
}

enum SubscriptionProblem: Equatable, Sendable {
  case anotherAccount
  case unreachable
  case storeUnavailable
  case pendingApproval
  case notOffered
}

struct AccountDeletion: Decodable, Sendable {
  private enum CodingKeys: String, CodingKey { case appStoreSubscriptionContinues }

  let appStoreSubscriptionContinues: Bool

  init(appStoreSubscriptionContinues: Bool) {
    self.appStoreSubscriptionContinues = appStoreSubscriptionContinues
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    appStoreSubscriptionContinues =
      try container.decodeIfPresent(Bool.self, forKey: .appStoreSubscriptionContinues) ?? false
  }
}
