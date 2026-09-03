import Foundation
import SwiftUI

struct RomajiReadingAidText: View {
  @Environment(ReadingAidPreferences.self) private var preferences

  private enum Input {
    case trustedReading(String)
    case romaji(String?)
  }

  private let input: Input
  private let font: Font
  private let lineLimit: Int?
  private let isEnabled: Bool
  private let exposesAccessibility: Bool
  private let accessibilityIdentifier: String?

  init(
    trustedReading: String,
    font: Font = .caption,
    lineLimit: Int? = nil,
    isEnabled: Bool = true,
    exposesAccessibility: Bool = true,
    accessibilityIdentifier: String? = nil
  ) {
    self.init(
      input: .trustedReading(trustedReading),
      font: font,
      lineLimit: lineLimit,
      isEnabled: isEnabled,
      exposesAccessibility: exposesAccessibility,
      accessibilityIdentifier: accessibilityIdentifier
    )
  }

  init(
    romaji: String?,
    font: Font = .caption,
    lineLimit: Int? = nil,
    isEnabled: Bool = true,
    exposesAccessibility: Bool = true,
    accessibilityIdentifier: String? = nil
  ) {
    self.init(
      input: .romaji(romaji),
      font: font,
      lineLimit: lineLimit,
      isEnabled: isEnabled,
      exposesAccessibility: exposesAccessibility,
      accessibilityIdentifier: accessibilityIdentifier
    )
  }

  private init(
    input: Input,
    font: Font,
    lineLimit: Int?,
    isEnabled: Bool,
    exposesAccessibility: Bool,
    accessibilityIdentifier: String?
  ) {
    self.input = input
    self.font = font
    self.lineLimit = lineLimit
    self.isEnabled = isEnabled
    self.exposesAccessibility = exposesAccessibility
    self.accessibilityIdentifier = accessibilityIdentifier
  }

  @ViewBuilder
  var body: some View {
    if isEnabled, preferences.showsRomaji, let romaji = resolvedRomaji {
      if exposesAccessibility {
        if let accessibilityIdentifier {
          text(romaji)
            .accessibilityLabel("Romaji, \(romaji)")
            .accessibilityIdentifier(accessibilityIdentifier)
        } else {
          text(romaji)
            .accessibilityLabel("Romaji, \(romaji)")
        }
      } else {
        text(romaji)
          .accessibilityHidden(true)
      }
    }
  }

  private var resolvedRomaji: String? {
    switch input {
    case .trustedReading(let reading):
      AppleJapaneseRomanization.romanizeTrustedReading(reading)
    case .romaji(let romaji):
      romaji
    }
  }

  private func text(_ romaji: String) -> some View {
    Text(romaji)
      .font(font)
      .foregroundStyle(.secondary)
      .lineLimit(lineLimit)
      .fixedSize(horizontal: false, vertical: true)
  }
}

enum AppleJapaneseRomanization {
  // The accepted learner-visible candidate deliberately exposes Foundation/ICU's
  // orthographic output without app-owned particle or long-vowel corrections.
  static func romanizeTrustedReading(_ reading: String) -> String? {
    guard !reading.isEmpty, !reading.unicodeScalars.contains(where: \.isHanOrIterationMark)
    else { return nil }
    return reading.applyingTransform(.toLatin, reverse: false)
  }

  static func romanizeCompleteSentence(_ tokens: [JapaneseTextToken]) -> String? {
    guard !tokens.isEmpty else { return nil }
    var result = ""
    var previousBehavior: JapaneseTokenLineBreakBehavior?

    for token in tokens {
      if token.surface.allSatisfy(\.isWhitespace) {
        result += token.surface
        previousBehavior = nil
        continue
      }

      let trustedReading: String
      if let reading = token.reading, !reading.isEmpty, reading != "*" {
        trustedReading = reading
      } else {
        guard !token.surface.unicodeScalars.contains(where: \.isHanOrIterationMark)
        else { return nil }
        trustedReading = token.surface
      }
      guard let piece = romanizeTrustedReading(trustedReading) else { return nil }

      let behavior = token.surface.japaneseTokenLineBreakBehavior
      if result.isEmpty || result.last?.isWhitespace == true || behavior == .attachesToPrevious
        || previousBehavior == .attachesToNext
      {
        result += piece
      } else {
        result += " " + piece
      }
      previousBehavior = behavior
    }

    return result
  }
}

extension Unicode.Scalar {
  fileprivate var isHanOrIterationMark: Bool {
    value == 0x3005
      || (0x3400...0x9FFF).contains(Int(value))
      || (0xF900...0xFAFF).contains(Int(value))
      || (0x20000...0x2FA1F).contains(Int(value))
  }
}
