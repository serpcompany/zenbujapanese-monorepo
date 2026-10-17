import Foundation

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

enum PrivacySetting: Sendable {
  case camera
  case microphone
}

@MainActor
enum SystemSettings {
  static func url(for setting: PrivacySetting) -> URL? {
    #if os(macOS)
      let pane =
        switch setting {
        case .camera: "Privacy_Camera"
        case .microphone: "Privacy_Microphone"
        }
      return URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)")
    #else
      URL(string: UIApplication.openSettingsURLString)
    #endif
  }

  static func open(_ setting: PrivacySetting) {
    guard let url = url(for: setting) else { return }
    #if os(macOS)
      NSWorkspace.shared.open(url)
    #else
      UIApplication.shared.open(url)
    #endif
  }
}
