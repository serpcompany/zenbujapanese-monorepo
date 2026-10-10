import Foundation

enum ThisDevice {
  static let name: String = {
    #if os(macOS)
      "Mac"
    #else
      modelIdentifier.hasPrefix("iPad") ? "iPad" : "iPhone"
    #endif
  }()

  static let translationLanguagesSettings: String = {
    #if os(macOS)
      String(localized: "System Settings › General › Language & Region › Translation Languages")
    #else
      String(localized: "Settings › Apps › Translate")
    #endif
  }()

  static let settingsApp: String = {
    #if os(macOS)
      String(localized: "System Settings")
    #else
      String(localized: "Settings")
    #endif
  }()

  static let updateGesture: String = {
    #if os(macOS)
      String(localized: "right-click")
    #else
      String(localized: "swipe right")
    #endif
  }()

  #if os(iOS)
    private static var modelIdentifier: String {
      if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
        return simulated
      }
      var size = 0
      sysctlbyname("hw.machine", nil, &size, nil, 0)
      var machine = [CChar](repeating: 0, count: size)
      sysctlbyname("hw.machine", &machine, &size, nil, 0)
      return String(decoding: machine.prefix { $0 != 0 }.map(UInt8.init), as: UTF8.self)
    }
  #endif
}
