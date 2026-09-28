import SwiftUI

struct JapaneseRubyText: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  /// The tapped kanji, as its piece and its position in that piece.
  @State private var selectedKanji: SelectedKanji?

  private struct SelectedKanji: Equatable {
    let piece: Int
    let character: Int
  }

  private struct Piece: Identifiable {
    let id: String
    let segment: JapaneseRubySegment
    /// Characters of `surface` before this piece.
    let offset: Int
    /// This piece's position among the pieces.
    let index: Int
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
  /// Tapping a kanji in a run such as 弱肉強食 colors it and its part of the reading (じゃく),
  /// when the kanji's own readings split the run's reading one way.
  let highlightsKanjiOnTap: Bool

  init(
    surface: String,
    reading: String,
    baseFont: Font = .body,
    rubyFont: Font = .caption.weight(.semibold),
    highlightedEnding: String = "",
    exposesAccessibility: Bool = true,
    displaysRomaji: Bool = true,
    hidesFurigana: Bool = false,
    highlightsKanjiOnTap: Bool = false
  ) {
    self.surface = surface
    self.reading = reading
    self.baseFont = baseFont
    self.rubyFont = rubyFont
    self.highlightedEnding = surface.hasSuffix(highlightedEnding) ? highlightedEnding : ""
    self.exposesAccessibility = exposesAccessibility
    self.displaysRomaji = displaysRomaji
    self.hidesFurigana = hidesFurigana
    self.highlightsKanjiOnTap = highlightsKanjiOnTap
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
            if let split = kanjiSplit(piece) {
              VStack(spacing: 0) {
                Text(selectableReading(split, piece: piece.index)).font(rubyFont)
                selectableKanji(piece)
              }
            } else {
              VStack(spacing: 0) {
                Text(furigana).font(rubyFont)
                Text(highlighted(piece.segment.base, at: piece.offset)).font(baseFont)
              }
            }
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

  /// Each kanji's part of the piece's reading, when tapping kanji highlights them.
  private func kanjiSplit(_ piece: Piece) -> [String]? {
    guard highlightsKanjiOnTap, let reading = piece.segment.reading,
      piece.segment.base.count > 1
    else { return nil }
    return KanjiReadingSplitter.split(piece.segment.base, reading: reading)
  }

  private func selectableReading(_ split: [String], piece: Int) -> AttributedString {
    var result = AttributedString()
    for (index, part) in split.enumerated() {
      var text = AttributedString(part)
      if selectedKanji == SelectedKanji(piece: piece, character: index) {
        text.foregroundColor = .accentColor
      }
      result += text
    }
    return result
  }

  private func selectableKanji(_ piece: Piece) -> some View {
    HStack(spacing: 0) {
      ForEach(Array(piece.segment.base.enumerated()), id: \.offset) { index, character in
        let selection = SelectedKanji(piece: piece.index, character: index)
        Text(String(character))
          .font(baseFont)
          .foregroundStyle(selectedKanji == selection ? Color.accentColor : Color.primary)
          .contentShape(.rect)
          .onTapGesture {
            withAnimation(.easeOut(duration: 0.15)) {
              selectedKanji = selectedKanji == selection ? nil : selection
            }
          }
      }
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
    var offset = 0
    return segments.enumerated().map { index, segment in
      defer { offset += segment.base.count }
      return Piece(
        id: "\(surface)|\(reading)|\(index)|\(segment.base)|\(segment.reading ?? "")",
        segment: segment,
        offset: offset,
        index: index
      )
    }
  }

  private var presentationIdentity: String {
    segments.map { segment in
      segment.reading.map { "\(segment.base)=\($0)" } ?? segment.base
    }.joined(separator: "|")
  }
}
