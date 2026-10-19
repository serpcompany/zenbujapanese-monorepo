import Foundation
import Sentry

enum CrashReportingPlatform {
  static var switchedOffOptions: [(name: String, option: ReferenceWritableKeyPath<Options, Bool>)] {
    #if os(macOS)
      [("enableUncaughtNSExceptionReporting", \.enableUncaughtNSExceptionReporting)]
    #else
      [
        ("attachScreenshot", \.attachScreenshot),
        ("attachViewHierarchy", \.attachViewHierarchy),
        ("enableUserInteractionTracing", \.enableUserInteractionTracing),
        ("enableUIViewControllerTracing", \.enableUIViewControllerTracing),
      ]
    #endif
  }

  static func configure(_ options: Options) {
    for entry in switchedOffOptions {
      options[keyPath: entry.option] = false
    }
  }
}
