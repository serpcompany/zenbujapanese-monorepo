import Foundation

enum BundledData {
  static let bundle = located(in: places) ?? .main
  static let bundleName = "ZenbuJapaneseModules_DictionaryData.bundle"

  static func located(in places: [URL]) -> Bundle? {
    places.lazy.compactMap { Bundle(url: $0.appending(path: bundleName)) }.first
  }

  static func containingApp(of bundleURL: URL) -> URL? {
    guard bundleURL.pathExtension == "appex" else { return nil }
    var folder = bundleURL.deletingLastPathComponent()
    while folder.pathComponents.count > 1 {
      if folder.pathExtension == "app" { return folder }
      folder = folder.deletingLastPathComponent()
    }
    return nil
  }

  private static var places: [URL] {
    let containing = containingApp(of: Bundle.main.bundleURL).flatMap(Bundle.init(url:))
    return ([Bundle.main, containing].compactMap(\.self) + Bundle.allBundles)
      .compactMap(\.resourceURL)
  }
}
