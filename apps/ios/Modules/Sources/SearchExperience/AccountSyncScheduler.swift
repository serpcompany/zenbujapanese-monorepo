import BackgroundTasks
import Foundation

enum SyncRetry {
  static let firstDelay: TimeInterval = 2
  static let longestDelay: TimeInterval = 5 * 60
  static let mostFailures = 8

  static func delay(
    after error: Error, failures: Int,
    jitter: (ClosedRange<Double>) -> Double = { Double.random(in: $0) }
  ) -> TimeInterval? {
    guard failures < mostFailures, let error = error as? AccountServiceError else { return nil }
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

  static func backoff(
    failures: Int, jitter: (ClosedRange<Double>) -> Double
  ) -> TimeInterval {
    let ceiling = min(longestDelay, firstDelay * pow(2, Double(failures)))
    return jitter(ceiling / 2...ceiling)
  }
}

@MainActor
final class AccountSyncScheduler {
  static let staleAfter: TimeInterval = 15 * 60
  static let afterLocalChange: Duration = .seconds(1)

  private let sync: AccountSync
  private var isForeground = true
  private var failures = 0
  private var waiting: Task<Void, Never>?
  private var running: Task<Void, Never>?
  private var runsAgain = false

  init(sync: AccountSync) {
    self.sync = sync
    sync.onLocalChange = { [weak self] in self?.syncSoon(after: Self.afterLocalChange) }
  }

  func appBecameActive() {
    isForeground = true
    Task {
      await sync.flush()
      if sync.isDue(staleAfter: Self.staleAfter) { syncNow() }
    }
  }

  func appEnteredBackground() {
    isForeground = false
    waiting?.cancel()
    waiting = nil
    requestBackgroundRefresh()
  }

  func syncNow() {
    waiting?.cancel()
    waiting = nil
    guard running == nil else {
      runsAgain = true
      return
    }
    running = Task { await drain() }
  }

  func refresh() async {
    failures = 0
    syncNow()
    await settled()
  }

  func settled() async {
    while let running {
      await running.value
    }
  }

  func backgroundRefresh() async {
    isForeground = false
    await refresh()
    requestBackgroundRefresh()
  }

  func stop() {
    waiting?.cancel()
    waiting = nil
    failures = 0
  }

  private func syncSoon(after delay: Duration) {
    waiting?.cancel()
    waiting = Task { [weak self] in
      try? await Task.sleep(for: delay)
      guard !Task.isCancelled else { return }
      self?.syncNow()
    }
  }

  private func drain() async {
    repeat {
      runsAgain = false
      do {
        try await sync.sync()
        failures = 0
      } catch {
        retry(after: error)
      }
    } while runsAgain
    running = nil
  }

  private func retry(after error: Error) {
    guard isForeground, let delay = SyncRetry.delay(after: error, failures: failures) else {
      return
    }
    failures += 1
    syncSoon(after: .seconds(delay))
  }

  private func requestBackgroundRefresh() {
    guard sync.canSync else { return }
    let request = BGAppRefreshTaskRequest(identifier: AccountBackgroundSync.taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: Self.staleAfter)
    try? BGTaskScheduler.shared.submit(request)
  }
}
