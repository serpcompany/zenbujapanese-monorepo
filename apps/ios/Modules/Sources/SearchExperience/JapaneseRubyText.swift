import SwiftUI

struct JapaneseRubyText: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  /// Space around each reading that sits beside another, so 弱肉 reads じゃく・にく rather than
  /// じゃくにく.
  @ScaledMetric(relativeTo: .body) private var adjacentReadingGap = 3.0

  private struct Piece: Identifiable {
    let id: String
    let segment: JapaneseRubySegment
    /// Characters of `surface` before this piece.
    let offset: Int
    /// Whether a neighboring piece also has a reading.
    let besideAnotherReading: Bool
  }

  let surface: String
  let reading: String
  let baseFont: Font
  let rubyFont: Font
  /// A trailing part of `surface` drawn in the accent color, such as the ending of a conjugation.
  let highlightedEnding: String
  let exposesAccessibility: Bool
  let displaysRomaji: Bool
  /// Hides furigana here even when the Furigana preference is on, such as over a known word.
  let hidesFurigana: Bool

  init(
    surface: String,
    reading: String,
    baseFont: Font = .body,
    rubyFont: Font = .caption.weight(.semibold),
    highlightedEnding: String = "",
    exposesAccessibility: Bool = true,
    displaysRomaji: Bool = true,
    hidesFurigana: Bool = false
  ) {
    self.surface = surface
    self.reading = reading
    self.baseFont = baseFont
    self.rubyFont = rubyFont
    self.highlightedEnding = surface.hasSuffix(highlightedEnding) ? highlightedEnding : ""
    self.exposesAccessibility = exposesAccessibility
    self.displaysRomaji = displaysRomaji
    self.hidesFurigana = hidesFurigana
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
    if readingAidPreferences.showsFurigana, !hidesFurigana {
      HStack(alignment: .bottom, spacing: 0) {
        ForEach(pieces) { piece in
          if let furigana = piece.segment.reading {
            VStack(spacing: 0) {
              Text(furigana).font(rubyFont)
              Text(highlighted(piece.segment.base, at: piece.offset)).font(baseFont)
            }
            .padding(.horizontal, piece.besideAnotherReading ? adjacentReadingGap : 0)
          } else {
            Text(highlighted(piece.segment.base, at: piece.offset)).font(baseFont)
          }
        }
      }
    } else {
      Text(highlighted(surface, at: 0))
        .font(baseFont)
    }
  }

  /// `text` starts `offset` characters into `surface`; its characters within the highlighted
  /// ending take the accent color.
  private func highlighted(_ text: String, at offset: Int) -> AttributedString {
    var result = AttributedString(text)
    let highlightStart = surface.count - highlightedEnding.count
    guard !highlightedEnding.isEmpty, offset + text.count > highlightStart else { return result }
    let start = result.characters.index(
      result.startIndex, offsetBy: max(0, highlightStart - offset))
    result[start...].foregroundColor = .accentColor
    return result
  }

  private var segments: [JapaneseRubySegment] {
    JapaneseRubyAnnotation.segments(surface: surface, reading: reading)
  }

  private var pieces: [Piece] {
    let segments = segments
    var offset = 0
    return segments.enumerated().map { index, segment in
      defer { offset += segment.base.count }
      let hasReading = { (index: Int) in
        segments.indices.contains(index) && segments[index].reading != nil
      }
      return Piece(
        id: "\(surface)|\(reading)|\(index)|\(segment.base)|\(segment.reading ?? "")",
        segment: segment,
        offset: offset,
        besideAnotherReading: hasReading(index - 1) || hasReading(index + 1)
      )
    }
  }

  private var presentationIdentity: String {
    segments.map { segment in
      segment.reading.map { "\(segment.base)=\($0)" } ?? segment.base
    }.joined(separator: "|")
  }
}
