import SwiftUI
import UIKit

/// App-owned color roles that communicate Zenbu identity or Japanese-learning evidence.
/// Ordinary surfaces, text hierarchy, controls, and feedback deliberately use SwiftUI semantics.
enum ZenbuTheme {
  /// Brand identity: the interactive tint used by the app shell and native controls.
  static let interactiveTint = dynamic(
    light: p3(0.692737, 0.116232, 0.104679),
    dark: p3(0.980000, 0.550000, 0.540000)
  )

  /// Semantic action: a darker brand fill for native prominent buttons with system white text.
  static let prominentActionFill = dynamic(
    light: p3(0.692737, 0.116232, 0.104679),
    dark: p3(0.569606, 0.121069, 0.108493)
  )

  /// Domain visualization: selection evidence inside the purpose-specific Radical grid.
  static let radicalSelection = prominentActionFill

  /// Domain visualization: OCR region evidence over imported images.
  static let recognitionHighlight = interactiveTint

  /// Domain visualization: the currently animated kanji stroke and its start point.
  static let strokeProgress = interactiveTint

  /// Domain visualization: the downstep in a pitch-accent contour.
  static let pitchDownstep = dynamic(
    light: p3(0.830324, 0.140382, 0.133196),
    dark: p3(0.933534, 0.431676, 0.423491)
  )

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
