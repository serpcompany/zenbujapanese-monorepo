import Foundation
import Sentry

enum CrashReportingPlatform {
  static func source(of bundle: Bundle) -> BuildSource {
    #if targetEnvironment(simulator)
      .simulator
    #elseif os(macOS)
      .mac
    #else
      CrashReportingPolicy.carriesProvisioningProfile(bundleAt: bundle.bundleURL)
        ? .provisioningProfile : .storeSignature
    #endif
  }

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

  static var zeroedRates: [(name: String, rate: ReferenceWritableKeyPath<Options, Float>)] {
    #if os(macOS)
      []
    #else
      [
        ("sessionReplay.sessionSampleRate", \.sessionReplay.sessionSampleRate),
        ("sessionReplay.onErrorSampleRate", \.sessionReplay.onErrorSampleRate),
      ]
    #endif
  }

  static func configure(_ options: Options) {
    for entry in switchedOffOptions {
      options[keyPath: entry.option] = false
    }
    for entry in zeroedRates {
      options[keyPath: entry.rate] = 0
    }
  }
}
