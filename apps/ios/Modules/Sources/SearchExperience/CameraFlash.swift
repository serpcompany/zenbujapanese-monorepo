import Foundation

enum CameraFlash: String, CaseIterable, Sendable {
  case off
  case auto
  case on

  static let storageKey = "camera.flash"

  static func remembered(in defaults: UserDefaults = .standard) -> CameraFlash {
    defaults.string(forKey: storageKey).flatMap(CameraFlash.init(rawValue:)) ?? .off
  }

  func remember(in defaults: UserDefaults = .standard) {
    defaults.set(rawValue, forKey: Self.storageKey)
  }
}
