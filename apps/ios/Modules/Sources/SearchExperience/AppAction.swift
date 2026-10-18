import Foundation

enum AppAction: Equatable, Sendable {
  case lookUp(String)
  case translate(String)

  init?(_ url: URL, scheme: String) {
    guard url.scheme?.lowercased() == scheme.lowercased(),
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      let text = components.queryItems?.first(where: { $0.name == Self.textItem })?.value
    else { return nil }
    switch components.host {
    case Self.lookUpHost: self = .lookUp(text)
    case Self.translateHost: self = .translate(text)
    default: return nil
    }
  }

  func url(scheme: String) -> URL? {
    var components = URLComponents()
    components.scheme = scheme
    let text: String
    switch self {
    case .lookUp(let lookedUp):
      components.host = Self.lookUpHost
      text = lookedUp
    case .translate(let translated):
      components.host = Self.translateHost
      text = translated
    }
    let encoded = text.addingPercentEncoding(withAllowedCharacters: Self.unreserved) ?? ""
    components.percentEncodedQueryItems = [URLQueryItem(name: Self.textItem, value: encoded)]
    return components.url
  }

  static func scheme(ofApp bundleID: String) -> String {
    bundleID.lowercased()
  }

  private static let unreserved = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
  private static let lookUpHost = "look-up"
  private static let translateHost = "translate"
  private static let textItem = "text"
}
