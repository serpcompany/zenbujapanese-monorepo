import Sentry

struct CrashReportingSDK {
  let isEnabled: () -> Bool
  let start: (Options) -> Void
  let close: () -> Void
  let cacheDirectory: String

  static var sentry: CrashReportingSDK {
    CrashReportingSDK(
      isEnabled: { SentrySDK.isEnabled },
      start: { SentrySDK.start(options: $0) },
      close: { SentrySDK.close() },
      cacheDirectory: CrashReportingPolicy.cacheDirectory(
        caches: Options().cacheDirectoryPath, bundleID: CrashReporter.bundleID))
  }
}
