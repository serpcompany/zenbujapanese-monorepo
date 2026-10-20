import Sentry

struct CrashReportingSDK {
  let isEnabled: () -> Bool
  let start: (Options) -> Void
  let close: () -> Void

  static var sentry: CrashReportingSDK {
    CrashReportingSDK(
      isEnabled: { SentrySDK.isEnabled },
      start: { SentrySDK.start(options: $0) },
      close: { SentrySDK.close() })
  }
}
