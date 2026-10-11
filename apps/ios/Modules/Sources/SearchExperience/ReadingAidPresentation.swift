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
      PresentationCore.shared.romaji(reading)
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
