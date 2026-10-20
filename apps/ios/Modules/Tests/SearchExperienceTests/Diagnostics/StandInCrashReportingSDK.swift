import Foundation
import Sentry
import Synchronization

@testable import SearchExperience

final class StandInCrashReportingSDK: Sendable {
  struct Start: Equatable, Sendable {
    let dsn: String?
    let environment: String
    let cacheDirectory: String
    let catchesCrashes: Bool
  }

  enum Call: Equatable, Sendable {
    case start(Start)
    case capture(String)
    case flush
    case close
  }

  private let recorded = Mutex<[Call]>([])
  let root = FileManager.default.temporaryDirectory
    .appendingPathComponent("crash-reporting-\(UUID().uuidString)").path

  var calls: [Call] { recorded.withLock { $0 } }
  var starts: [Start] {
    calls.compactMap { if case .start(let start) = $0 { start } else { nil } }
  }
  var closes: Int { calls.filter { $0 == .close }.count }
  var cacheDirectory: String { (root as NSString).appendingPathComponent("Sentry") }
  var problemReportsDirectory: String {
    CrashReportingPolicy.problemReportsDirectory(besides: cacheDirectory)
  }

  var sdk: CrashReportingSDK {
    CrashReportingSDK(
      start: { options in
        let start = Start(
          dsn: options.dsn, environment: options.environment,
          cacheDirectory: options.cacheDirectoryPath, catchesCrashes: options.enableCrashHandler)
        self.recorded.withLock { $0.append(.start(start)) }
      },
      capture: { event in
        let message = event.message?.formatted ?? ""
        self.recorded.withLock { $0.append(.capture(message)) }
      },
      flush: { _ in self.recorded.withLock { $0.append(.flush) } },
      close: { self.recorded.withLock { $0.append(.close) } },
      cacheDirectory: cacheDirectory,
      problemReportsDirectory: problemReportsDirectory)
  }

  func queuedReport(in directory: String) -> String {
    (directory as NSString).appendingPathComponent("io.sentry/dsn-hash/envelopes/report")
  }

  func queueReport(in directory: String) throws {
    let path = queuedReport(in: directory)
    try FileManager.default.createDirectory(
      atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    guard FileManager.default.createFile(atPath: path, contents: Data("{}".utf8)) else {
      throw CocoaError(.fileWriteUnknown)
    }
  }

  func hasQueuedReport(in directory: String) -> Bool {
    FileManager.default.fileExists(atPath: queuedReport(in: directory))
  }

  func removeFiles() {
    try? FileManager.default.removeItem(atPath: root)
  }
}
