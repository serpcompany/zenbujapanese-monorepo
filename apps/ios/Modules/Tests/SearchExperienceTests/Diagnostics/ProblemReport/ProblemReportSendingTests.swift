import Foundation
import Sentry
import Testing

@testable import SearchExperience

@Suite("Sending a problem report")
@MainActor
struct ProblemReportSendingTests {
  static let report = ProblemReport(
    description: "Search froze", email: "", details: ProblemReportFixtures.details)

  private static var reportingStart: StandInCrashReportingSDK.Start {
    StandInCrashReportingSDK.Start(
      dsn: CrashReporterSwitchTests.build.dsn, environment: "qa",
      cacheDirectory: CrashReportingSDK.sentry.cacheDirectory, catchesCrashes: true)
  }

  private static var sendingOnlyStart: StandInCrashReportingSDK.Start {
    StandInCrashReportingSDK.Start(
      dsn: CrashReporterSwitchTests.build.dsn, environment: "qa",
      cacheDirectory: CrashReportingSDK.sentry.problemReportsDirectory, catchesCrashes: false)
  }

  @Test("with crash reports on, a report goes with them")
  func sendsWithCrashReports() async throws {
    try await CrashReporterSwitchTests.withSession(reportsOn: true) { session, stand, _ in
      session.startAtLaunch()
      session.send(Self.report)
      await session.finishSending()
      #expect(stand.calls == [.start(Self.reportingStart), .capture("Search froze")])
    }
  }

  @Test("with crash reports off, Sentry starts just to send it, in its own folder, then closes")
  func sendsWithCrashReportsOff() async throws {
    try await CrashReporterSwitchTests.withSession(reportsOn: false) { session, stand, _ in
      session.startAtLaunch()
      #expect(stand.calls.isEmpty)
      session.send(Self.report)
      await session.finishSending()
      #expect(
        stand.calls == [.start(Self.sendingOnlyStart), .capture("Search froze"), .flush, .close])
      #expect(session.machine.mode == .off)
    }
  }

  @Test("turning crash reports on while a report sends starts them once it's sent")
  func turningOnWhileSending() async throws {
    try await CrashReporterSwitchTests.withSession(reportsOn: false) { session, stand, _ in
      session.send(Self.report)
      session.setEnabled(true)
      await session.finishSending()
      #expect(
        stand.calls == [
          .start(Self.sendingOnlyStart), .capture("Search froze"), .flush, .close,
          .start(Self.reportingStart),
        ])
      #expect(session.machine.mode == .reporting)
    }
  }

  @Test("a report that couldn't go is sent at the next launch, even with crash reports off")
  func waitingReportGoesAtLaunch() async throws {
    try await CrashReporterSwitchTests.withSession(reportsOn: false) { session, stand, _ in
      try stand.queueReport(in: stand.problemReportsDirectory)
      session.startAtLaunch()
      await session.finishSending()
      #expect(stand.calls == [.start(Self.sendingOnlyStart), .flush, .close])
    }
  }

  @Test("with crash reports on, a waiting report joins their queue before Sentry starts")
  func waitingReportJoinsCrashReports() async throws {
    try await CrashReporterSwitchTests.withSession(reportsOn: true) { session, stand, _ in
      try stand.queueReport(in: stand.problemReportsDirectory)
      session.startAtLaunch()
      #expect(stand.hasQueuedReport(in: stand.cacheDirectory))
      #expect(!stand.hasQueuedReport(in: stand.problemReportsDirectory))
      #expect(stand.calls == [.start(Self.reportingStart)])
    }
  }

  @Test("a launch with crash reports off and nothing waiting never starts Sentry")
  func nothingWaitingNeverStarts() async throws {
    try await CrashReporterSwitchTests.withSession(reportsOn: false) { session, stand, _ in
      session.startAtLaunch()
      await session.finishSending()
      #expect(stand.calls.isEmpty)
    }
  }

  @Test("Sentry sending only a report catches no crash, freeze, or watchdog termination")
  func sendingOnlyCatchesNothing() async throws {
    try await CrashReporterSwitchTests.withDefaults { defaults in
      let options = CrashReporter.sendingOnlyOptions(
        for: CrashReporterSwitchTests.build, defaults: defaults)
      #expect(!options.enableCrashHandler)
      #expect(!options.enableAppHangTracking)
      #expect(!options.enableWatchdogTerminationTracking)
      #expect(options.cacheDirectoryPath == CrashReportingSDK.sentry.problemReportsDirectory)
    }
  }

  @Test("Sentry sending only a report sends nothing else, and keeps the install ID")
  func sendingOnlySendsOnlyReports() async throws {
    try await CrashReporterSwitchTests.withDefaults { defaults in
      let options = CrashReporter.sendingOnlyOptions(
        for: CrashReporterSwitchTests.build, defaults: defaults)
      let problem = HandledProblem(area: .accountSync, code: "refused_400").event()
      #expect(options.beforeSend?(problem) == nil)
      let sent = try #require(options.beforeSend?(Self.report.event()))
      #expect(sent.user?.userId == defaults.string(forKey: CrashReportingPolicy.installIDKey))
      #expect(sent.message?.formatted == "Search froze")
    }
  }
}
