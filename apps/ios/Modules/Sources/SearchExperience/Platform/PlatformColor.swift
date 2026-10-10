import SwiftUI

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

struct DisplayP3Color: Sendable, Equatable {
  let red: Double
  let green: Double
  let blue: Double
}

extension Color {
  static func adaptive(light: DisplayP3Color, dark: DisplayP3Color) -> Color {
    #if os(macOS)
      Color(
        nsColor: NSColor(name: nil) { appearance in
          appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? dark.platformColor : light.platformColor
        })
    #else
      Color(
        uiColor: UIColor { traits in
          traits.userInterfaceStyle == .dark ? dark.platformColor : light.platformColor
        })
    #endif
  }
}

extension DisplayP3Color {
  #if os(macOS)
    fileprivate var platformColor: NSColor {
      NSColor(displayP3Red: red, green: green, blue: blue, alpha: 1)
    }
  #else
    fileprivate var platformColor: UIColor {
      UIColor(displayP3Red: red, green: green, blue: blue, alpha: 1)
    }
  #endif
}

enum SystemColor {
  #if os(macOS)
    static let background = Color(nsColor: .windowBackgroundColor)
    static let secondaryBackground = Color(nsColor: .controlBackgroundColor)
    static let secondaryFill = Color(nsColor: .secondarySystemFill)
    static let tertiaryFill = Color(nsColor: .tertiarySystemFill)
    static let panel = Color(nsColor: .windowBackgroundColor)
    static let panelContent = Color(nsColor: .controlBackgroundColor)
  #else
    static let background = Color(uiColor: .systemBackground)
    static let secondaryBackground = Color(uiColor: .secondarySystemBackground)
    static let secondaryFill = Color(uiColor: .secondarySystemFill)
    static let tertiaryFill = Color(uiColor: .tertiarySystemFill)
    static let panel = Color(uiColor: .systemGray5)
    static let panelContent = Color(uiColor: .systemBackground)
  #endif
}
