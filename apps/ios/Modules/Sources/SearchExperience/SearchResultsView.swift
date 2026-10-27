import SwiftUI

struct ShownResults: Hashable, Sendable {
  let request: ResultsScreenRequest
  let list: ResultsList
}

struct SearchResultsView: View {
  let results: LookupSearchResults
  let pickedKanji: Bool
  let notes: NotesInSearch?
  let selectRefinement: (SearchRefinement) -> Void
  let openNote: (NotesInSearch.Row) -> Void
  @State private var shown: ShownResults
  @State private var animatesNextList = false
  @AppStorage(ResultsLearner.sortKey) private var sort = ResultsLearner.defaultSort
  @AppStorage(ResultsLearner.filterKey) private var filter = ResultsLearner.noFilter
  @Environment(WordKnowledge.self) private var wordKnowledge

  init(
    results: LookupSearchResults,
    first: ShownResults,
    pickedKanji: Bool,
    notes: NotesInSearch?,
    selectRefinement: @escaping (SearchRefinement) -> Void,
    openNote: @escaping (NotesInSearch.Row) -> Void
  ) {
    self.results = results
    self.pickedKanji = pickedKanji
    self.notes = notes
    self.selectRefinement = selectRefinement
    self.openNote = openNote
    _shown = State(initialValue: first)
  }

  var body: some View {
    let list = shown.list
    let entries = Dictionary(
      results.entries.map { ($0.id.rawValue, $0) }, uniquingKeysWith: { first, _ in first })
    List {
      if let menu = list.menu {
        Section {
          SearchResultsMenu(menu: menu, chooseSort: chooseSort, chooseFilter: chooseFilter)
            .listRowSeparator(.hidden, edges: .top)
            .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
        }
      }

      if let examples = list.examples {
        Section {
          NavigationLink(
            value: SearchExperienceRoute.examples(
              shown.request.query,
              examples.highlightedEntry.flatMap { entries[$0] },
              examples.usesHighlightedEntryExamples
            )
          ) {
            Text(examples.title)
              .font(.headline)
          }
          .accessibilityIdentifier("search.examples")
        }
      }

      if let refinement = list.readingRefinement, let target = results.readingRefinement {
        Section {
          Button {
            selectRefinement(target)
          } label: {
            Text(refinement.title)
              .font(.headline)
          }
          .accessibilityLabel(refinement.spoken)
          .accessibilityIdentifier("search.reading-refinement")
        }
      }

      if list.sections.contains(.discoveredWords) {
        Section {
          if let heading = list.heading {
            SearchListHeading(LocalizedStringKey(heading))
          }
          resultRows(list.rows, entries: entries)
        }
      } else if list.sections.contains(.results) {
        Section {
          if let kanji = list.kanji, let character = KanjiCharacter(kanji.character) {
            KanjiPrimaryRow(
              kanji: kanji, opening: .link(.kanji(character, kanji.entry.flatMap { entries[$0] })))
          }
          resultRows(list.rows, entries: entries)
          if let hidden = list.hiddenByFilter {
            ContentUnavailableView {
              Label("No Words Match Your Filter", systemImage: "line.3.horizontal.decrease.circle")
            } description: {
              Text(hidden)
            } actions: {
              Button("Clear Filter") {
                if let all = list.menu?.filter.options.first { chooseFilter(all) }
              }
            }
            .listRowSeparator(.hidden)
            .accessibilityIdentifier("search.filter-empty")
          }
          if let notice = list.frequencyNotice {
            Label(notice, systemImage: "info.circle")
              .font(.footnote)
              .foregroundStyle(.secondary)
              .listRowSeparator(.hidden)
              .accessibilityIdentifier("search.frequency-ordering-unavailable")
          }
        }
      }

      if let notes {
        NotesInSearchSection(notes: notes, open: openNote)
      }
    }
    .listStyle(.plain)
    .id(shown.request.query)
    .accessibilityIdentifier("search.results")
    .modifier(DrawRecorder(list, as: "search.results.drawn", summary: ResultsList.drawnSummary))
    .task(id: request) {
      let request = request
      guard request != shown.request,
        case .results(let list)? = try? await request.screen(),
        !Task.isCancelled
      else { return }
      let animates = animatesNextList
      animatesNextList = false
      withAnimation(animates ? .default : nil) {
        shown = ShownResults(request: request, list: list)
      }
    }
  }

  private var request: ResultsScreenRequest {
    var request = shown.request
    request.learner = ResultsLearner(
      sort: sort, filter: filter,
      known: results.entries.map(\.id).filter(wordKnowledge.isKnown).map(\.rawValue),
      pickedKanji: pickedKanji)
    request.lists = FrequencyLists.live.version
    return request
  }

  private func resultRows(
    _ rows: [ListedWord], entries: [String: DictionaryEntry]
  ) -> some View {
    ForEach(rows, id: \.id) { row in
      if let entry = entries[row.id] {
        ResultRow(entry: entry, row: row, link: SearchExperienceRoute.word(entry, nil))
      }
    }
  }

  private func chooseSort(_ choice: ResultsChoice) {
    guard choice.value != sort else { return }
    animatesNextList = true
    sort = choice.value
    AccessibilityNotification.Announcement(choice.announcement).post()
  }

  private func chooseFilter(_ choice: ResultsChoice) {
    guard choice.value != filter else { return }
    animatesNextList = true
    filter = choice.value
    AccessibilityNotification.Announcement(choice.announcement).post()
  }
}
