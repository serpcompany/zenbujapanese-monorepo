import SwiftUI

struct SearchView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  let lookupClient: LookupClient
  let recentSearchStore: RecentSearchStore
  let handwritingRecognitionClient: HandwritingRecognitionClient
  let kanjiLookupClient: KanjiLookupClient
  let radicalLookupClient: RadicalLookupClient
  let schoolKanjiClient: SchoolKanjiClient
  let exampleSentenceClient: ExampleSentenceClient
  let focusRequest: Int
  let openNote: (NotesInSearch.Row) -> Void
  @Environment(WordKnowledge.self) private var wordKnowledge
  @Environment(LearnerNotes.self) private var learnerNotes
  @State private var results = LookupSearchResults.empty
  @State private var shown: ShownResults?
  @State private var shownNotes: ShownNotes?
  @State private var presentationState = SearchPresentationState.idle
  @State private var retryID = 0
  @State private var settledSearchTaskID: SearchTaskID?
  @State private var inputMode = SearchInputMode.inactive
  @State private var pickedKanjiQuery: SearchQuery?
  @State private var isConfirmingClearAll = false
  @State private var recentSearchRefreshID = 0
  @State private var recentSearches: [SearchQuery] = []
  @State private var isSearchPresented = false
  @State private var inputPanelMode = SearchInputMode.handwriting
  @FocusState private var isSearchFocused: Bool

  var body: some View {
    searchScreen
      .alert("Clear Recent Lookups?", isPresented: $isConfirmingClearAll) {
        Button("Cancel", role: .cancel) {}
        Button("Clear All", role: .destructive) {
          clearRecentSearches()
        }
      } message: {
        Text("This removes every recent lookup from this device.")
      }
  }

  private var searchScreen: some View {
    let taskID = searchTaskID
    return presentedContent
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      HStack {
        SearchInputModeButtons(mode: inputModeScope)
        Spacer()
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 8)
    }
    .sheet(isPresented: inputPanelPresentation) {
      inputPanelContent
        .padding(.top, 20)
        .dragToCloseSheet(sizeOnMac: AppWindow.inputPanelSize)
        .presentationBackground(SystemColor.panel)
    }
    .navigationTitle("Look Up")
    .searchField(
      text: $query,
      isPresented: $isSearchPresented,
      prompt: Text(dynamicTypeSize >= .xxLarge ? "Look Up" : "Look up Japanese or English"),
      submit: submitTypedQuery
    )
    .searchFocused($isSearchFocused)
    .onChange(of: isSearchFocused) { _, focused in
      if focused { inputMode = .keyboard }
    }
    .onChange(of: isSearchPresented) { _, presented in
      if !presented, inputMode == .keyboard { inputMode = .inactive }
    }
    .toolbar {
      if showsRecentSearchActions {
        ToolbarItem(placement: .barTrailing) {
          SearchActionsMenu {
            Button(role: .destructive) {
              isConfirmingClearAll = true
            } label: {
              Label("Clear Recent Lookups", systemImage: "trash")
            }
            .accessibilityIdentifier("recent-search.clear-all")
          }
        }
      }
    }
    .onChange(of: query) { _, newQuery in
      if !SearchQuery(newQuery).isEmpty, !isSearchPresented { showResultsInField() }
      settledSearchTaskID = nil
      results = .empty
      shown = nil
      shownNotes = nil
      presentationState = .idle
    }
    .task(id: taskID) {
      await search(taskID)
    }
    .task(id: NotesRevisions(read: learnerNotes.revision, shown: shownNotes?.revision)) {
      await refreshNotes()
    }
    .modifier(DrawRecorder(shownNotes, as: "search.notes.drawn", summary: ShownNotes.drawnSummary))
    .onChange(of: focusRequest) { selectInputMode(.keyboard) }
  }

  @ViewBuilder
  private var presentedContent: some View {
    switch resolvedPresentationState {
    case .idle:
      RecentSearchHistoryView(
        recentSearchStore: recentSearchStore,
        refreshID: recentSearchRefreshID,
        selectSearch: selectRecentSearch,
        searches: $recentSearches
      )

    case .loading:
      ProgressView("Looking Up")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("search.loading")

    case .results:
      if let shown {
        SearchResultsView(
          results: results,
          first: shown,
          fromRadicals: pickedKanjiQuery == searchQuery,
          notes: shownNotes?.notes,
          selectRefinement: selectRefinement,
          openNote: openNote
        )
        .id(
          SearchResultsIdentity(
            query: searchQuery,
            entries: results.entries.map(\.id),
            refinement: results.readingRefinement?.query
          )
        )
      }

    case .failure:
      ScrollView {
        ContentUnavailableView {
          Label("Dictionary unavailable", systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        } description: {
          Text("Zenbu couldn't open its offline Language Reference Data.")
        } actions: {
          Button("Retry") {
            retryID += 1
          }
          .buttonStyle(.borderedProminent)
        }
        .padding(.vertical, 24)
      }
      .accessibilityIdentifier("search.failure")

    case .noResults(let noMatches):
      if let notes = shownNotes?.notes {
        List {
          Section {
            noDictionaryMatches(noMatches)
              .listRowSeparator(.hidden)
          }
          NotesInSearchSection(notes: notes, open: openNote)
        }
        .listStyle(.plain)
        .accessibilityIdentifier("search.notes")
      } else {
        noDictionaryMatches(noMatches)
      }
    }
  }

  private func noDictionaryMatches(_ noMatches: NoMatches) -> some View {
    ContentUnavailableView {
      Label(noMatches.title, systemImage: "magnifyingglass")
    }
    .accessibilityIdentifier("search.no-results")
  }

  private var inputPanelPresentation: Binding<Bool> {
    Binding(
      get: { inputMode.opensPanel },
      set: { presented in
        if !presented, inputMode.opensPanel { inputMode = .inactive }
      })
  }

  @ViewBuilder
  private var inputPanelContent: some View {
    switch inputPanelMode {
    case .radicals:
      RadicalInputView(
        query: $query,
        mode: inputModeScope,
        lookupClient: radicalLookupClient,
        submit: submitPickedKanji
      )
    case .grade:
      GradeInputView(
        query: $query,
        mode: inputModeScope,
        schoolKanjiClient: schoolKanjiClient,
        submit: submitPickedKanji
      )
    default:
      HandwritingInputView(
        query: $query,
        mode: inputModeScope,
        recognitionClient: handwritingRecognitionClient,
        kanjiLookupClient: kanjiLookupClient,
        submit: submitComposedQuery
      )
    }
  }

  private func search(_ taskID: SearchTaskID) async {
    var taskID = taskID
    while !Task.isCancelled, settledSearchTaskID != taskID {
      if searchTaskID != taskID {
        taskID = searchTaskID
        continue
      }
      let taskQuery = SearchQuery(taskID.query)
      presentationState = .idle
      guard !taskQuery.isEmpty else {
        results = .empty
        shown = nil
        shownNotes = nil
        return
      }
      presentationState = .loading
      do {
        try await Task.sleep(for: .milliseconds(100))
        try Task.checkCancellation()
        async let searchedResults = lookupClient.search(taskQuery)
        async let searchedExampleCount = exampleSentenceClient.directCount(taskQuery)
        let foundResults = try await searchedResults
        try Task.checkCancellation()
        _ = await searchedExampleCount
        try Task.checkCancellation()
        let exampleCount = await exampleSentenceClient.count(taskQuery, foundResults)
        await FrequencyLists.live.ready()
        await learnerNotes.ready()
        let request = ResultsScreenRequest(
          query: taskQuery,
          results: foundResults.listed,
          exampleCount: exampleCount,
          learner: ResultsLearner(
            sort: UserDefaults.standard.string(forKey: ResultsLearner.sortKey)
              ?? ResultsLearner.defaultSort,
            filter: UserDefaults.standard.string(forKey: ResultsLearner.filterKey)
              ?? ResultsLearner.noFilter,
            known: foundResults.entries.map(\.id).filter(wordKnowledge.isKnown)
              .map(\.rawValue),
            fromRadicals: pickedKanjiQuery == taskQuery),
          lists: FrequencyLists.live.version)
        try Task.checkCancellation()
        let screen = try await request.screen()
        let notes = await learnerNotes.inSearch(for: taskQuery)
        try Task.checkCancellation()
        guard searchTaskID == taskID, settledSearchTaskID != taskID else { continue }
        settledSearchTaskID = taskID
        results = foundResults
        shownNotes = notes
        switch screen {
        case .noResults(let noMatches):
          shown = nil
          presentationState = .noResults(noMatches)
        case .results(let list):
          shown = ShownResults(request: request, list: list)
          presentationState = .results
        }
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled, searchTaskID == taskID, settledSearchTaskID != taskID else {
          continue
        }
        settledSearchTaskID = taskID
        results = .empty
        shown = nil
        shownNotes = nil
        presentationState = .failure
      }
    }
  }

  private func refreshNotes() async {
    guard let shownNotes, shownNotes.revision != learnerNotes.revision else { return }
    let refreshed = await learnerNotes.inSearch(for: shownNotes.query)
    guard !Task.isCancelled, self.shownNotes?.query == shownNotes.query else { return }
    self.shownNotes = refreshed
  }

  private var inputModeScope: Binding<SearchInputMode> {
    Binding(
      get: { inputMode == .inactive ? .keyboard : inputMode },
      set: { selectInputMode($0) })
  }

  private var searchQuery: SearchQuery {
    SearchQuery(query)
  }

  private var searchTaskID: SearchTaskID {
    SearchTaskID(query: query, retryID: retryID)
  }

  private var showsRecentSearchActions: Bool {
    resolvedPresentationState == .idle && !recentSearches.isEmpty
  }

  private var resolvedPresentationState: SearchPresentationState {
    searchQuery.isEmpty ? .idle : presentationState
  }

  private func clearRecentSearches() {
    Task {
      await recentSearchStore.removeAll()
      recentSearchRefreshID += 1
    }
  }

  private func selectRefinement(_ refinement: SearchRefinement) {
    completeSubmission(refinement.query)
  }

  private func selectRecentSearch(_ recentSearch: SearchQuery) {
    completeSubmission(recentSearch)
  }

  private func recordRecentSearch(_ recentSearch: SearchQuery) {
    Task {
      await recentSearchStore.record(recentSearch)
      recentSearchRefreshID += 1
    }
  }

  private func selectInputMode(_ mode: SearchInputMode) {
    pickedKanjiQuery = nil
    if mode.opensPanel { inputPanelMode = mode }
    inputMode = mode
    isSearchFocused = mode == .keyboard
  }

  private func submitComposedQuery(_ submittedQuery: SearchQuery) {
    completeSubmission(submittedQuery)
  }

  private func submitPickedKanji(_ submittedQuery: SearchQuery) {
    completeSubmission(submittedQuery, pickedKanji: true)
  }

  private func submitTypedQuery() {
    completeSubmission(SearchQuery(query))
  }

  private func completeSubmission(_ submittedQuery: SearchQuery, pickedKanji: Bool = false) {
    pickedKanjiQuery = pickedKanji ? submittedQuery : nil
    query = submittedQuery.value
    recordRecentSearch(submittedQuery)
    showResultsInField()
  }

  private func showResultsInField() {
    isSearchFocused = false
    inputMode = .inactive
    guard !isSearchPresented else { return }
    isSearchPresented = true
    Task { @MainActor in
      isSearchFocused = false
      inputMode = .inactive
    }
  }
}

private struct NotesRevisions: Hashable {
  let read: Int
  let shown: Int?
}

private struct SearchTaskID: Hashable {
  let query: String
  let retryID: Int
}

private enum SearchPresentationState: Equatable {
  case idle
  case loading
  case results
  case noResults(NoMatches)
  case failure
}

private struct SearchResultsIdentity: Hashable {
  let query: SearchQuery
  let entries: [LanguageReferenceID]
  let refinement: SearchQuery?
}
