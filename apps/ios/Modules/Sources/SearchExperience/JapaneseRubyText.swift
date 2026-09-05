import SwiftUI

struct JapaneseRubyText: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences

  private struct Piece: Identifiable {
    let id: String
    let segment: JapaneseRubySegment
  }

  let surface: String
  let reading: String
  let baseFont: Font
  let rubyFont: Font
  let underlined: Bool
  let exposesAccessibility: Bool
  let displaysRomaji: Bool

  init(
    surface: String,
    reading: String,
    baseFont: Font = .body,
    rubyFont: Font = .caption.weight(.semibold),
    underlined: Bool = false,
    exposesAccessibility: Bool = true,
    displaysRomaji: Bool = true
  ) {
    self.surface = surface
    self.reading = reading
    self.baseFont = baseFont
    self.rubyFont = rubyFont
    self.underlined = underlined
    self.exposesAccessibility = exposesAccessibility
    self.displaysRomaji = displaysRomaji
  }

  @ViewBuilder
  var body: some View {
    if exposesAccessibility {
      readingAidContent
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(surface), \(reading)")
        .accessibilityIdentifier("ruby.\(surface).\(presentationIdentity)")
    } else {
      readingAidContent
    }
  }

  private var readingAidContent: some View {
    VStack(alignment: .leading, spacing: 2) {
      furiganaContent
      RomajiReadingAidText(
        trustedReading: reading,
        isEnabled: displaysRomaji,
        exposesAccessibility: false
      )
    }
  }

  @ViewBuilder
  private var furiganaContent: some View {
    if readingAidPreferences.showsFurigana {
      HStack(alignment: .bottom, spacing: 0) {
        ForEach(pieces) { piece in
          if let furigana = piece.segment.reading {
            VStack(spacing: 0) {
              Text(furigana).font(rubyFont)
              Text(piece.segment.base).font(baseFont).underline(underlined)
            }
          } else {
            Text(piece.segment.base).font(baseFont).underline(underlined)
          }
        }
      }
    } else {
      Text(surface)
        .font(baseFont)
        .underline(underlined)
    }
  }

  private var segments: [JapaneseRubySegment] {
    JapaneseRubyAnnotation.segments(surface: surface, reading: reading)
  }

  private var pieces: [Piece] {
    segments.enumerated().map { index, segment in
      Piece(
        id: "\(surface)|\(reading)|\(index)|\(segment.base)|\(segment.reading ?? "")",
        segment: segment
      )
    }
  }

  private var presentationIdentity: String {
    segments.map { segment in
      segment.reading.map { "\(segment.base)=\($0)" } ?? segment.base
    }.joined(separator: "|")
  }
}
