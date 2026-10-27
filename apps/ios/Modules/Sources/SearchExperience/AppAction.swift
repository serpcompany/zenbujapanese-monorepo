import Foundation

enum AppAction: Equatable, Sendable {
  case lookUp(String)
  case translate(String)
  case watch(YouTubeVideoID?)

  init?(_ url: URL, scheme: String) {
    guard url.scheme?.lowercased() == scheme.lowercased(),
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return nil }
    let item = { (name: String) in components.queryItems?.first { $0.name == name }?.value }
    switch (components.host, item(Self.textItem)) {
    case (Self.lookUpHost, let text?): self = .lookUp(text)
    case (Self.translateHost, let text?): self = .translate(text)
    case (Self.watchHost, _):
      self = .watch(item(Self.videoItem).flatMap(YouTubeVideoID.init(rawValue:)))
    default: return nil
    }
  }

  func url(scheme: String) -> URL? {
    var components = URLComponents()
    components.scheme = scheme
    let item: (name: String, value: String)?
    switch self {
    case .lookUp(let text):
      components.host = Self.lookUpHost
      item = (Self.textItem, text)
    case .translate(let text):
      components.host = Self.translateHost
      item = (Self.textItem, text)
    case .watch(let video):
      components.host = Self.watchHost
      item = video.map { (Self.videoItem, $0.rawValue) }
    }
    components.percentEncodedQueryItems = item.map { item in
      let encoded = item.value.addingPercentEncoding(withAllowedCharacters: Self.unreserved) ?? ""
      return [URLQueryItem(name: item.name, value: encoded)]
    }
    return components.url
  }

  static func scheme(ofApp bundleID: String) -> String {
    bundleID.lowercased()
  }

  private static let unreserved = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
  private static let lookUpHost = "look-up"
  private static let translateHost = "translate"
  private static let watchHost = "watch"
  private static let textItem = "text"
  private static let videoItem = "v"
}
