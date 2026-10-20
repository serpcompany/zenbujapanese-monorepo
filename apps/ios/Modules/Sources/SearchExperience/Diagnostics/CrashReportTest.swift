import Foundation
import Sentry

enum CrashReportTest {
  static let crashKey = "ZBTestCrash"
  static let freezeKey = "ZBTestFreeze"
  static let problemKey = "ZBTestError"
  static let offlineKey = "ZBTestOffline"

  static let seededProblem = AccountServiceError.refused(
    status: 400, code: "pat@example.com",
    message:
      "zb-test-secret-4242 for pat@example.com at https://example.com/private?token=zb-test-secret-4242 in /var/mobile/Containers/Data/Application/ABC/Documents/食べる.txt",
    retryAfter: nil)

  static func runIfRequested(defaults: UserDefaults) {
    if defaults.bool(forKey: problemKey) {
      CrashReporter.record(seededProblem, in: .accountSync)
    }
    if defaults.bool(forKey: freezeKey) {
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) { Thread.sleep(forTimeInterval: 5) }
    }
    if defaults.bool(forKey: crashKey) {
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) { SentrySDK.crash() }
    }
  }

  static func offlineSession(defaults: UserDefaults) -> URLSession? {
    guard defaults.bool(forKey: offlineKey) else { return nil }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [OfflineURLProtocol.self]
    return URLSession(configuration: configuration)
  }
}

final class OfflineURLProtocol: URLProtocol {
  override static func canInit(with request: URLRequest) -> Bool { true }

  override static func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
  }

  override func stopLoading() {}
}
