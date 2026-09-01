import SwiftUI
import UIKit
import XCTest

@testable import SearchExperience

final class ZenbuThemeAccessibilityTests: XCTestCase {
  func testBrandTintRemainsReadableOnSystemBackgrounds() throws {
    for style in [UIUserInterfaceStyle.light, .dark] {
      let foreground = try resolvedRGB(ZenbuTheme.interactiveTint, style: style)
      let background = try resolvedRGB(Color(uiColor: .systemBackground), style: style)
      XCTAssertGreaterThanOrEqual(
        contrastRatio(foreground, background),
        4.5,
        "Zenbu's native-control tint must remain readable, \(style)."
      )
    }
  }

  func testRadicalSelectionFillSupportsItsWhiteGlyph() throws {
    for style in [UIUserInterfaceStyle.light, .dark] {
      let glyph = try resolvedRGB(.white, style: style)
      let fill = try resolvedRGB(ZenbuTheme.radicalSelection, style: style)
      XCTAssertGreaterThanOrEqual(contrastRatio(glyph, fill), 4.5, "Radical glyph, \(style)")
    }
  }

  func testSemanticActionFillsSupportSystemWhiteText() throws {
    for style in [UIUserInterfaceStyle.light, .dark] {
      let glyph = try resolvedRGB(.white, style: style)
      let actionFill = try resolvedRGB(ZenbuTheme.prominentActionFill, style: style)
      XCTAssertGreaterThanOrEqual(
        contrastRatio(glyph, actionFill), 4.5, "Prominent action text, \(style)")
    }
  }

  func testDomainVisualizationColorsRemainDistinctFromSystemSurfaces() throws {
    for style in [UIUserInterfaceStyle.light, .dark] {
      let systemBackground = Color(uiColor: .systemBackground)
      let pairs: [(name: String, foreground: Color, background: Color)] = [
        ("recognition highlight", ZenbuTheme.recognitionHighlight, systemBackground),
        ("stroke progress", ZenbuTheme.strokeProgress, systemBackground),
        ("pitch downstep", ZenbuTheme.pitchDownstep, systemBackground),
      ]
      for pair in pairs {
        let ratio = contrastRatio(
          try resolvedRGB(pair.foreground, style: style),
          try resolvedRGB(pair.background, style: style)
        )
        XCTAssertGreaterThanOrEqual(ratio, 3.0, "\(pair.name), \(style)")
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
