import Foundation

enum AppGroupContainer {
  static func url(_ identifier: String) -> URL? {
    #if os(iOS)
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    #else
      nil
    #endif
  }
}
