import SwiftUI

struct WordHeadline<Accessory: View>: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  let surface: String
  let reading: String
  var highlightedEnding = ""
  var pitch: PitchAccent?
  let identifierPrefix: String
  let pronounce: () -> Void
  @ViewBuilder let accessory: () -> Accessory

  var body: some View {
    Group {
      if dynamicTypeSize.isAccessibilitySize {
        stacked
      } else {
        ViewThatFits(in: .horizontal) {
          beside(rubyHeadword(baseFont: .largeTitle, rubyFont: .title3.weight(.semibold)))
          beside(
            rubyHeadword(baseFont: .title.weight(.semibold), rubyFont: .caption.weight(.semibold)))
          stacked
        }
      }
    }
    .padding(.vertical, 4)
  }

  private func beside(_ headword: some View) -> some View {
    HStack(alignment: .center, spacing: 12) {
      headword
        .frame(maxWidth: .infinity, alignment: .leading)
      controls
    }
  }

  private var stacked: some View {
    VStack(alignment: .leading, spacing: 12) {
      headword
      controls
    }
  }

  private var headword: some View {
    ViewThatFits(in: .horizontal) {
      rubyHeadword(baseFont: .largeTitle, rubyFont: .title3.weight(.semibold))

      VStack(alignment: .leading, spacing: 6) {
        Text(surface.highlightingEnding(highlightedEnding))
          .font(.title2.weight(.semibold))
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("\(identifierPrefix).identity-surface")
        Text(reading)
          .font(dynamicTypeSize.isAccessibilitySize ? .body : .callout)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("\(identifierPrefix).identity-reading")
        RomajiReadingAidText(trustedReading: reading, font: .callout)
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("\(identifierPrefix).identity")
    }
  }

  private func rubyHeadword(baseFont: Font, rubyFont: Font) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      JapaneseRubyText(
        surface: surface,
        reading: reading,
        baseFont: baseFont,
        rubyFont: rubyFont,
        highlightedEnding: highlightedEnding
      )
      .fixedSize(horizontal: true, vertical: false)
      readingWithoutFurigana
    }
  }

  @ViewBuilder
  private var readingWithoutFurigana: some View {
    if !readingAidPreferences.showsFurigana, reading != surface {
      Text(reading)
        .font(.title3)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("\(identifierPrefix).identity-reading")
    }
  }

  private var controls: some View {
    HStack(spacing: 8) {
      if let pitch {
        PitchAccentBadge(reading: reading, pitch: pitch, pronounce: pronounce)
          .accessibilityIdentifier("\(identifierPrefix).pronounce")
      } else {
        Button(action: pronounce) {
          Image(systemName: "speaker.wave.2.fill")
            .font(.title3)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Pronounce \(reading)")
        .accessibilityIdentifier("\(identifierPrefix).pronounce")
      }
      accessory()
    }
  }
}

extension WordHeadline where Accessory == EmptyView {
  init(
    surface: String,
    reading: String,
    highlightedEnding: String = "",
    pitch: PitchAccent? = nil,
    identifierPrefix: String,
    pronounce: @escaping () -> Void
  ) {
    self.init(
      surface: surface,
      reading: reading,
      highlightedEnding: highlightedEnding,
      pitch: pitch,
      identifierPrefix: identifierPrefix,
      pronounce: pronounce,
      accessory: { EmptyView() }
    )
  }
}

extension String {
  func highlightingEnding(_ ending: String) -> AttributedString {
    var result = AttributedString(self)
    guard !ending.isEmpty, hasSuffix(ending) else { return result }
    let start = result.characters.index(result.endIndex, offsetBy: -ending.count)
    result[start...].foregroundColor = .accentColor
    return result
  }
}
