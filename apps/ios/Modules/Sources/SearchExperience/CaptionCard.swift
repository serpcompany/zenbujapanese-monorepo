import SwiftUI

/// A line of Japanese as a caption card: linked text with furigana and word underlines, then its
/// translation. The Player's captions and Image Search's lines share it; place it in a plain
/// `List` with `captionCardRow(isActive:)`.
struct CaptionCard: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences

  let text: String
  let translation: String?
  /// The word whose sheet is open, accented when it appears in this card.
  let highlightedEntry: DictionaryEntry?
  /// A short label in the card's top corner, such as the line's time.
  let label: String?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let identifierPrefix: String
  let openCandidates: (_ surface: String, _ candidates: [DictionaryEntry]) -> Void
  let openWord: (DictionaryEntry) -> Void

  init(
    text: String,
    translation: String?,
    highlightedEntry: DictionaryEntry? = nil,
    label: String? = nil,
    japaneseTextAnalysisClient: JapaneseTextAnalysisClient,
    identifierPrefix: String,
    openCandidates: @escaping (_ surface: String, _ candidates: [DictionaryEntry]) -> Void,
    openWord: @escaping (DictionaryEntry) -> Void
  ) {
    self.text = text
    self.translation = translation
    self.highlightedEntry = highlightedEntry
    self.label = label
    self.japaneseTextAnalysisClient = japaneseTextAnalysisClient
    self.identifierPrefix = identifierPrefix
    self.openCandidates = openCandidates
    self.openWord = openWord
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      LinkedJapaneseText(
        text: text,
        highlightedQuery: SearchQuery(""),
        highlightedEntry: highlightedEntry,
        japaneseTextAnalysisClient: japaneseTextAnalysisClient,
        identifierPrefix: identifierPrefix,
        highlightsCurrentEntry: highlightedEntry != nil,
        openCandidates: openCandidates,
        openWord: openWord
      )
      if readingAidPreferences.showsTranslations, let translation {
        Text(translation)
          .font(.callout)
          .foregroundStyle(.secondary)
          .padding(.top, 8)
      }
    }
    // The label sits in the card's top corner, above the text, so it never takes a line.
    .padding(.top, label == nil ? 10 : 22)
    .padding(.bottom, 10)
    .overlay(alignment: .topTrailing) {
      if let label {
        Text(label)
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.tint)
          .padding(.top, 4)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

extension View {
  /// Lays out a `CaptionCard` as a row of a plain `List`, with the card behind it.
  func captionCardRow(isActive: Bool) -> some View {
    padding(.horizontal, 8)
      .listRowSeparator(.hidden)
      .listRowBackground(CaptionCardBackground(isActive: isActive))
      .accessibilityAddTraits(isActive ? .isSelected : [])
  }
}

/// A card behind each line; the current line gets a tinted fill and an accent outline.
private struct CaptionCardBackground: View {
  let isActive: Bool

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
    shape
      .fill(isActive ? AnyShapeStyle(.tint.opacity(0.18)) : AnyShapeStyle(.fill.quaternary))
      .overlay { shape.strokeBorder(.tint, lineWidth: isActive ? 2.5 : 0) }
      .padding(.horizontal, 12)
      .padding(.vertical, 5)
      .animation(.easeInOut(duration: 0.2), value: isActive)
  }
}
