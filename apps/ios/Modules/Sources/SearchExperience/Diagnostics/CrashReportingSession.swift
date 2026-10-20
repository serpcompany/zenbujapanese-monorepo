import Foundation

@MainActor
final class CrashReportingSession {
  let build: CrashReportingBuild
  private let defaults: UserDefaults
  private let sdk: CrashReportingSDK
  private(set) var machine = CrashReportingMachine()
  private var flushing: Task<Void, Never>?

  init(build: CrashReportingBuild, defaults: UserDefaults, sdk: CrashReportingSDK) {
    self.build = build
    self.defaults = defaults
    self.sdk = sdk
  }

  func startAtLaunch() {
    if CrashReportingPolicy.sendsCrashReports(in: defaults) {
      apply(machine.turnOn())
    } else if CrashReportingPolicy.hasQueuedReports(in: sdk.problemReportsDirectory) {
      apply(machine.drain())
    }
  }

  func setEnabled(_ enabled: Bool) {
    apply(enabled ? machine.turnOn() : machine.turnOff())
  }

  func send(_ report: ProblemReport) {
    apply(machine.send(), report: report)
  }

  func finishSending() async {
    while let task = flushing {
      await task.value
      if flushing == task { flushing = nil }
    }
  }

  private func apply(_ actions: [CrashReportingMachine.Action], report: ProblemReport? = nil) {
    for action in actions {
      switch action {
      case .startReporting:
        CrashReportingPolicy.moveQueuedReports(
          from: sdk.problemReportsDirectory, to: sdk.cacheDirectory)
        sdk.start(CrashReporter.options(for: build, defaults: defaults))
      case .startSendingOnly:
        sdk.start(CrashReporter.sendingOnlyOptions(for: build, defaults: defaults))
      case .capture:
        if let report { sdk.capture(report.event()) }
      case .flush:
        flush()
      case .close:
        sdk.close()
      case .deleteCrashReports:
        CrashReportingPolicy.moveQueuedReports(
          from: sdk.cacheDirectory, to: sdk.problemReportsDirectory,
          where: ProblemReport.isProblemReport(envelope:))
        try? FileManager.default.removeItem(atPath: sdk.cacheDirectory)
      }
    }
  }

  private func flush() {
    let previous = flushing
    let sdk = sdk
    flushing = Task {
      await previous?.value
      await Task.detached(priority: .utility) {
        sdk.flush(CrashReportingPolicy.flushTimeout)
      }.value
      apply(machine.flushed())
    }
  }
}
