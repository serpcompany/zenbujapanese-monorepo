import SwiftUI

enum ZenbuTheme {
  static let radicalSelection = dynamic(
    light: p3(0.692737, 0.116232, 0.104679),
    dark: p3(0.569606, 0.121069, 0.108493)
  )

  static let strokeProgress = evidenceCoral

  private static let evidenceCoral = dynamic(
    light: p3(0.692737, 0.116232, 0.104679),
    dark: p3(0.980000, 0.550000, 0.540000)
  )

  static let pitchDownstep = dynamic(
    light: p3(0.830324, 0.140382, 0.133196),
    dark: p3(0.933534, 0.431676, 0.423491)
  )

  private static func dynamic(light: DisplayP3Color, dark: DisplayP3Color) -> Color {
    Color.adaptive(light: light, dark: dark)
  }

  private static func p3(_ red: Double, _ green: Double, _ blue: Double) -> DisplayP3Color {
    DisplayP3Color(red: red, green: green, blue: blue)
  }
}
