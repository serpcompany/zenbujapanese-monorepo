import Foundation
import Observation
import StoreKit
import SwiftUI

@MainActor
@Observable
final class AccountSubscription: LocalFileStore {
  static let fileName = "account-subscription.json"
  private static let fileVersion = 1

  private struct Stored: Codable {
    let version: Int
    let userID: String
    let subscription: KnownSubscription
    var waiting: SubscriptionProblem?
  }

  private static let kept: Set<SubscriptionProblem> = [.anotherAccount, .pendingApproval]

  private(set) var known: KnownSubscription?
  private(set) var offers: [SubscriptionOffer] = []
  private(set) var isWorking = false
  private(set) var problem: SubscriptionProblem?
  private(set) var appleAccountSubscribed = false

  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var onActive: (() -> Void)?
  @ObservationIgnored var onSyncAllowed: (() -> Void)?
  @ObservationIgnored private let api: AccountAPI
  @ObservationIgnored private let tokens: AccountTokens
  @ObservationIgnored private let store: any AppStorePurchases
  @ObservationIgnored private let file: LocalJSONFile
  @ObservationIgnored private let signedInAs: @MainActor () -> String?
  @ObservationIgnored private var listening: Task<Void, Never>?
  @ObservationIgnored private var storedFor: String?
  @ObservationIgnored private var asked = 0
  @ObservationIgnored private var taken = 0
  @ObservationIgnored private var delivering: Set<String> = []
  @ObservationIgnored private var delivered: Set<String> = []

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
      problem = stored.waiting
    }
  }

  var syncNeedsSubscription: Bool { current?.syncNeedsSubscription ?? false }

  var current: KnownSubscription? {
    guard let account = signedInAs(), storedFor == account else { return nil }
    return known
  }

  var offering: Bool {
    current?.offersAppStorePurchase == true && !appleAccountSubscribed
      && problem != .anotherAccount
  }

  func signedIn() async {
    delivered = []
    await refresh()
    await sendCurrentTransactions()
  }

  func refresh() async {
    guard let account = signedInAs() else { return }
    asked += 1
    let ask = asked
    do {
      let answer = try await tokens.withAccessToken { [api] in
        try await api.subscription(accessToken: $0)
      }
      take(answer, for: account, asked: ask)
      if problem == .unreachable { problem = nil }
      await sendUnfinished()
    } catch AccountServiceError.unreachable {
      problem = .unreachable
    } catch {
      return
    }
  }

  func loadOffers() async {
    if let problem, !Self.kept.contains(problem) { self.problem = nil }
    await refresh()
    appleAccountSubscribed = await subscribedInTheAppStore()
    guard offering, let productIDs = current?.offers.appStore else {
      offers = []
      return
    }
    do {
      offers = try await store.offers(for: productIDs)
      if offers.isEmpty { problem = .notAvailableHere }
    } catch {
      problem = .storeUnavailable
    }
  }

  func subscribe(to productID: String, confirmingWith action: PurchaseAction? = nil) async {
    isWorking = true
    defer { isWorking = false }
    await refresh()
    appleAccountSubscribed = await subscribedInTheAppStore()
    guard offering, let token = current?.appAccountToken else {
      if problem == nil { problem = .notOffered }
      return
    }
    if let problem, !Self.kept.contains(problem) { self.problem = nil }
    do {
      switch try await store.purchase(productID, for: token, confirmingWith: action) {
      case .purchased(let transaction): await deliver(transaction)
      case .pending: wait(.pendingApproval)
      case .cancelled: break
      }
    } catch {
      problem = .storeUnavailable
    }
  }

  func restore() async {
    isWorking = true
    defer { isWorking = false }
    if problem == .nothingToRestore || problem == .storeUnavailable { problem = nil }
    do {
      try await store.syncWithAppStore()
    } catch {
      problem = .storeUnavailable
      return
    }
    if await sendCurrentTransactions() == 0 {
      await refresh()
      if problem == nil { problem = .nothingToRestore }
    }
  }

  func listen() {
    guard listening == nil else { return }
    let updates = store.transactionUpdates()
    listening = Task { [weak self] in
      for await transaction in updates { await self?.deliver(transaction) }
    }
  }

  func sendUnfinished() async {
    guard signedInAs() != nil else { return }
    for transaction in await store.unfinishedTransactions() { await deliver(transaction) }
  }

  func signedOut() {
    offers = []
    problem = nil
    appleAccountSubscribed = false
    delivered = []
  }

  func forget() {
    known = nil
    storedFor = nil
    signedOut()
    persist()
  }

  func persist() {
    writes.save { [self] in
      guard let known, let userID = storedFor else { return await file.write(Data("{}".utf8)) }
      let stored = Stored(
        version: Self.fileVersion, userID: userID, subscription: known,
        waiting: problem.flatMap { Self.kept.contains($0) ? $0 : nil })
      guard let data = try? JSONEncoder.localStore.encode(stored) else { return false }
      return await file.write(data)
    }
  }

  private func wait(_ reason: SubscriptionProblem) {
    problem = reason
    persist()
  }

  private func subscribedInTheAppStore() async -> Bool {
    guard let products = current?.offers.appStore, !products.isEmpty else { return false }
    let entitled = await store.currentTransactions().map(\.productID)
    return entitled.contains { products.contains($0) }
  }

  @discardableResult
  private func sendCurrentTransactions() async -> Int {
    guard current?.offers.appStore.isEmpty == false else { return 0 }
    let transactions = await store.currentTransactions()
    for transaction in transactions { await deliver(transaction) }
    return transactions.count
  }

  private func take(_ subscription: KnownSubscription, for account: String, asked ask: Int) {
    guard signedInAs() == account, ask >= taken else { return }
    taken = ask
    let wasActive = current?.active ?? false
    let wasRefused = current?.syncNeedsSubscription ?? false
    known = subscription
    storedFor = account
    persist()
    if subscription.active, !wasActive { onActive?() }
    if wasRefused, !subscription.syncNeedsSubscription { onSyncAllowed?() }
  }

  private func deliver(_ transaction: StoreTransaction) async {
    guard let account = signedInAs(), !delivering.contains(transaction.id),
      !delivered.contains(transaction.id)
    else { return }
    delivering.insert(transaction.id)
    defer { delivering.remove(transaction.id) }
    asked += 1
    let ask = asked
    do {
      let answer = try await tokens.withAccessToken { [api] in
        try await api.sendAppleTransaction(transaction.signedTransaction, accessToken: $0)
      }
      take(answer, for: account, asked: ask)
      problem = nil
      persist()
      await finish(transaction)
    } catch AccountServiceError.refused(409, _, _, _) {
      wait(.anotherAccount)
      await finish(transaction)
    } catch AccountServiceError.refused(let status, _, _, _)
      where (400..<500).contains(status) && status != 401 && status != 429
    {
      await finish(transaction)
    } catch AccountServiceError.sessionEnded {
      return
    } catch {
      problem = .unreachable
    }
  }

  private func finish(_ transaction: StoreTransaction) async {
    delivered.insert(transaction.id)
    await transaction.finish()
  }
}
