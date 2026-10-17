import SwiftUI

struct GradeInputView: View {
  @Binding var query: String
  @Binding var mode: SearchInputMode
  let schoolKanjiClient: SchoolKanjiClient
  let submit: (SearchQuery) -> Void
  @Environment(WordKnowledge.self) private var wordKnowledge
  @Environment(ReadingAidPreferences.self) private var readingAids
  @AppStorage("search.grade.closed-sections") private var closedSections = ClosedTileSections()
  @State private var closedWhileFiltering: Set<String> = []
  @State private var filter = ""
  @State private var panel: SchoolKanjiPanel?
  @State private var shownFilter = ""
  @State private var loadFailed = false

  var body: some View {
    SearchInputPanel(mode: $mode) {
      SectionedTilePanel(accessibilityIdentifier: "grade.grid", returnsToTopOn: shownFilter) {
        filterField
      } content: {
        gradeSections
      }
    } actions: {
      EmptyView()
    }
    .task(id: request) { await load(request) }
    .onChange(of: filter) { closedWhileFiltering = [] }
  }

  private func load(_ request: SchoolKanjiRequest) async {
    let client = schoolKanjiClient
    do {
      let answered = try await Task.detached(priority: .userInitiated) {
        try client.panel(request)
      }.value
      guard !Task.isCancelled else { return }
      panel = answered
      shownFilter = request.filter
    } catch {
      loadFailed = true
    }
  }

  private var request: SchoolKanjiRequest {
    SchoolKanjiRequest(
      filter: filter,
      known: wordKnowledge.knownRecords.compactMap(\.kanji).map(\.rawValue))
  }

  private var filterField: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      TextField("Filter by meaning, reading or kanji", text: $filter)
        .textFieldStyle(.plain)
        .textEntry(.uncapitalized)
        .autocorrectionDisabled()
        .accessibilityIdentifier("grade.filter")
      if !filter.isEmpty {
        Button("Clear Filter", systemImage: "xmark.circle.fill") { filter = "" }
          .labelStyle(.iconOnly)
          .buttonStyle(.plain)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("grade.filter.clear")
      }
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 54)
    .background(SystemColor.panelContent, in: .rect(cornerRadius: 16))
  }

  @ViewBuilder
  private var gradeSections: some View {
    if loadFailed {
      PanelDataUnavailable(title: "Kanji lists unavailable")
        .accessibilityIdentifier("grade.load-failure")
    } else if let panel, panel.sections.isEmpty {
      ContentUnavailableView.search(text: filter)
        .accessibilityIdentifier("grade.no-matches")
    } else {
      SectionedTiles(
        sections: (panel?.sections ?? []).map { section in
          TileSection(
            id: section.id, title: section.title, spoken: section.spoken,
            accessibilityIdentifier: "grade.section.\(section.id)", items: section.kanji)
        },
        itemID: \.character,
        closed: panel?.filtered == true ? $closedWhileFiltering : $closedSections.ids
      ) { section in
        sectionSummary(panel?.sections.first { $0.id == section.id })
      } tile: { kanji in
        PanelTile(
          glyph: kanji.character,
          caption: readingAids.showsKanjiMeanings && !kanji.meaning.isEmpty ? kanji.meaning : nil,
          isKnown: kanji.known
        ) {
          SearchInputCandidate.accept(kanji.character, into: $query, submit: submit)
        }
        .accessibilityValue(kanji.known ? "Known" : "")
        .accessibilityIdentifier("grade.kanji.\(kanji.character)")
      }
    }
  }

  @ViewBuilder
  private func sectionSummary(_ section: SchoolKanjiPanel.Section?) -> some View {
    if let section {
      HStack(spacing: 6) {
        if section.known > 0 {
          Label {
            Text(section.known, format: .number)
          } icon: {
            Image(systemName: "checkmark")
          }
          .labelStyle(.titleAndIcon)
          .foregroundStyle(.green)
        }
        Text(section.count)
          .foregroundStyle(.secondary)
      }
      .monospacedDigit()
    }
  }
}
