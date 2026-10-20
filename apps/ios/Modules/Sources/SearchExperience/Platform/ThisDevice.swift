import Foundation

enum ThisDevice {
  static let name: String = {
    #if os(macOS)
      "Mac"
    #else
      modelIdentifier.hasPrefix("iPad") ? "iPad" : "iPhone"
    #endif
  }()

  static let systemName: String = {
    #if os(macOS)
      "macOS"
    #else
      name == "iPad" ? "iPadOS" : "iOS"
    #endif
  }()

  static let model: String = {
    #if os(macOS)
      sysctlString("hw.model")
    #else
      modelIdentifier
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
      ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"]
        ?? sysctlString("hw.machine")
    }
  #endif

  private static func sysctlString(_ key: String) -> String {
    var size = 0
    sysctlbyname(key, nil, &size, nil, 0)
    var value = [CChar](repeating: 0, count: size)
    sysctlbyname(key, &value, &size, nil, 0)
    return String(decoding: value.prefix { $0 != 0 }.map(UInt8.init), as: UTF8.self)
  }
}
