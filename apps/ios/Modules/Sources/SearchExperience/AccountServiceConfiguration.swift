import Foundation

struct AccountServiceConfiguration: Sendable, Equatable {
  static let clientID = "zenbu-ios"
  static let serviceURLKey = "ZenbuAccountServiceURL"
  static let serviceURLEnvironmentKey = "ZENBU_ACCOUNT_API_URL"
  static let googleClientIDKey = "ZenbuGoogleIOSClientID"
  static let bundleIDSuffixKey = "ZenbuBundleIDSuffix"

  let serviceURL: URL
  let googleClientID: String?
  var offersApple = true

  static func resolve(
    bundle: Bundle = .main,
    defaults: UserDefaults = .standard,
    environment: [String: String] = ProcessInfo.processInfo.environment
  ) -> AccountServiceConfiguration? {
    let candidates = [
      defaults.string(forKey: serviceURLKey),
      environment[serviceURLEnvironmentKey],
      bundle.object(forInfoDictionaryKey: serviceURLKey) as? String,
    ]
    guard let serviceURL = candidates.lazy.compactMap({ $0.flatMap(Self.serviceURL) }).first
    else { return nil }
    let googleClientID = (bundle.object(forInfoDictionaryKey: googleClientIDKey) as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let bundleIDSuffix = (bundle.object(forInfoDictionaryKey: bundleIDSuffixKey) as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return AccountServiceConfiguration(
      serviceURL: serviceURL,
      googleClientID: googleClientID?.isEmpty == false ? googleClientID : nil,
      offersApple: bundleIDSuffix?.isEmpty ?? true
        || LaunchHarness.standsInForSignIn(environment))
  }

  private static func serviceURL(_ raw: String) -> URL? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
      scheme == "https" || scheme == "http", url.host() != nil
    else { return nil }
    return url
  }
}
