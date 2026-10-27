import Foundation
import Sentry
import Testing

@testable import SearchExperience

@Suite("Crash reports switch")
@MainActor
struct CrashReporterSwitchTests {
  static let build = CrashReportingBuild(
    dsn: "https://key@o1.ingest.us.sentry.io/2", environment: "qa")

  static func withDefaults(_ body: @MainActor (UserDefaults) async throws -> Void) async throws {
    let defaults = MemoryDefaults()
    try await body(defaults)
  }

  static func withSession(
    reportsOn: Bool? = nil,
    _ body: @MainActor (CrashReportingSession, StandInCrashReportingSDK, UserDefaults) async throws -> Void
  ) async throws {
    try await withDefaults { defaults in
      if let reportsOn { defaults.set(reportsOn, forKey: CrashReportingPolicy.preferenceKey) }
      let stand = StandInCrashReportingSDK()
      defer { stand.removeFiles() }
      let session = CrashReportingSession(build: build, defaults: defaults, sdk: stand.sdk)
      try await body(session, stand, defaults)
    }
  }

  @Test("turning the switch off closes Sentry at once")
  func turningOffCloses() async throws {
    try await Self.withSession { session, stand, _ in
      session.setEnabled(true)
      session.setEnabled(false)
      #expect(stand.closes == 1)
      session.setEnabled(false)
      #expect(stand.closes == 1)
      #expect(stand.starts.count == 1)
    }
  }

  @Test("turning it back on starts Sentry again, with the app's options, without a relaunch")
  func turningOnStarts() async throws {
    try await Self.withSession { session, stand, _ in
      session.setEnabled(true)
      session.setEnabled(true)
      #expect(stand.starts.count == 1)
      #expect(stand.closes == 0)
      let start = try #require(stand.starts.first)
      #expect(start.dsn == Self.build.dsn)
      #expect(start.environment == "qa")
      #expect(start.catchesCrashes)
      #expect(start.cacheDirectory == CrashReportingSDK.sentry.cacheDirectory)

      session.setEnabled(false)
      session.setEnabled(true)
      #expect(stand.closes == 1)
      #expect(stand.starts.count == 2)
      #expect(session.machine.mode == .reporting)
    }
  }

  @Test("the options Sentry starts with keep the install ID and the scrubber")
  func optionsKeepTheInstallIDAndScrubber() async throws {
    try await Self.withDefaults { defaults in
      let options = CrashReporter.options(for: Self.build, defaults: defaults)
      #expect(!options.sendDefaultPii)
      #expect(options.beforeSend != nil)
      let user = options.initialScope(Scope()).serialize()["user"] as? [String: Any]
      #expect(user?["id"] as? String == defaults.string(forKey: CrashReportingPolicy.installIDKey))
    }
  }

  @Test("turning the switch off deletes the reports Sentry keeps on the device, so none is sent later")
  func turningOffDeletesPendingReports() async throws {
    try await Self.withSession { session, stand, _ in
      try stand.queueReport(in: stand.cacheDirectory)
      session.setEnabled(true)
      #expect(stand.hasQueuedReport(in: stand.cacheDirectory))
      session.setEnabled(false)
      #expect(!stand.hasQueuedReport(in: stand.cacheDirectory))
      #expect(!FileManager.default.fileExists(atPath: stand.cacheDirectory))

      try stand.queueReport(in: stand.cacheDirectory)
      session.setEnabled(false)
      #expect(!stand.hasQueuedReport(in: stand.cacheDirectory))
    }
  }

  @Test("turning the switch off keeps a problem report still waiting to be sent")
  func turningOffKeepsWaitingProblemReports() async throws {
    try await Self.withSession { session, stand, _ in
      try stand.queueReport(in: stand.problemReportsDirectory)
      session.setEnabled(false)
      #expect(stand.hasQueuedReport(in: stand.problemReportsDirectory))
    }
  }

  @Test("turning the switch off keeps a problem report waiting with the crash reports, for later")
  func turningOffKeepsAProblemReportFromTheirQueue() async throws {
    try await Self.withSession { session, stand, _ in
      session.setEnabled(true)
      let report = try StandInCrashReportingSDK.envelope(of: ProblemReportSendingTests.report.event())
      try stand.queueReport(in: stand.cacheDirectory, named: "problem", contents: report)
      try stand.queueReport(in: stand.cacheDirectory)
      session.setEnabled(false)
      #expect(stand.hasQueuedReport(in: stand.problemReportsDirectory, named: "problem"))
      #expect(!stand.hasQueuedReport(in: stand.problemReportsDirectory))
      #expect(!FileManager.default.fileExists(atPath: stand.cacheDirectory))
    }
  }

  @Test("the folder the switch empties is the one Sentry is told to keep its reports in")
  func deletesSentrysOwnFolder() async throws {
    try await Self.withDefaults { defaults in
      let options = CrashReporter.options(for: Self.build, defaults: defaults)
      #expect(CrashReportingSDK.sentry.cacheDirectory == options.cacheDirectoryPath)
      #expect(options.cacheDirectoryPath.hasSuffix("/\(CrashReporter.bundleID)/Sentry"))
      #expect(
        CrashReportingSDK.sentry.problemReportsDirectory.hasSuffix(
          "/\(CrashReporter.bundleID)/Problem Reports"))
    }
  }

  @Test("the offline test switch reaches Sentry only in a qa build")
  func offlineSwitchOnlyInQA() async throws {
    try await Self.withDefaults { defaults in
      defaults.set(true, forKey: CrashReportTest.offlineKey)
      let qa = CrashReporter.options(for: Self.build, defaults: defaults)
      let production = CrashReporter.options(
        for: CrashReportingBuild(dsn: Self.build.dsn, environment: "production"), defaults: defaults)
      #expect(qa.urlSession != nil)
      #expect(production.urlSession == nil)
      #expect(CrashReporter.sendingOnlyOptions(for: Self.build, defaults: defaults).urlSession != nil)
    }
  }
}
