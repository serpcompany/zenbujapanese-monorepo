import Foundation
import Sentry
import Testing

@testable import SearchExperience

@Suite("Crash reports switch")
@MainActor
struct CrashReporterSwitchTests {
  private final class StandInSDK {
    var running = false
    var started: [Options] = []
    var closes = 0

    var sdk: CrashReportingSDK {
      CrashReportingSDK(
        isEnabled: { self.running },
        start: { options in
          self.started.append(options)
          self.running = true
        },
        close: {
          self.closes += 1
          self.running = false
        })
    }
  }

  private static let build = CrashReportingBuild(
    dsn: "https://key@o1.ingest.us.sentry.io/2", environment: "qa")

  private func withDefaults(_ body: (UserDefaults) throws -> Void) throws {
    let suite = "crash-reporting-switch-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    try body(defaults)
  }

  @Test("turning the switch off closes Sentry at once")
  func turningOffCloses() throws {
    try withDefaults { defaults in
      let stand = StandInSDK()
      stand.running = true
      CrashReporter.setEnabled(false, build: Self.build, defaults: defaults, sdk: stand.sdk)
      #expect(stand.closes == 1)
      #expect(!stand.running)
      CrashReporter.setEnabled(false, build: Self.build, defaults: defaults, sdk: stand.sdk)
      #expect(stand.closes == 1)
      #expect(stand.started.isEmpty)
    }
  }

  @Test("turning it back on starts Sentry again, with the app's options, without a relaunch")
  func turningOnStarts() throws {
    try withDefaults { defaults in
      let stand = StandInSDK()
      CrashReporter.setEnabled(true, build: Self.build, defaults: defaults, sdk: stand.sdk)
      CrashReporter.setEnabled(true, build: Self.build, defaults: defaults, sdk: stand.sdk)
      #expect(stand.started.count == 1)
      #expect(stand.closes == 0)
      let options = try #require(stand.started.first)
      #expect(options.dsn == Self.build.dsn)
      #expect(options.environment == "qa")
      #expect(!options.sendDefaultPii)
      #expect(options.beforeSend != nil)
      let user = options.initialScope(Scope()).serialize()["user"] as? [String: Any]
      #expect(user?["id"] as? String == defaults.string(forKey: CrashReportingPolicy.installIDKey))

      CrashReporter.setEnabled(false, build: Self.build, defaults: defaults, sdk: stand.sdk)
      CrashReporter.setEnabled(true, build: Self.build, defaults: defaults, sdk: stand.sdk)
      #expect(stand.closes == 1)
      #expect(stand.started.count == 2)
      #expect(stand.running)
    }
  }

  @Test("the offline test switch reaches Sentry only in a qa build")
  func offlineSwitchOnlyInQA() throws {
    try withDefaults { defaults in
      defaults.set(true, forKey: CrashReportTest.offlineKey)
      let qa = CrashReporter.options(for: Self.build, defaults: defaults)
      let production = CrashReporter.options(
        for: CrashReportingBuild(dsn: Self.build.dsn, environment: "production"), defaults: defaults)
      #expect(qa.urlSession != nil)
      #expect(production.urlSession == nil)
    }
  }

  @Test("a build with no destination ignores the switch")
  func noDestinationIgnoresTheSwitch() throws {
    try withDefaults { defaults in
      let stand = StandInSDK()
      CrashReporter.setEnabled(true, build: nil, defaults: defaults, sdk: stand.sdk)
      stand.running = true
      CrashReporter.setEnabled(false, build: nil, defaults: defaults, sdk: stand.sdk)
      #expect(stand.started.isEmpty)
      #expect(stand.closes == 0)
    }
  }
}
