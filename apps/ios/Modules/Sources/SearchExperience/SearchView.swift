import SwiftUI

struct SearchView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  let lookupClient: LookupClient
  let recentSearchStore: RecentSearchStore
  let handwritingRecognitionClient: HandwritingRecognitionClient
  let kanjiLookupClient: KanjiLookupClient
  let radicalLookupClient: RadicalLookupClient
  let exampleSentenceClient: ExampleSentenceClient
  let frequencyCapability: FrequencyCapability
  let frequencyRefreshID: Int
  @State private var results = LookupSearchResults.empty
  @State private var presentationState = SearchPresentationState.idle
  @State private var retryID = 0
  @State private var settledSearchTaskID: SearchTaskID?
  @State private var inputMode = SearchInputMode.inactive
  @State private var sparseRadicalQuery: SearchQuery?
  @State private var exampleCount = 0
  @State private var isConfirmingClearAll = false
  @State private var recentSearchRefreshID = 0
  @State private var recentSearches: [SearchQuery] = []
  @State private var isSearchPresented = false
  @State private var inputPanelMode = SearchInputMode.handwriting
  @FocusState private var isSearchFocused: Bool

  var body: some View {
    searchScreen
      .alert("Clear Recent Searches?", isPresented: $isConfirmingClearAll) {
        Button("Cancel", role: .cancel) {}
        Button("Clear All", role: .destructive) {
          clearRecentSearches()
        }
      } message: {
        Text("This removes every recent Search query from this device.")
      }
  }

  private var searchScreen: some View {
    let taskID = searchTaskID
    return presentedContent
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .fullScreenCover(isPresented: inputPanelPresentation, onDismiss: focusKeyboardIfChosen) {
      NavigationStack {
        inputPanelContent
          .toolbar {
            ToolbarItem(placement: .principal) {
              Picker("Search input", selection: inputModeScope) { inputModeOptions }
                .pickerStyle(.segmented)
            }
            ToolbarItem(placement: .topBarTrailing) {
              Button("Close", systemImage: "xmark", role: .close) {
                inputMode = .inactive
              }
            }
          }
          .navigationBarTitleDisplayMode(.inline)
      }
    }
    .navigationTitle("Search")
    .searchField(
      text: $query,
      isPresented: $isSearchPresented,
      prompt: Text(dynamicTypeSize >= .xxLarge ? "Search" : "Search Japanese or English"),
      submit: submitTypedQuery
    )
    .searchScopes(inputModeScope, activation: .onSearchPresentation) { inputModeOptions }
    .searchFocused($isSearchFocused)
    .onChange(of: isSearchFocused) { _, focused in
      if focused { inputMode = .keyboard }
    }
    .onChange(of: isSearchPresented) { _, presented in
      if !presented { inputMode = .inactive }
    }
    .toolbar {
      if showsRecentSearchActions {
        ToolbarItem(placement: .topBarTrailing) {
          SearchActionsMenu {
            Button(role: .destructive) {
              isConfirmingClearAll = true
            } label: {
              Label("Clear Recent Searches", systemImage: "trash")
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
      exampleCount = 0
      presentationState = .idle
    }
    .task(id: taskID) {
      await search(taskID)
    }
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
      ProgressView("Searching")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("search.loading")

    case .results:
      SearchResultsView(
        query: searchQuery,
        results: results,
        exampleCount: exampleCount,
        rankedEntryLimit: sparseRadicalQuery == searchQuery
          ? results.leadingLexicalEntryCount : nil,
        frequencyCapability: frequencyCapability,
        frequencyRefreshID: frequencyRefreshID,
        selectRefinement: selectRefinement
      )
      .id(
        SearchResultsIdentity(
          query: searchQuery,
          entries: results.entries.map(\.id),
          refinement: results.readingRefinement?.query
        )
      )

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

    case .noResults:
      ContentUnavailableView {
        Label("No Dictionary Matches", systemImage: "magnifyingglass")
      } description: {
        Text("Try another Japanese or English Search query.")
      }
      .accessibilityIdentifier("search.no-results")
    }
  }

  @ViewBuilder
  private var inputModeOptions: some View {
    Text("Keyboard").tag(SearchInputMode.keyboard)
    Text("Handwriting").tag(SearchInputMode.handwriting)
    Text("Radicals").tag(SearchInputMode.radicals)
  }

  private var inputPanelPresentation: Binding<Bool> {
    Binding(
      get: { inputMode == .handwriting || inputMode == .radicals },
      set: { presented in
        if !presented, inputMode == .handwriting || inputMode == .radicals {
          inputMode = .inactive
        }
      })
  }

  private func focusKeyboardIfChosen() {
    if inputMode == .keyboard { isSearchFocused = true }
  }

  @ViewBuilder
  private var inputPanelContent: some View {
    if inputPanelMode == .radicals {
      RadicalInputView(
        query: $query,
        lookupClient: radicalLookupClient,
        submit: submitRadicalQuery
      )
    } else {
      HandwritingInputView(
        query: $query,
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
        exampleCount = 0
        return
      }
      presentationState = .loading
      do {
        try await Task.sleep(for: .milliseconds(100))
        try Task.checkCancellation()
        async let searchedResults = lookupClient.search(taskQuery)
        async let searchedExampleCount = SearchResultsScreen.directExampleCount(
          taskQuery, using: exampleSentenceClient)
        let foundResults = try await searchedResults
        try Task.checkCancellation()
        let directExampleCount = await searchedExampleCount
        try Task.checkCancellation()
        let foundExampleCount = await SearchResultsScreen.exampleCount(
          foundResults, query: taskQuery, directCount: directExampleCount,
          using: exampleSentenceClient)
        try Task.checkCancellation()
        guard searchTaskID == taskID, settledSearchTaskID != taskID else { continue }
        settledSearchTaskID = taskID
        results = foundResults
        exampleCount = foundExampleCount
        if SearchResultsScreen.showsNoResults(
          foundResults, exampleCount: foundExampleCount, query: taskQuery)
        {
          presentationState = .noResults
        } else {
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
        exampleCount = 0
        presentationState = .failure
      }
    }
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
    sparseRadicalQuery = nil
    if mode == .handwriting || mode == .radicals { inputPanelMode = mode }
    inputMode = mode
    isSearchFocused = mode == .keyboard
  }

  private func submitComposedQuery(_ submittedQuery: SearchQuery) {
    completeSubmission(submittedQuery)
  }

  private func submitRadicalQuery(_ submittedQuery: SearchQuery) {
    completeSubmission(submittedQuery, sparseRadical: true)
  }

  private func submitTypedQuery() {
    completeSubmission(SearchQuery(query))
  }

  private func completeSubmission(_ submittedQuery: SearchQuery, sparseRadical: Bool = false) {
    sparseRadicalQuery = sparseRadical ? submittedQuery : nil
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

private struct SearchTaskID: Hashable {
  let query: String
  let retryID: Int
}

private enum SearchPresentationState: Equatable {
  case idle
  case loading
  case results
  case noResults
  case failure
}

private struct SearchResultsIdentity: Hashable {
  let query: SearchQuery
  let entries: [LanguageReferenceID]
  let refinement: SearchQuery?
}
