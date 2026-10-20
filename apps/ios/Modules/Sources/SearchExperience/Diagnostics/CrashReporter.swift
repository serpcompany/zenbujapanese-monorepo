import Foundation
import Sentry
import Synchronization

@MainActor
public enum CrashReporter {
  private static var build: CrashReportingBuild?
  private nonisolated static let recorded = Mutex<Set<String>>([])

  nonisolated static let bundleID = Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary"

  public static func startAtLaunch() {
    startAtLaunch(
      defaults: .standard, bundle: .main, environment: ProcessInfo.processInfo.environment)
  }

  static func startAtLaunch(defaults: UserDefaults, bundle: Bundle, environment: [String: String]) {
    build = CrashReportingPolicy.build(
      info: bundle.infoDictionary, bundleID: bundle.bundleIdentifier, environment: environment)
    guard let build else { return }
    if CrashReportingPolicy.sendsCrashReports(in: defaults) {
      CrashReportingSDK.sentry.start(options(for: build, defaults: defaults))
    }
    if build.allowsTestSwitches {
      CrashReportTest.runIfRequested(defaults: defaults)
    }
  }

  static func setEnabled(_ enabled: Bool) {
    setEnabled(enabled, build: build, defaults: .standard, sdk: .sentry)
  }

  static func setEnabled(
    _ enabled: Bool, build: CrashReportingBuild?, defaults: UserDefaults, sdk: CrashReportingSDK
  ) {
    guard let build else { return }
    if enabled {
      if !sdk.isEnabled() { sdk.start(options(for: build, defaults: defaults)) }
      return
    }
    if sdk.isEnabled() { sdk.close() }
    try? FileManager.default.removeItem(atPath: sdk.cacheDirectory)
  }

  nonisolated static func record(
    _ error: Error, in area: ProblemArea, details: [String: String] = [:]
  ) {
    guard SentrySDK.isEnabled, let problem = HandledProblem(error, in: area, details: details)
    else { return }
    record(problem)
  }

  nonisolated static func record(_ problem: HandledProblem) {
    guard SentrySDK.isEnabled, isFirstThisLaunch(problem) else { return }
    SentrySDK.capture(event: problem.event())
  }

  nonisolated static func isFirstThisLaunch(_ problem: HandledProblem) -> Bool {
    recorded.withLock { $0.insert(problem.key).inserted }
  }

  static func options(for build: CrashReportingBuild, defaults: UserDefaults) -> Options {
    let options = Options()
    configure(
      options, dsn: build.dsn, environment: build.environment,
      installID: CrashReportingPolicy.installID(defaults: defaults), bundleID: bundleID)
    if build.allowsTestSwitches, let offline = CrashReportTest.offlineSession(defaults: defaults) {
      options.urlSession = offline
    }
    return options
  }

  nonisolated static func configure(
    _ options: Options, dsn: String, environment: String, installID: String, bundleID: String
  ) {
    options.dsn = dsn
    options.environment = environment
    options.cacheDirectoryPath = CrashReportingPolicy.cacheDirectory(
      caches: options.cacheDirectoryPath, bundleID: bundleID)
    options.initialScope = { scope in
      scope.setUser(User(userId: installID))
      return scope
    }
    options.enableCrashHandler = true
    options.enableAppHangTracking = true
    options.appHangTimeoutInterval = 2
    options.enableWatchdogTerminationTracking = true
    options.attachStacktrace = true
    options.attachAllThreads = false
    options.enableMemoryIntrospection = false
    options.enableSpotlight = false
    options.sendDefaultPii = false
    options.enableAutoSessionTracking = false
    options.enableAutoBreadcrumbTracking = false
    options.enableNetworkBreadcrumbs = false
    options.enableNetworkTracking = false
    options.enableCaptureFailedRequests = false
    options.enableAutoPerformanceTracing = false
    options.enableFileIOTracing = false
    options.enableCoreDataTracing = false
    options.tracesSampleRate = nil
    options.enableMetricKit = false
    options.enableLogs = false
    options.enableMetrics = false
    options.sendClientReports = false
    options.enableSwizzling = false
    options.tracePropagationTargets = []
    options.shutdownTimeInterval = 0
    CrashReportingPlatform.configure(options)
    options.beforeBreadcrumb = { breadcrumb in
      CrashReportScrubber.scrub(breadcrumb)
    }
    options.beforeSend = { event in
      let scrubbed = CrashReportScrubber.scrub(event)
      scrubbed.user = User(userId: installID)
      return scrubbed
    }
  }
}
