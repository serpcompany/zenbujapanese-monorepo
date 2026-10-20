import Sentry

struct CrashReportingSDK: Sendable {
  let start: @Sendable (Options) -> Void
  let capture: @Sendable (Event) -> Void
  let flush: @Sendable (TimeInterval) -> Void
  let close: @Sendable () -> Void
  let cacheDirectory: String
  let problemReportsDirectory: String

  static var sentry: CrashReportingSDK {
    let cacheDirectory = CrashReportingPolicy.cacheDirectory(
      caches: Options().cacheDirectoryPath, bundleID: CrashReporter.bundleID)
    return CrashReportingSDK(
      start: { SentrySDK.start(options: $0) },
      capture: { SentrySDK.capture(event: $0) },
      flush: { SentrySDK.flush(timeout: $0) },
      close: { SentrySDK.close() },
      cacheDirectory: cacheDirectory,
      problemReportsDirectory: CrashReportingPolicy.problemReportsDirectory(
        besides: cacheDirectory))
  }
}
