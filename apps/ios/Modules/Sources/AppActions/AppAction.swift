import Foundation

public enum AppAction: Equatable, Sendable {
  case lookUp(String)
  case translate(String)
  case imageSearch(share: UUID, images: [String])

  public init?(_ url: URL, scheme: String) {
    guard url.scheme?.lowercased() == scheme.lowercased(),
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      let host = components.host
    else { return nil }
    let items = components.queryItems ?? []
    let values = { (name: String) in items.filter { $0.name == name }.compactMap(\.value) }
    switch host {
    case Self.lookUpHost:
      guard let text = values(Self.textItem).first else { return nil }
      self = .lookUp(text)
    case Self.translateHost:
      guard let text = values(Self.textItem).first else { return nil }
      self = .translate(text)
    case Self.imageSearchHost:
      guard let share = values(Self.shareItem).first.flatMap(UUID.init(uuidString:)) else {
        return nil
      }
      self = .imageSearch(share: share, images: values(Self.imageItem))
    default:
      return nil
    }
  }

  public func url(scheme: String) -> URL? {
    var components = URLComponents()
    components.scheme = scheme
    switch self {
    case .lookUp(let text):
      components.host = Self.lookUpHost
      components.percentEncodedQueryItems = [Self.item(Self.textItem, text)]
    case .translate(let text):
      components.host = Self.translateHost
      components.percentEncodedQueryItems = [Self.item(Self.textItem, text)]
    case .imageSearch(let share, let images):
      components.host = Self.imageSearchHost
      components.percentEncodedQueryItems =
        [Self.item(Self.shareItem, share.uuidString)] + images.map { Self.item(Self.imageItem, $0) }
    }
    return components.url
  }

  public static func scheme(ofApp bundleID: String) -> String {
    bundleID.lowercased()
  }

  public static func appBundleID(ofExtension bundleID: String) -> String {
    guard let last = bundleID.lastIndex(of: ".") else { return bundleID }
    return String(bundleID[..<last])
  }

  public static func appGroup(ofApp bundleID: String) -> String {
    "group.\(bundleID)"
  }

  private static func item(_ name: String, _ value: String) -> URLQueryItem {
    URLQueryItem(
      name: name, value: value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "")
  }

  private static let unreserved = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
  private static let lookUpHost = "look-up"
  private static let translateHost = "translate"
  private static let imageSearchHost = "image-search"
  private static let textItem = "text"
  private static let shareItem = "share"
  private static let imageItem = "image"
}
