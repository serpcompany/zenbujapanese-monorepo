import Foundation

final class FrequencyPackDownloadProgress: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let report: FrequencyPackManager.Progress
  private let lock = NSLock()
  private var observation: NSKeyValueObservation?
  private var reportedPercent = -1

  init(report: @escaping FrequencyPackManager.Progress) {
    self.report = report
  }

  func urlSession(_ session: URLSession, didCreateTask task: URLSessionTask) {
    let observation = task.progress.observe(\.fractionCompleted) { [weak self] progress, _ in
      self?.publish(progress.fractionCompleted)
    }
    lock.withLock { self.observation = observation }
  }

  private func publish(_ fraction: Double) {
    let percent = Int(fraction * 100)
    let isNew = lock.withLock {
      guard percent > reportedPercent else { return false }
      reportedPercent = percent
      return true
    }
    if isNew { report(fraction) }
  }
}
