import Foundation
import Sentry
import Synchronization
import Testing

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

  static func envelope(of event: Event) throws -> Data {
    let payload = event.serialize()
    try #require(JSONSerialization.isValidJSONObject(payload))
    let body = try JSONSerialization.data(withJSONObject: payload)
    let lines = [
      try JSONSerialization.data(withJSONObject: ["event_id": event.eventId.sentryIdString]),
      try JSONSerialization.data(withJSONObject: ["type": "event", "length": body.count]),
      body,
    ]
    return Data(lines.joined(separator: Data("\n".utf8)))
  }

  func queuedReport(in directory: String, named name: String = "report") -> String {
    (directory as NSString).appendingPathComponent("io.sentry/dsn-hash/envelopes/\(name)")
  }

  func queueReport(
    in directory: String, named name: String = "report", contents: Data = Data("{}".utf8)
  ) throws {
    let path = queuedReport(in: directory, named: name)
    try FileManager.default.createDirectory(
      atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    guard FileManager.default.createFile(atPath: path, contents: contents) else {
      throw CocoaError(.fileWriteUnknown)
    }
  }

  func hasQueuedReport(in directory: String, named name: String = "report") -> Bool {
    FileManager.default.fileExists(atPath: queuedReport(in: directory, named: name))
  }

  func removeFiles() {
    try? FileManager.default.removeItem(atPath: root)
  }
}
