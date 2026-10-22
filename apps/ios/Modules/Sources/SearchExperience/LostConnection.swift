import Foundation

extension URLError {
  var isLostConnection: Bool {
    switch code {
    case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost,
      .dataNotAllowed, .internationalRoamingOff, .callIsActive:
      true
    default:
      false
    }
  }
}
