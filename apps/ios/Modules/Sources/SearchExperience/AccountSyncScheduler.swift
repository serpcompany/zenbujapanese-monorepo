import BackgroundTasks
import Foundation

enum SyncRetry {
  static let firstDelay: TimeInterval = 2
  static let longestDelay: TimeInterval = 5 * 60
  static let mostRetries = 10

  static func delay(
    after error: Error, failures: Int,
    jitter: (ClosedRange<Double>) -> Double = { Double.random(in: $0) }
  ) -> TimeInterval? {
    guard let error = error as? AccountServiceError else { return nil }
    switch error {
    case .unreachable:
      return backoff(failures: failures, jitter: jitter)
    case .refused(let status, _, _, let retryAfter) where status == 429:
      return retryAfter ?? backoff(failures: failures, jitter: jitter)
    case .refused(let status, _, _, _) where status >= 500:
      return backoff(failures: failures, jitter: jitter)
    default:
      return nil
    }
  }

  static func isRetryAfter(_ error: Error) -> Bool {
    if case .refused(429, _, _, _) = error as? AccountServiceError { return true }
    return false
  }

  static func backoff(
    failures: Int, jitter: (ClosedRange<Double>) -> Double
  ) -> TimeInterval {
    let ceiling = min(longestDelay, firstDelay * pow(2, Double(min(failures, 16))))
    return jitter(ceiling / 2...ceiling)
  }
}

@MainActor
final class AccountSyncScheduler {
  static let staleAfter: TimeInterval = 15 * 60
  static let afterLocalChange: TimeInterval = 1

  private let sync: AccountSync
  private let now: @MainActor () -> Date
  private var isForeground = true
  private var failures = 0
  private(set) var waitUntil: Date?
  private var waitIsRetryAfter = false
  private var waiting: Task<Void, Never>?
  private var running: Task<Void, Never>?
  private var runsAgain = false

  init(sync: AccountSync, now: @escaping @MainActor () -> Date = Date.init) {
    self.sync = sync
    self.now = now
    sync.onLocalChange = { [weak self] in self?.syncSoon(after: Self.afterLocalChange) }
  }

  func appBecameActive() {
    isForeground = true
    Task {
      await sync.ready()
      if sync.isDue(staleAfter: Self.staleAfter) { syncSoon(after: 0) }
    }
  }

  func appEnteredBackground() {
    isForeground = false
    cancelWaiting()
    requestBackgroundRefresh()
  }

  func syncNow() {
    cancelWaiting()
    guard running == nil else {
      runsAgain = true
      return
    }
    running = Task { await drain() }
  }

  func refresh() async {
    if !waitIsRetryAfter {
      waitUntil = nil
      failures = 0
    }
    syncSoon(after: 0)
    await settled()
  }

  func settled() async {
    while let running {
      await running.value
    }
  }

  func backgroundRefresh() async {
    isForeground = false
    if remainingWait(atLeast: 0) == 0 {
      await withTaskCancellationHandler {
        syncNow()
        await settled()
      } onCancel: {
        Task { @MainActor [weak self] in self?.running?.cancel() }
      }
    }
    requestBackgroundRefresh()
  }

  func stop() {
    cancelWaiting()
    failures = 0
    waitUntil = nil
    waitIsRetryAfter = false
  }

  func remainingWait(atLeast seconds: TimeInterval) -> TimeInterval {
    max(seconds, waitUntil.map { $0.timeIntervalSince(now()) } ?? 0)
  }

  private func syncSoon(after seconds: TimeInterval) {
    let delay = remainingWait(atLeast: seconds)
    guard delay > 0 else { return syncNow() }
    cancelWaiting()
    waiting = Task { [weak self] in
      try? await Task.sleep(for: .seconds(delay))
      guard !Task.isCancelled else { return }
      self?.syncNow()
    }
  }

  private func cancelWaiting() {
    waiting?.cancel()
    waiting = nil
  }

  private func drain() async {
    repeat {
      runsAgain = false
      do {
        try await sync.sync()
        failures = 0
        waitUntil = nil
        waitIsRetryAfter = false
      } catch {
        runsAgain = false
        retry(after: error)
      }
    } while runsAgain
    running = nil
  }

  private func retry(after error: Error) {
    guard let delay = SyncRetry.delay(after: error, failures: failures) else { return }
    failures += 1
    waitUntil = now() + delay
    waitIsRetryAfter = SyncRetry.isRetryAfter(error)
    if isForeground, failures <= SyncRetry.mostRetries { syncSoon(after: delay) }
  }

  private func requestBackgroundRefresh() {
    guard sync.canSync else { return }
    let request = BGAppRefreshTaskRequest(identifier: AccountBackgroundSync.taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: Self.staleAfter)
    try? BGTaskScheduler.shared.submit(request)
  }
}
