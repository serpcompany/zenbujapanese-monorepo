import SwiftUI
import UIKit

/// Zenbu's owner-approved OKLCH theme, converted to Display P3 at the UI boundary.
/// The source tokens remain in these comments so future exports can be checked
/// against the exact approved values instead of rounded RGB screenshots.
enum ZenbuTheme {
  static let background = dynamic(
    light: p3(1.000000, 1.000000, 1.000000),  // oklch(1 0 0)
    dark: p3(0.039388, 0.039388, 0.039388)  // oklch(0.145 0 0)
  )
  static let foreground = dynamic(
    light: p3(0.039388, 0.039388, 0.039388),  // oklch(0.145 0 0)
    dark: p3(0.980256, 0.980256, 0.980256)  // oklch(0.985 0 0)
  )
  static let card = dynamic(
    light: p3(1.000000, 1.000000, 1.000000),  // oklch(1 0 0)
    dark: p3(0.090527, 0.090527, 0.090527)  // oklch(0.205 0 0)
  )
  static let primary = dynamic(
    light: p3(0.692737, 0.116232, 0.104679),  // oklch(0.505 0.213 27.518)
    dark: p3(0.569606, 0.121069, 0.108493)  // oklch(0.444 0.177 26.899)
  )
  /// Brand-colored foreground for links, selected labels, and meaningful icons.
  /// Dark mode uses a lighter coral so normal-size text remains readable on page surfaces.
  static let interactiveForeground = dynamic(
    light: p3(0.692737, 0.116232, 0.104679),  // oklch(0.505 0.213 27.518)
    dark: p3(0.933534, 0.431676, 0.423491)  // oklch(0.704 0.191 22.216)
  )
  static let primaryForeground = dynamic(
    light: p3(0.988669, 0.951204, 0.950419),  // oklch(0.971 0.013 17.38)
    dark: p3(0.988669, 0.951204, 0.950419)  // oklch(0.971 0.013 17.38)
  )
  static let secondary = dynamic(
    light: p3(0.956385, 0.956385, 0.959079),  // oklch(0.967 0.001 286.375)
    dark: p3(0.152895, 0.152887, 0.164660)  // oklch(0.274 0.006 286.033)
  )
  static let secondaryForeground = dynamic(
    light: p3(0.093796, 0.093793, 0.104806),  // oklch(0.21 0.006 285.885)
    dark: p3(0.980256, 0.980256, 0.980256)  // oklch(0.985 0 0)
  )
  static let muted = dynamic(
    light: p3(0.960587, 0.960587, 0.960587),  // oklch(0.97 0 0)
    dark: p3(0.149382, 0.149382, 0.149382)  // oklch(0.269 0 0)
  )
  static let mutedForeground = dynamic(
    light: p3(0.451519, 0.451519, 0.451519),  // oklch(0.556 0 0)
    dark: p3(0.630163, 0.630163, 0.630163)  // oklch(0.708 0 0)
  )
  static let accent = dynamic(
    light: p3(0.960587, 0.960587, 0.960587),  // oklch(0.97 0 0)
    dark: p3(0.149382, 0.149382, 0.149382)  // oklch(0.269 0 0)
  )
  static let accentForeground = dynamic(
    light: p3(0.090527, 0.090527, 0.090527),  // oklch(0.205 0 0)
    dark: p3(0.980256, 0.980256, 0.980256)  // oklch(0.985 0 0)
  )
  static let destructive = dynamic(
    light: p3(0.830324, 0.140382, 0.133196),  // oklch(0.577 0.245 27.325)
    dark: p3(0.933534, 0.431676, 0.423491)  // oklch(0.704 0.191 22.216)
  )
  static let border = dynamic(
    light: p3(0.898161, 0.898161, 0.898161),  // oklch(0.922 0 0)
    dark: p3(1, 1, 1, alpha: 0.10)  // oklch(1 0 0 / 10%)
  )
  static let input = dynamic(
    light: p3(0.898161, 0.898161, 0.898161),  // oklch(0.922 0 0)
    dark: p3(1, 1, 1, alpha: 0.15)  // oklch(1 0 0 / 15%)
  )
  static let ring = dynamic(
    light: p3(0.630163, 0.630163, 0.630163),  // oklch(0.708 0 0)
    dark: p3(0.451519, 0.451519, 0.451519)  // oklch(0.556 0 0)
  )

  // Compatibility aliases for existing view roles. They preserve geometry and
  // keep this identity-only pass from becoming a layout or typography rewrite.
  static let chrome = primary
  static let row = card
  static let searchField = input
  static let secondaryText = mutedForeground
  static let divider = border
  static let selectedTab = primary

  private static func dynamic(light: UIColor, dark: UIColor) -> Color {
    Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light })
  }

  private static func p3(
    _ red: CGFloat,
    _ green: CGFloat,
    _ blue: CGFloat,
    alpha: CGFloat = 1
  ) -> UIColor {
    UIColor(displayP3Red: red, green: green, blue: blue, alpha: alpha)
  }
}
