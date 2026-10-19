import Foundation
import Observation

@MainActor
@Observable
final class AccountSubscription: LocalFileStore {
  static let fileName = "account-subscription.json"
  private static let fileVersion = 1

  private struct Stored: Codable {
    let version: Int
    let userID: String
    let subscription: KnownSubscription
  }

  private(set) var known: KnownSubscription?
  private(set) var offers: [SubscriptionOffer] = []
  private(set) var isWorking = false
  private(set) var problem: SubscriptionProblem?

  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var onActive: (() -> Void)?
  @ObservationIgnored private let api: AccountAPI
  @ObservationIgnored private let tokens: AccountTokens
  @ObservationIgnored private let store: any AppStorePurchases
  @ObservationIgnored private let file: LocalJSONFile
  @ObservationIgnored private let signedInAs: @MainActor () -> String?
  @ObservationIgnored private var listening: Task<Void, Never>?
  @ObservationIgnored private var storedFor: String?

  init(
    api: AccountAPI, tokens: AccountTokens, store: any AppStorePurchases, fileURL: URL,
    signedInAs: @escaping @MainActor () -> String?
  ) {
    self.api = api
    self.tokens = tokens
    self.store = store
    self.signedInAs = signedInAs
    file = LocalJSONFile(
      fileURL: fileURL, currentVersion: Self.fileVersion, description: "subscription",
      logCategory: "AccountSubscription")
    writes.load { [self] in
      guard case .current(let data) = await file.read(),
        let stored = try? JSONDecoder.localStore.decode(Stored.self, from: data)
      else { return }
      guard known == nil else { return }
      storedFor = stored.userID
      known = stored.subscription
    }
  }

  var syncNeedsSubscription: Bool { current?.syncNeedsSubscription ?? false }

  var current: KnownSubscription? {
    guard let account = signedInAs(), storedFor == account else { return nil }
    return known
  }

  func signedIn() async {
    await refresh()
    await sendCurrentTransactions()
  }

  func refresh() async {
    guard let account = signedInAs() else { return }
    do {
      let answer = try await tokens.withAccessToken { [api] in
        try await api.subscription(accessToken: $0)
      }
      take(answer, for: account)
      if problem == .unreachable { problem = nil }
    } catch AccountServiceError.unreachable {
      problem = .unreachable
    } catch {
      return
    }
  }

  func loadOffers() async {
    problem = nil
    guard let productIDs = current?.offers.appStore, !productIDs.isEmpty else {
      offers = []
      return
    }
    do {
      offers = try await store.offers(for: productIDs)
      if offers.isEmpty { problem = .storeUnavailable }
    } catch {
      problem = .storeUnavailable
    }
  }

  func subscribe(to productID: String) async {
    guard let current, current.offersAppStorePurchase else {
      problem = .notOffered
      return
    }
    isWorking = true
    problem = nil
    defer { isWorking = false }
    do {
      switch try await store.purchase(productID, for: current.appAccountToken) {
      case .purchased(let transaction): await deliver(transaction)
      case .pending: problem = .pendingApproval
      case .cancelled: break
      }
    } catch {
      problem = .storeUnavailable
    }
  }

  func restore() async {
    isWorking = true
    problem = nil
    defer { isWorking = false }
    do {
      try await store.syncWithAppStore()
    } catch {
      problem = .storeUnavailable
    }
    if await !sendCurrentTransactions() { await refresh() }
  }

  func listen() {
    guard listening == nil else { return }
    let updates = store.transactionUpdates()
    listening = Task { [weak self] in
      for await transaction in updates { await self?.deliver(transaction) }
    }
  }

  func forget() {
    known = nil
    storedFor = nil
    offers = []
    problem = nil
    persist()
  }

  func persist() {
    writes.save { [self] in
      guard let known, let userID = storedFor else { return await file.write(Data("{}".utf8)) }
      let stored = Stored(version: Self.fileVersion, userID: userID, subscription: known)
      guard let data = try? JSONEncoder.localStore.encode(stored) else { return false }
      return await file.write(data)
    }
  }

  @discardableResult
  private func sendCurrentTransactions() async -> Bool {
    guard current?.offers.appStore.isEmpty == false else { return false }
    let transactions = await store.currentTransactions()
    for transaction in transactions { await deliver(transaction) }
    return !transactions.isEmpty
  }

  private func take(_ subscription: KnownSubscription, for account: String) {
    guard signedInAs() == account else { return }
    let wasActive = current?.active ?? false
    known = subscription
    storedFor = account
    persist()
    if subscription.active, !wasActive { onActive?() }
  }

  private func deliver(_ transaction: StoreTransaction) async {
    guard let account = signedInAs() else { return }
    do {
      let answer = try await tokens.withAccessToken { [api] in
        try await api.sendAppleTransaction(transaction.signedTransaction, accessToken: $0)
      }
      take(answer, for: account)
      problem = nil
      await transaction.finish()
    } catch AccountServiceError.refused(409, _, _, _) {
      problem = .anotherAccount
      await transaction.finish()
    } catch AccountServiceError.refused(let status, _, _, _)
      where (400..<500).contains(status) && status != 401 && status != 429
    {
      await transaction.finish()
    } catch AccountServiceError.sessionEnded {
      return
    } catch {
      problem = .unreachable
    }
  }
}
