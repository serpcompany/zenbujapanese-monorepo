import SwiftUI

struct CaptionCard: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences

  let text: String
  let translation: String?
  let highlightedEntry: DictionaryEntry?
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
  func captionCardRow(isActive: Bool, cornerRadius: CGFloat = 16, gapAbove: CGFloat = 0)
    -> some View
  {
    padding(.horizontal, 8)
      .padding(.top, gapAbove)
      .listRowSeparator(.hidden)
      .listRowBackground(
        CaptionCardBackground(isActive: isActive, cornerRadius: cornerRadius)
          .padding(.top, gapAbove))
      .accessibilityAddTraits(isActive ? .isSelected : [])
  }
}

private struct CaptionCardBackground: View {
  let isActive: Bool
  let cornerRadius: CGFloat

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    shape
      .fill(isActive ? AnyShapeStyle(.tint.opacity(0.18)) : AnyShapeStyle(.fill.quaternary))
      .overlay { shape.strokeBorder(.tint, lineWidth: isActive ? 2.5 : 0) }
      .padding(.horizontal, 12)
      .padding(.vertical, 5)
      .animation(.easeInOut(duration: 0.2), value: isActive)
  }
}
