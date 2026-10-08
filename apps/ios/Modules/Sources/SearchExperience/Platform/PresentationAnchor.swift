import AuthenticationServices

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

@MainActor
func keyWindowAnchor() -> ASPresentationAnchor {
  #if os(macOS)
    NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? ASPresentationAnchor()
  #else
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap(\.windows)
    if let window = windows.first(where: \.isKeyWindow) ?? windows.first { return window }
    guard let scene = scenes.first else {
      preconditionFailure("Sign-in starts from a button in a window")
    }
    return ASPresentationAnchor(windowScene: scene)
  #endif
}
