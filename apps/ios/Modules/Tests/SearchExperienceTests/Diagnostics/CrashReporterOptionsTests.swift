import Foundation
import Sentry
import Testing

@testable import SearchExperience

@Suite("Crash reporter options")
struct CrashReporterOptionsTests {
  private static let dsn = "https://key@o1.ingest.us.sentry.io/2"

  @discardableResult
  private static func configured(
    _ options: Options = Options()
  ) -> (options: Options, defaultCaches: String) {
    let caches = options.cacheDirectoryPath
    CrashReporter.configure(
      options, dsn: dsn, environment: "qa", installID: "install-id",
      bundleID: "com.zenbujapanese.dictionary")
    return (options, caches)
  }

  @Test("the destination, environment, and Sentry's folder are the app's own")
  func destinationAndFolder() {
    let (options, caches) = Self.configured()
    #expect(options.dsn == Self.dsn)
    #expect(options.environment == "qa")
    #expect(options.cacheDirectoryPath == caches + "/com.zenbujapanese.dictionary/Sentry")
  }

  @Test("crashes, freezes of 2 seconds, and watchdog terminations are reported")
  func crashesFreezesAndWatchdogTerminationsAreOn() {
    let options = Self.configured().options
    #expect(options.enableCrashHandler)
    #expect(options.enableAppHangTracking)
    #expect(options.appHangTimeoutInterval == 2)
    #expect(options.enableWatchdogTerminationTracking)
    #expect(options.attachStacktrace)
  }

  @Test("nothing personal, no sessions, breadcrumbs, network capture, or tracing")
  func everythingElseIsOff() {
    let options = Self.configured().options
    #expect(!options.sendDefaultPii)
    #expect(!options.enableAutoSessionTracking)
    #expect(!options.enableAutoBreadcrumbTracking)
    #expect(!options.enableNetworkBreadcrumbs)
    #expect(!options.enableNetworkTracking)
    #expect(!options.enableCaptureFailedRequests)
    #expect(!options.enableAutoPerformanceTracing)
    #expect(!options.enableFileIOTracing)
    #expect(!options.enableCoreDataTracing)
    #expect(options.tracesSampleRate == nil)
    #expect(!options.enableMetricKit)
    #expect(!options.enableLogs)
    #expect(!options.enableMetrics)
    #expect(!options.sendClientReports)
  }

  @Test("the app's own code and its requests are left alone: no swizzling, no trace headers")
  func swizzlingAndTraceHeadersAreOff() {
    let options = Self.configured().options
    #expect(!options.enableSwizzling)
    #expect(options.tracePropagationTargets.isEmpty)
  }

  @Test("turning reports off doesn't wait on the network")
  func shutdownDoesNotWait() {
    #expect(Self.configured().options.shutdownTimeInterval == 0)
  }

  @Test("each device's own options are off: screenshots, view hierarchy, and UI tracing")
  func devicesOwnOptionsAreOff() {
    let options = Self.configured().options
    let expected: Set<String> =
      ThisDevice.name == "Mac"
      ? ["enableUncaughtNSExceptionReporting"]
      : [
        "attachScreenshot", "attachViewHierarchy", "enableUserInteractionTracing",
        "enableUIViewControllerTracing",
      ]
    #expect(Set(CrashReportingPlatform.switchedOffOptions.map(\.name)) == expected)
    for entry in CrashReportingPlatform.switchedOffOptions {
      #expect(options[keyPath: entry.option] == false, "\(entry.name)")
    }
  }

  @Test("session replay records nothing: its sample rates are 0 where the device has it")
  func sessionReplayIsOff() {
    let options = Options()
    for entry in CrashReportingPlatform.zeroedRates {
      options[keyPath: entry.rate] = 1
    }
    Self.configured(options)
    let expected: Set<String> =
      ThisDevice.name == "Mac"
      ? [] : ["sessionReplay.sessionSampleRate", "sessionReplay.onErrorSampleRate"]
    #expect(Set(CrashReportingPlatform.zeroedRates.map(\.name)) == expected)
    for entry in CrashReportingPlatform.zeroedRates {
      #expect(options[keyPath: entry.rate] == 0, "\(entry.name)")
    }
  }

  @Test("every report carries the install ID as its user, and nothing else of the user")
  func installIDIsTheUser() throws {
    let options = Self.configured().options
    let user = options.initialScope(Scope()).serialize()["user"] as? [String: Any]
    #expect(user?["id"] as? String == "install-id")
    let beforeSend = try #require(options.beforeSend)
    #expect(beforeSend(Event())?.user?.userId == "install-id")
    let event = Event()
    event.user = User(userId: "sentry-installation")
    event.user?.email = "pat@example.com"
    event.user?.ipAddress = "203.0.113.7"
    let sent = beforeSend(event)
    #expect(sent?.user?.userId == "install-id")
    #expect(sent?.user?.email == nil)
    #expect(sent?.user?.ipAddress == nil)
  }

  @Test("events and breadcrumbs go through the scrubber before they're sent")
  func eventsAndBreadcrumbsAreScrubbed() throws {
    let options = Self.configured().options
    let beforeSend = try #require(options.beforeSend)
    let event = Event()
    event.serverName = "Pat's iPhone"
    event.message = SentryMessage(formatted: "opening /var/mobile/Containers/Data/x.txt")
    let sent = beforeSend(event)
    #expect(sent?.serverName == nil)
    #expect(sent?.message?.formatted == "opening <path>")

    let beforeBreadcrumb = try #require(options.beforeBreadcrumb)
    #expect(beforeBreadcrumb(Breadcrumb(level: .info, category: "ui.click")) == nil)
    let own = Breadcrumb(level: .info, category: "zenbu.sync")
    own.message = "sent to pat@example.com"
    #expect(beforeBreadcrumb(own)?.message == "sent to <email>")
  }
}
