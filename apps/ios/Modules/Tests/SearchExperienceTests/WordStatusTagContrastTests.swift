import SwiftUI
import Testing

@testable import SearchExperience

@MainActor
@Suite("Word status tags: contrast")
struct WordStatusTagContrastTests {
  @Test("the Learning tag's words read at 4.5 to 1 on its capsule, in light and dark")
  func learningTagReads() throws {
    let tag = try #require(WordStatusTag(.learning))
    for (scheme, page) in [(ColorScheme.light, Color.white), (.dark, .black)] {
      var environment = EnvironmentValues()
      environment.colorScheme = scheme
      let text = tag.foreground(in: scheme).resolve(in: environment)
      let capsule = Self.composite(
        tag.background.resolve(in: environment), over: page.resolve(in: environment))
      #expect(Self.contrast(text, capsule) >= 4.5, "\(scheme)")
    }
  }

  private static func composite(_ top: Color.Resolved, over bottom: Color.Resolved) -> [Double] {
    let alpha = Double(top.opacity)
    return zip(encoded(top), encoded(bottom)).map { decode($0 * alpha + $1 * (1 - alpha)) }
  }

  private static func contrast(_ text: Color.Resolved, _ background: [Double]) -> Double {
    let lighter = max(luminance(linear(text)), luminance(background))
    let darker = min(luminance(linear(text)), luminance(background))
    return (lighter + 0.05) / (darker + 0.05)
  }

  private static func linear(_ color: Color.Resolved) -> [Double] {
    [color.red, color.green, color.blue].map { Double($0) }
  }

  private static func encoded(_ color: Color.Resolved) -> [Double] {
    linear(color).map { $0 <= 0.0031308 ? $0 * 12.92 : 1.055 * pow($0, 1 / 2.4) - 0.055 }
  }

  private static func decode(_ value: Double) -> Double {
    value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
  }

  private static func luminance(_ rgb: [Double]) -> Double {
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  }
}
