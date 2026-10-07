import SwiftUI

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
                translation: model.translation(of: line.text),
                highlightedEntry: isActive ? highlightedEntry : nil,
                japaneseTextAnalysisClient: textAnalysisClient,
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

  var body: some View {
    GeometryReader { geometry in
      List {
        ForEach(page.paragraphs) { paragraph in
          let isActive = isWordSheetPresented && paragraph.id == activeParagraphID
          CaptionCard(
            text: paragraph.text,
            translation: model.translation(of: paragraph.text),
            highlightedEntry: isActive ? highlightedEntry : nil,
            japaneseTextAnalysisClient: textAnalysisClient,
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
  }
}

extension DynamicTypeSize {
  fileprivate var oneStepLarger: DynamicTypeSize {
    let sizes = DynamicTypeSize.allCases
    guard let index = sizes.firstIndex(of: self), index + 1 < sizes.count else { return self }
    return sizes[index + 1]
  }
}
