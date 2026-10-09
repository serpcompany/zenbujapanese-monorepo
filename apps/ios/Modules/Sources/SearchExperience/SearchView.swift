import SwiftUI

struct SearchView: View {
  @Binding var query: String
  let lookupClient: LookupClient
  let recentSearchStore: RecentSearchStore
  let handwritingRecognitionClient: HandwritingRecognitionClient
  let radicalLookupClient: RadicalLookupClient
  let exampleSentenceClient: ExampleSentenceClient
  let frequencyCapability: FrequencyCapability
  let frequencyRefreshID: Int
  let focusRequest: Int
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
    return VStack(spacing: 0) {
      SearchBar(
        query: $query,
        isFocused: $isSearchFocused,
        isInputActive: inputMode != .inactive,
        activateKeyboard: { inputMode = .keyboard },
        cancel: deactivateInput
      ) { submittedQuery in
        sparseRadicalQuery = nil
        completeSubmission(submittedQuery)
      }

      presentedContent

      inputModeAccessory
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if inputMode == .radicals {
        RadicalInputView(
          query: $query,
          lookupClient: radicalLookupClient,
          selectMode: selectInputMode,
          submit: submitRadicalQuery
        )
      }
    }
    .navigationTitle("Search")
    .toolbar {
      if showsRecentSearchActions {
        ToolbarItem(placement: .barTrailing) {
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
    .onChange(of: query) { _, _ in
      settledSearchTaskID = nil
      results = .empty
      exampleCount = 0
      presentationState = .idle
    }
    .task(id: taskID) {
      await search(taskID)
    }
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

    case .specializedInput:
      Color.clear
    }
  }

  @ViewBuilder
  private var inputModeAccessory: some View {
    switch inputMode {
    case .keyboard where isSearchFocused:
      SearchInputModePicker(
        selectedMode: .keyboard,
        selectMode: selectInputMode
      )
    case .handwriting:
      HandwritingInputView(
        query: $query,
        recognitionClient: handwritingRecognitionClient,
        selectMode: selectInputMode,
        submit: submitComposedQuery
      )
    case .radicals:
      EmptyView()
    default:
      EmptyView()
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

  private var searchQuery: SearchQuery {
    SearchQuery(query)
  }

  private var searchTaskID: SearchTaskID {
    SearchTaskID(query: query, retryID: retryID)
  }

  private var showsRecentSearches: Bool {
    searchQuery.isEmpty && (inputMode == .inactive || inputMode == .keyboard)
  }

  private var showsRecentSearchActions: Bool {
    resolvedPresentationState == .idle && !recentSearches.isEmpty
  }

  private var resolvedPresentationState: SearchPresentationState {
    guard searchQuery.isEmpty else { return presentationState }
    return showsRecentSearches ? .idle : .specializedInput
  }

  private func clearRecentSearches() {
    Task {
      await recentSearchStore.removeAll()
      recentSearchRefreshID += 1
    }
  }

  private func selectRefinement(_ refinement: SearchRefinement) {
    sparseRadicalQuery = nil
    query = refinement.query.value
    deactivateInput()
    recordRecentSearch(refinement.query)
  }

  private func selectRecentSearch(_ recentSearch: SearchQuery) {
    sparseRadicalQuery = nil
    query = recentSearch.value
    deactivateInput()
    recordRecentSearch(recentSearch)
  }

  private func recordRecentSearch(_ recentSearch: SearchQuery) {
    Task {
      await recentSearchStore.record(recentSearch)
      recentSearchRefreshID += 1
    }
  }

  private func selectInputMode(_ mode: SearchInputMode) {
    sparseRadicalQuery = nil
    inputMode = mode
    isSearchFocused = mode == .keyboard
  }

  private func submitComposedQuery(_ submittedQuery: SearchQuery) {
    sparseRadicalQuery = nil
    query = submittedQuery.value
    recordRecentSearch(submittedQuery)
    deactivateInput()
  }

  private func submitRadicalQuery(_ submittedQuery: SearchQuery) {
    sparseRadicalQuery = submittedQuery
    query = submittedQuery.value
    recordRecentSearch(submittedQuery)
    isSearchFocused = false
    inputMode = .inactive
  }

  private func completeSubmission(_ submittedQuery: SearchQuery) {
    query = submittedQuery.value
    recordRecentSearch(submittedQuery)
    deactivateInput()
  }

  private func deactivateInput() {
    isSearchFocused = false
    inputMode = .inactive
  }
}

private struct SearchTaskID: Hashable {
  let query: String
  let retryID: Int
}

private enum SearchPresentationState: Equatable {
  case idle
  case specializedInput
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
