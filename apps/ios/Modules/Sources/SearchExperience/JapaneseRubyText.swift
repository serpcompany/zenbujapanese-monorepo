import SwiftUI

struct JapaneseRubyText: View {
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

  init(
    surface: String,
    reading: String,
    baseFont: Font = .body,
    rubyFont: Font = .caption.weight(.semibold),
    underlined: Bool = false,
    exposesAccessibility: Bool = true
  ) {
    self.surface = surface
    self.reading = reading
    self.baseFont = baseFont
    self.rubyFont = rubyFont
    self.underlined = underlined
    self.exposesAccessibility = exposesAccessibility
  }

  @ViewBuilder
  var body: some View {
    if exposesAccessibility {
      rubyContent
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(surface), \(reading)")
        .accessibilityIdentifier("ruby.\(surface).\(presentationIdentity)")
    } else {
      rubyContent
    }
  }

  private var rubyContent: some View {
    HStack(alignment: .bottom, spacing: 0) {
      ForEach(pieces) { piece in
        if let ruby = piece.segment.reading {
          VStack(spacing: 0) {
            Text(ruby).font(rubyFont)
            Text(piece.segment.base).font(baseFont).underline(underlined)
          }
        } else {
          Text(piece.segment.base).font(baseFont).underline(underlined)
        }
      }
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
