import SwiftUI

@MainActor
@Observable
final class HighlightedWords {
  struct Highlight: Hashable {
    let text: String
    let entry: LanguageReferenceID
  }

  private var shown: (highlight: Highlight, words: [JapaneseTextToken])?

  func words(
    of text: String, in page: ImageTextPage, highlighting entry: DictionaryEntry?
  ) -> [JapaneseTextToken] {
    guard let entry, let shown, shown.highlight == Highlight(text: text, entry: entry.id)
    else { return page.words(of: text) }
    return shown.words
  }

  func link(_ highlight: Highlight?, using analysis: JapaneseTextAnalysisClient) async {
    guard let highlight, shown?.highlight != highlight,
      let words = await analysis.linkedTexts([highlight.text], highlight.entry).first,
      !Task.isCancelled
    else { return }
    shown = (highlight, words)
  }
}

struct ImageTextLineCards: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  let page: ImageTextPage
  let model: ImageTextFlowModel
  let textAnalysisClient: JapaneseTextAnalysisClient
  let highlightedEntry: DictionaryEntry?
  let isWordSheetPresented: Bool
  let selectedRegion: ImageTextRegion?
  @Binding var activeLineID: Int?
  let selectRegion: (ImageTextRegion) -> Void
  let openWord: (DictionaryEntry, Int) -> Void
  let openCandidates: (String, [DictionaryEntry], Int) -> Void
  @State private var scrollTarget: Int?
  @State private var highlighted = HighlightedWords()

  var body: some View {
    GeometryReader { geometry in
      VStack(spacing: 0) {
        ImageTextCanvas(
          page: page,
          showsRegions: model.showsHighlights,
          selectedRegion: selectedRegion,
          outlinedLineID: activeLineID,
          selectRegion: { region in
            scrollTarget = region.lineID
            selectRegion(region)
          }
        )
        .frame(height: geometry.size.height * 0.38)
        .padding(.bottom, 4)

        ScrollViewReader { proxy in
          List {
            ForEach(page.lines) { line in
              let isActive = line.id == activeLineID
              CaptionCard(
                text: line.text,
                words: highlighted.words(
                  of: line.text, in: page, highlighting: isActive ? highlightedEntry : nil),
                translation: model.translation(of: line.text),
                identifierPrefix: "image-text.line.\(line.id)",
                openCandidates: { surface, candidates in openCandidates(surface, candidates, line.id) },
                openWord: { entry in openWord(entry, line.id) }
              )
              .contentShape(.rect)
              .onTapGesture { activeLineID = line.id }
              .accessibilityElement(children: .contain)
              .accessibilityIdentifier("image-text.line.\(line.id)")
              .captionCardRow(isActive: isActive)
              .id(line.id)
            }
          }
          .listStyle(.plain)
          .contentMargins(.top, 8, for: .scrollContent)
          .contentMargins(
            .bottom, isWordSheetPresented ? geometry.size.height * 0.45 : 16, for: .scrollContent
          )
          .onChange(of: scrollTarget) { _, lineID in
            guard let lineID else { return }
            withAnimation { proxy.scrollTo(lineID, anchor: .top) }
            scrollTarget = nil
          }
          .accessibilityIdentifier("image-text.lines")
        }
      }
    }
    .onAppear {
      if activeLineID == nil { activeLineID = page.lines.first?.id }
    }
    .task(id: model.selectedPage) { translateIfReady() }
    .task(id: highlight) { await highlighted.link(highlight, using: textAnalysisClient) }
  }

  private var highlight: HighlightedWords.Highlight? {
    guard let highlightedEntry, let line = page.lines.first(where: { $0.id == activeLineID })
    else { return nil }
    return HighlightedWords.Highlight(text: line.text, entry: highlightedEntry.id)
  }

  private func translateIfReady() {
    guard model.isSelected(page), readingAidPreferences.showsTranslations,
      case .idle = model.translationState
    else { return }
    model.requestTranslation(preparesIfNeeded: false)
  }
}

struct ImageTextReader: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  let page: ImageTextPage
  let model: ImageTextFlowModel
  let textAnalysisClient: JapaneseTextAnalysisClient
  let highlightedEntry: DictionaryEntry?
  let activeParagraphID: Int?
  let isWordSheetPresented: Bool
  let openWord: (DictionaryEntry, Int) -> Void
  let openCandidates: (String, [DictionaryEntry], Int) -> Void
  @State private var highlighted = HighlightedWords()

  var body: some View {
    GeometryReader { geometry in
      List {
        ForEach(page.paragraphs) { paragraph in
          let isActive = isWordSheetPresented && paragraph.id == activeParagraphID
          CaptionCard(
            text: paragraph.text,
            words: highlighted.words(
              of: paragraph.text, in: page, highlighting: isActive ? highlightedEntry : nil),
            translation: model.translation(of: paragraph.text),
            identifierPrefix: "image-text.paragraph.\(paragraph.id)",
            openCandidates: { surface, candidates in
              openCandidates(surface, candidates, paragraph.id)
            },
            openWord: { entry in openWord(entry, paragraph.id) }
          )
          .captionCardRow(isActive: isActive)
        }
      }
      .listStyle(.plain)
      .dynamicTypeSize(dynamicTypeSize.oneStepLarger)
      .contentMargins(.top, 8, for: .scrollContent)
      .contentMargins(
        .bottom, isWordSheetPresented ? geometry.size.height * 0.45 : 16, for: .scrollContent
      )
      .accessibilityIdentifier("image-text.reader")
    }
    .task(id: model.selectedPage) {
      if model.isSelected(page), readingAidPreferences.showsTranslations,
        case .idle = model.translationState
      {
        model.requestTranslation(preparesIfNeeded: false)
      }
    }
    .task(id: highlight) { await highlighted.link(highlight, using: textAnalysisClient) }
  }

  private var highlight: HighlightedWords.Highlight? {
    guard isWordSheetPresented, let highlightedEntry,
      let paragraph = page.paragraphs.first(where: { $0.id == activeParagraphID })
    else { return nil }
    return HighlightedWords.Highlight(text: paragraph.text, entry: highlightedEntry.id)
  }
}

extension DynamicTypeSize {
  fileprivate var oneStepLarger: DynamicTypeSize {
    let sizes = DynamicTypeSize.allCases
    guard let index = sizes.firstIndex(of: self), index + 1 < sizes.count else { return self }
    return sizes[index + 1]
  }
}
