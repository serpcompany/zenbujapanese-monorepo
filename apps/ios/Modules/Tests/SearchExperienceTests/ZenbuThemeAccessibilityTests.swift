import SwiftUI
import UIKit
import XCTest

@testable import SearchExperience

final class ZenbuThemeAccessibilityTests: XCTestCase {
  func testDarkModeBrandTextMeetsNormalTextContrast() throws {
    let foreground = try resolvedRGB(ZenbuTheme.interactiveForeground, style: .dark)
    let background = try resolvedRGB(ZenbuTheme.background, style: .dark)

    XCTAssertGreaterThanOrEqual(
      contrastRatio(foreground, background),
      8.0,
      "Dark-mode brand text must remain readable even at small linked-text sizes."
    )
  }

  func testBrandChromeTextHasContrastMarginForSmallAntialiasedLabels() throws {
    for style in [UIUserInterfaceStyle.light, .dark] {
      let foreground = try resolvedRGB(ZenbuTheme.primaryForeground, style: style)
      let background = try resolvedRGB(ZenbuTheme.chrome, style: style)
      XCTAssertGreaterThanOrEqual(
        contrastRatio(foreground, background),
        6.0,
        "Small labels on brand chrome need margin beyond the minimum ratio, \(style)."
      )
    }
  }

  func testSecondaryTextHasHostedAntialiasingContrastMargin() throws {
    for style in [UIUserInterfaceStyle.light, .dark] {
      for background in [ZenbuTheme.background, ZenbuTheme.card] {
        let ratio = contrastRatio(
          try resolvedRGB(ZenbuTheme.secondaryText, style: style),
          try resolvedRGB(background, style: style)
        )
        XCTAssertGreaterThanOrEqual(
          ratio,
          6.0,
          "Secondary text needs margin beyond AA for hosted antialiasing, \(style)."
        )
      }
    }
  }

  func testNormalTextThemePairsMeetContrastInBothAppearances() throws {
    let pairs: [(name: String, foreground: Color, background: Color)] = [
      ("body on page", ZenbuTheme.foreground, ZenbuTheme.background),
      ("secondary text on page", ZenbuTheme.secondaryText, ZenbuTheme.background),
      ("interactive text on page", ZenbuTheme.interactiveForeground, ZenbuTheme.background),
      ("system control tint on page", ZenbuTheme.systemControlTint, ZenbuTheme.background),
      ("body on card", ZenbuTheme.foreground, ZenbuTheme.card),
      ("secondary text on card", ZenbuTheme.secondaryText, ZenbuTheme.card),
      ("interactive text on card", ZenbuTheme.interactiveForeground, ZenbuTheme.card),
      ("system control tint on card", ZenbuTheme.systemControlTint, ZenbuTheme.card),
      ("text on brand chrome", ZenbuTheme.primaryForeground, ZenbuTheme.chrome),
      (
        "destructive action text on fill", ZenbuTheme.primaryForeground,
        ZenbuTheme.destructiveActionTint
      ),
    ]

    for style in [UIUserInterfaceStyle.light, .dark] {
      for pair in pairs {
        let ratio = contrastRatio(
          try resolvedRGB(pair.foreground, style: style),
          try resolvedRGB(pair.background, style: style)
        )
        XCTAssertGreaterThanOrEqual(ratio, 4.5, "\(pair.name), \(style)")
      }
    }
  }

  private func resolvedRGB(
    _ color: Color,
    style: UIUserInterfaceStyle
  ) throws -> (red: CGFloat, green: CGFloat, blue: CGFloat) {
    let resolved = UIColor(color).resolvedColor(
      with: UITraitCollection(userInterfaceStyle: style)
    )
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    XCTAssertTrue(resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
    XCTAssertEqual(alpha, 1, accuracy: 0.001)
    return (red, green, blue)
  }

  private func contrastRatio(
    _ first: (red: CGFloat, green: CGFloat, blue: CGFloat),
    _ second: (red: CGFloat, green: CGFloat, blue: CGFloat)
  ) -> CGFloat {
    let lighter = max(relativeLuminance(first), relativeLuminance(second))
    let darker = min(relativeLuminance(first), relativeLuminance(second))
    return (lighter + 0.05) / (darker + 0.05)
  }

  private func relativeLuminance(
    _ color: (red: CGFloat, green: CGFloat, blue: CGFloat)
  ) -> CGFloat {
    // Display P3 relative-luminance coefficients with the sRGB transfer function.
    (0.228974564 * linearized(color.red))
      + (0.691738522 * linearized(color.green))
      + (0.079286914 * linearized(color.blue))
  }

  private func linearized(_ component: CGFloat) -> CGFloat {
    component <= 0.04045
      ? component / 12.92
      : pow((component + 0.055) / 1.055, 2.4)
  }
}
