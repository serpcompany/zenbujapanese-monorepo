import Foundation
import Observation
import StoreKit
import SwiftUI

@MainActor
@Observable
final class AccountSubscription: LocalFileStore {
  static let fileName = "account-subscription.json"
  static let approvalWaitsFor: TimeInterval = 24 * 60 * 60
  private static let fileVersion = 1

  private struct Stored: Codable {
    let version: Int
    let userID: String
    let subscription: KnownSubscription
    var waiting: SubscriptionProblem?
    var waitingSince: Date?
  }

  private static let kept: Set<SubscriptionProblem> = [.anotherAccount, .pendingApproval]
  private static let invalidTransaction = "invalid_transaction"

  private(set) var known: KnownSubscription?
  private(set) var offers: [SubscriptionOffer] = []
  private(set) var isWorking = false
  private(set) var appleAccountSubscribed = false
  private var noted: (problem: SubscriptionProblem, account: String?, since: Date)?

  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var onActive: (() -> Void)?
  @ObservationIgnored var onSyncAllowed: (() -> Void)?
  @ObservationIgnored private let api: AccountAPI
  @ObservationIgnored private let tokens: AccountTokens
  @ObservationIgnored private let store: any AppStorePurchases
  @ObservationIgnored private let file: LocalJSONFile
  @ObservationIgnored private let signedInAs: @MainActor () -> String?
  @ObservationIgnored private let now: @MainActor () -> Date
  @ObservationIgnored private let announce: @MainActor (String) -> Void
  @ObservationIgnored private var listening: Task<Void, Never>?
  @ObservationIgnored private var storedFor: String?
  @ObservationIgnored private var asked = 0
  @ObservationIgnored private var taken = 0
  @ObservationIgnored private var settledThrough = 0
  @ObservationIgnored private var delivering: Set<String> = []
  @ObservationIgnored private var delivered: Set<String> = []

  init(
    api: AccountAPI, tokens: AccountTokens, store: any AppStorePurchases, fileURL: URL,
    signedInAs: @escaping @MainActor () -> String?,
    now: @escaping @MainActor () -> Date = Date.init,
    announce: @escaping @MainActor (String) -> Void = {
      AccessibilityNotification.Announcement($0).post()
    }
  ) {
    self.api = api
    self.tokens = tokens
    self.store = store
    self.signedInAs = signedInAs
    self.now = now
    self.announce = announce
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
      if noted == nil, let waiting = stored.waiting {
        noted = (waiting, stored.userID, stored.waitingSince ?? now())
      }
    }
  }

  var syncNeedsSubscription: Bool { current?.syncNeedsSubscription ?? false }

  var current: KnownSubscription? {
    guard let account = signedInAs(), storedFor == account else { return nil }
    return known
  }

  var problem: SubscriptionProblem? {
    guard let noted else { return nil }
    guard Self.kept.contains(noted.problem) else { return noted.problem }
    guard noted.account == signedInAs() else { return nil }
    if noted.problem == .pendingApproval,
      now().timeIntervalSince(noted.since) > Self.approvalWaitsFor
    {
      return nil
    }
    return noted.problem
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

  @discardableResult
  func refresh() async -> Bool {
    guard let account = signedInAs() else { return false }
    asked += 1
    let ask = asked
    do {
      let answer = try await tokens.withAccessToken { [api] in
        try await api.subscription(accessToken: $0)
      }
      take(answer, for: account, asked: ask, fromAPurchase: false)
      if problem == .unreachable || problem == .serviceFailed { note(nil) }
      await sendUnfinished()
      return signedInAs() == account
    } catch AccountServiceError.unreachable {
      note(.unreachable)
      return false
    } catch AccountServiceError.sessionEnded {
      return false
    } catch {
      note(.serviceFailed)
      return false
    }
  }

  func loadOffers() async {
    clearPassingProblem()
    guard await refresh() else {
      offers = []
      return
    }
    await checkTheAppleAccount()
    guard offering, let productIDs = current?.offers.appStore else {
      offers = []
      if problem == nil { note(whyNothingIsOffered()) }
      return
    }
    do {
      offers = try await store.offers(for: productIDs)
      if offers.isEmpty { note(.notAvailableHere) }
    } catch {
      note(.storeUnavailable)
    }
  }

  func subscribe(to productID: String, confirmingWith action: PurchaseAction? = nil) async {
    isWorking = true
    defer { isWorking = false }
    guard await refresh() else { return }
    await checkTheAppleAccount()
    guard offering, let token = current?.appAccountToken else {
      if problem == nil { note(whyNothingIsOffered()) }
      return
    }
    if let problem, problem != .anotherAccount { note(nil) }
    do {
      switch try await store.purchase(productID, for: token, confirmingWith: action) {
      case .purchased(let transaction): await deliver(transaction)
      case .pending: wait(.pendingApproval)
      case .cancelled: break
      }
    } catch {
      note(.storeUnavailable)
    }
  }

  func restore() async {
    isWorking = true
    defer { isWorking = false }
    if problem == .nothingToRestore || problem == .storeUnavailable { note(nil) }
    do {
      try await store.syncWithAppStore()
    } catch {
      note(.storeUnavailable)
      return
    }
    if await sendCurrentTransactions() == 0 {
      await refresh()
      if problem == nil { note(.nothingToRestore) }
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
    note(nil)
    appleAccountSubscribed = false
    delivered = []
    persist()
  }

  func forget() {
    known = nil
    storedFor = nil
    signedOut()
  }

  func persist() {
    writes.save { [self] in
      guard let known, let userID = storedFor else { return await file.write(Data("{}".utf8)) }
      let waiting = noted.flatMap { Self.kept.contains($0.problem) && $0.account == userID ? $0 : nil }
      let stored = Stored(
        version: Self.fileVersion, userID: userID, subscription: known,
        waiting: waiting?.problem, waitingSince: waiting?.since)
      guard let data = try? JSONEncoder.localStore.encode(stored) else { return false }
      return await file.write(data)
    }
  }

  private func note(_ next: SubscriptionProblem?) {
    let shown = problem
    noted = next.map { ($0, signedInAs(), now()) }
    if let next, next != shown { announce(SubscriptionText.problem(next)) }
  }

  private func wait(_ reason: SubscriptionProblem) {
    note(reason)
    persist()
  }

  private func clearPassingProblem() {
    if let problem, !Self.kept.contains(problem) { note(nil) }
  }

  private func whyNothingIsOffered() -> SubscriptionProblem {
    guard let current else { return .notOffered }
    if appleAccountSubscribed { return .appleAccountSubscribed }
    if current.running.contains(where: { $0.status == .pending }) { return .paymentPending }
    if !current.canSubscribe { return .notOffered }
    return current.syncNeedsSubscription ? .notOffered : .notNeeded
  }

  private func checkTheAppleAccount() async {
    appleAccountSubscribed = await subscribedInTheAppStore()
    if problem == .anotherAccount, !appleAccountSubscribed {
      note(nil)
      persist()
    }
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

  private func take(
    _ subscription: KnownSubscription, for account: String, asked ask: Int,
    fromAPurchase: Bool
  ) {
    guard signedInAs() == account else { return }
    if fromAPurchase {
      settledThrough = asked
    } else {
      guard ask > settledThrough, ask >= taken else { return }
    }
    taken = max(taken, ask)
    let wasActive = current?.active ?? false
    let wasRefused = current?.syncNeedsSubscription ?? false
    known = subscription
    storedFor = account
    persist()
    if subscription.active, !wasActive { onActive?() }
    if wasRefused, !subscription.syncNeedsSubscription { onSyncAllowed?() }
  }

  private func deliver(_ transaction: StoreTransaction) async {
    let once = transaction.deliveryKey
    guard let account = signedInAs(), !delivering.contains(once), !delivered.contains(once)
    else { return }
    delivering.insert(once)
    defer { delivering.remove(once) }
    asked += 1
    let ask = asked
    do {
      let answer = try await tokens.withAccessToken { [api] in
        try await api.sendAppleTransaction(transaction.signedTransaction, accessToken: $0)
      }
      take(answer, for: account, asked: ask, fromAPurchase: true)
      note(nil)
      persist()
      await finish(transaction)
    } catch AccountServiceError.refused(409, _, _, _) {
      wait(.anotherAccount)
      await finish(transaction)
    } catch AccountServiceError.refused(400, Self.invalidTransaction, _, _) {
      await finish(transaction)
    } catch AccountServiceError.refused(let status, _, _, _)
      where (400..<500).contains(status) && status != 401 && status != 429
    {
      note(.purchaseNotApplied)
    } catch AccountServiceError.sessionEnded {
      return
    } catch {
      note(.unreachable)
    }
  }

  private func finish(_ transaction: StoreTransaction) async {
    delivered.insert(transaction.deliveryKey)
    await transaction.finish()
  }
}
