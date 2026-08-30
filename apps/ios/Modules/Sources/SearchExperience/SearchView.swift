import SwiftUI
import UIKit

struct SearchView: View {
  @Binding var query: String
  let lookupClient: LookupClient
  let recentSearchStore: RecentSearchStore
  let handwritingRecognitionClient: HandwritingRecognitionClient
  let cameraAuthorizationClient: CameraAuthorizationClient
  let radicalLookupClient: RadicalLookupClient
  let exampleSentenceClient: ExampleSentenceClient
  let openResult: (DictionaryEntry) -> Void
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void
  let openExamples: (SearchQuery, DictionaryEntry?, Bool) -> Void
  let openImageText: ([ImageTextAsset]) -> Void
  let imageImportInitialDirectory: URL?
  @State private var results = LookupSearchResults.empty
  @State private var hasCompletedSearch = false
  @State private var searchFailed = false
  @State private var retryID = 0
  @State private var inputMode = SearchInputMode.inactive
  @State private var sparseRadicalQuery: SearchQuery?
  @State private var exampleCount = 0
  @State private var showsImageSources = false
  @State private var presentedImageSource: ImageSourceSheet?
  @State private var imageImportAlert: ImageImportAlert?
  @State private var imageImportTask: Task<Void, Never>?
  @State private var isConfirmingClearAll = false
  @State private var recentSearchRefreshID = 0
  @FocusState private var isSearchFocused: Bool

  var body: some View {
    VStack(spacing: 0) {
      SearchBar(
        query: $query,
        isFocused: $isSearchFocused,
        isInputActive: inputMode != .inactive,
        activateKeyboard: { inputMode = .keyboard },
        openImageSource: { showsImageSources = true },
        cancel: deactivateInput
      ) { submittedQuery in
        sparseRadicalQuery = nil
        completeSubmission(submittedQuery)
      }

      if showsRecentSearches {
        RecentSearchHistoryView(
          recentSearchStore: recentSearchStore,
          refreshID: recentSearchRefreshID,
          requestClearAll: { isConfirmingClearAll = true },
          selectSearch: selectRecentSearch
        )
      } else if !results.isEmpty || exampleCount > 0
        || (hasCompletedSearch && searchQuery.isSingleKanji)
      {
        SearchResultsView(
          query: searchQuery,
          results: results,
          exampleCount: exampleCount,
          showsAdditionalMatches: sparseRadicalQuery != searchQuery,
          selectRefinement: selectRefinement,
          openResult: openResult,
          openKanji: openKanji,
          openExamples: {
            openExamples(
              searchQuery,
              results.primaryEntry(for: searchQuery),
              results.usesPrimaryEntryExamples
            )
          }
        )
        .id(
          SearchResultsIdentity(
            query: searchQuery,
            best: results.best.map(\.id),
            additional: results.additional.map(\.id),
            refinement: results.readingRefinement?.query
          )
        )
      } else if searchFailed {
        LookupFailureView {
          retryID += 1
        }
      } else if hasCompletedSearch && !searchQuery.isEmpty {
        ZenbuTheme.background
          .accessibilityElement()
          .accessibilityLabel("No dictionary matches")
          .accessibilityIdentifier("search.no-results")
      } else {
        ZenbuTheme.background
      }

      switch inputMode {
      case .keyboard where isSearchFocused:
        SearchInputModeBar(
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
        .padding(.bottom, 64)
      case .radicals:
        RadicalInputView(
          query: $query,
          lookupClient: radicalLookupClient,
          selectMode: selectInputMode,
          submit: submitRadicalQuery
        )
        .padding(.bottom, 64)
      default:
        EmptyView()
      }
    }
    .background(ZenbuTheme.background)
    .navigationTitle("Search")
    .onChange(of: query) { _, _ in
      results = .empty
      exampleCount = 0
      hasCompletedSearch = false
      searchFailed = false
    }
    .task(id: SearchTaskID(query: query, retryID: retryID)) {
      hasCompletedSearch = false
      searchFailed = false
      guard !searchQuery.isEmpty else {
        results = .empty
        exampleCount = 0
        return
      }
      do {
        try await Task.sleep(for: .milliseconds(100))
        guard !Task.isCancelled else { return }
        results = .empty
        exampleCount = 0
        async let searchedResults = lookupClient.search(searchQuery)
        async let searchedExampleCount = exampleSentenceClient.count(searchQuery)
        let foundResults = try await searchedResults
        try Task.checkCancellation()
        results = foundResults
        let directExampleCount = (try? await searchedExampleCount) ?? 0
        try Task.checkCancellation()
        if foundResults.usesPrimaryEntryExamples,
          let entry = foundResults.primaryEntry(for: searchQuery)
        {
          exampleCount = (try? await exampleSentenceClient.examples(entry).count) ?? 0
        } else {
          exampleCount = directExampleCount
        }
        try Task.checkCancellation()
        hasCompletedSearch = true
      } catch is CancellationError {
        return
      } catch {
        results = .empty
        exampleCount = 0
        searchFailed = true
      }
    }
    .confirmationDialog("Image Search", isPresented: $showsImageSources) {
      Button("Take Photo") { presentCamera() }
        .accessibilityIdentifier("image-source.camera")
      Button("Photo Library") { presentPhotoLibrary() }
        .accessibilityIdentifier("image-source.photo-library")
      Button("Files") { presentedImageSource = .files }
        .accessibilityIdentifier("image-source.files")
      Button("Cancel", role: .cancel) {}
    }
    .sheet(item: $presentedImageSource) { source in
      switch source {
      case .camera:
        ImageCameraPicker { result in
          presentedImageSource = nil
          importCameraImage(result)
        }
        .ignoresSafeArea()
      case .photoLibrary:
        ImagePhotoLibraryPicker { result in
          presentedImageSource = nil
          importPhotoLibraryImages(result)
        }
        .ignoresSafeArea()
      case .files:
        ImageFilePicker(initialDirectory: imageImportInitialDirectory) { result in
          presentedImageSource = nil
          importImages(result)
        }
        .ignoresSafeArea()
      }
    }
    .alert(item: $imageImportAlert) { alert in
      if alert.offersSettings {
        Alert(
          title: Text(alert.title),
          message: Text(alert.message),
          primaryButton: .default(
            Text("Open Settings"), action: cameraAuthorizationClient.openSettings),
          secondaryButton: .cancel()
        )
      } else {
        Alert(
          title: Text(alert.title),
          message: Text(alert.message),
          dismissButton: .default(Text("OK"))
        )
      }
    }
    .alert("Clear Recent Searches?", isPresented: $isConfirmingClearAll) {
      Button("Cancel", role: .cancel) {}
      Button("Clear All", role: .destructive) {
        clearRecentSearches()
      }
    } message: {
      Text("This removes every recent Search query from this device.")
    }
    .onDisappear {
      imageImportTask?.cancel()
      imageImportTask = nil
    }
  }

  private var searchQuery: SearchQuery {
    SearchQuery(query)
  }

  private var showsRecentSearches: Bool {
    inputMode == .keyboard && searchQuery.isEmpty
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
    recentSearchStore.record(recentSearch)
    recentSearchRefreshID += 1
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
    isSearchFocused = false
    inputMode = .handwriting
  }

  private func submitRadicalQuery(_ submittedQuery: SearchQuery) {
    sparseRadicalQuery = submittedQuery
    query = submittedQuery.value
    recordRecentSearch(submittedQuery)
    isSearchFocused = false
    inputMode = .radicals
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

  private func importImages(_ result: Result<[URL], Error>) {
    guard case .success(let urls) = result else {
      imageImportAlert = .importFailure("The Files selection could not be read.")
      return
    }
    imageImportTask?.cancel()
    imageImportTask = Task {
      var assets: [ImageTextAsset] = []
      for url in urls.prefix(8) {
        guard !Task.isCancelled else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        if let asset = try? await ImageTextAsset.loadCopy(from: url) {
          assets.append(asset)
        }
      }
      guard !Task.isCancelled else { return }
      guard !assets.isEmpty else {
        imageImportAlert = .importFailure("The selected files are not supported images.")
        return
      }
      openImageText(assets)
      imageImportTask = nil
    }
  }

  private func presentCamera() {
    imageImportTask?.cancel()
    imageImportTask = Task { @MainActor in
      await Task.yield()
      guard !Task.isCancelled else { return }
      guard cameraAuthorizationClient.isCameraAvailable() else {
        imageImportAlert = .cameraUnavailable
        imageImportTask = nil
        return
      }
      switch cameraAuthorizationClient.state() {
      case .authorized:
        presentedImageSource = .camera
      case .notDetermined:
        let granted = await cameraAuthorizationClient.requestAccess()
        guard !Task.isCancelled else { return }
        if granted {
          presentedImageSource = .camera
        } else {
          imageImportAlert = .cameraDenied
        }
      case .denied:
        imageImportAlert = .cameraDenied
      case .restricted:
        imageImportAlert = .cameraRestricted
      }
      imageImportTask = nil
    }
  }

  private func presentPhotoLibrary() {
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-PhotoLibraryProviderFailure") {
        Task { @MainActor in
          await Task.yield()
          imageImportAlert = .importFailure("The selected photos could not be read.")
        }
        return
      }
    #endif
    presentedImageSource = .photoLibrary
  }

  private func importCameraImage(_ result: Result<ImageTextAsset?, Error>) {
    switch result {
    case .success(let asset):
      if let asset { openImageText([asset]) }
    case .failure:
      imageImportAlert = .importFailure("The captured image could not be read.")
    }
  }

  private func importPhotoLibraryImages(_ result: Result<[ImageTextAsset], Error>) {
    switch result {
    case .success(let assets):
      if !assets.isEmpty { openImageText(assets) }
    case .failure:
      imageImportAlert = .importFailure("The selected photos could not be read.")
    }
  }
}

private enum ImageImportAlert: Identifiable {
  case importFailure(String)
  case cameraUnavailable
  case cameraDenied
  case cameraRestricted

  var id: String {
    switch self {
    case .importFailure(let message): "import-\(message)"
    case .cameraUnavailable: "camera-unavailable"
    case .cameraDenied: "camera-denied"
    case .cameraRestricted: "camera-restricted"
    }
  }

  var title: String {
    switch self {
    case .importFailure: "Unable to Import Images"
    case .cameraUnavailable: "Camera Unavailable"
    case .cameraDenied: "Camera Access Denied"
    case .cameraRestricted: "Camera Access Restricted"
    }
  }

  var message: String {
    switch self {
    case .importFailure(let message): message
    case .cameraUnavailable: "Camera capture requires a physical device with an available camera."
    case .cameraDenied: "Allow Camera access in Settings to capture Japanese text."
    case .cameraRestricted: "Camera access is restricted on this device."
    }
  }

  var offersSettings: Bool {
    if case .cameraDenied = self { return true }
    return false
  }
}

private enum ImageSourceSheet: String, Identifiable {
  case camera
  case photoLibrary
  case files

  var id: String { rawValue }
}

private struct SearchTaskID: Hashable {
  let query: String
  let retryID: Int
}

private struct SearchResultsIdentity: Hashable {
  let query: SearchQuery
  let best: [LanguageReferenceID]
  let additional: [LanguageReferenceID]
  let refinement: SearchQuery?
}

private struct LookupFailureView: View {
  let retry: () -> Void

  var body: some View {
    VStack(spacing: 14) {
      Text("Dictionary unavailable")
        .font(.headline)
      Text("Zenbu couldn't open its offline Language Reference Data.")
        .font(.subheadline)
        .foregroundStyle(ZenbuTheme.secondaryText)
        .multilineTextAlignment(.center)
      Button("Retry", action: retry)
        .buttonStyle(.borderedProminent)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(32)
    .background(ZenbuTheme.background)
  }
}

private struct SearchBar: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  var isFocused: FocusState<Bool>.Binding
  let isInputActive: Bool
  let activateKeyboard: () -> Void
  let openImageSource: () -> Void
  let cancel: () -> Void
  let submitQuery: (SearchQuery) -> Void

  var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(ZenbuTheme.mutedForeground)

        searchTextField
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .submitLabel(.search)
          .focused(isFocused)
          .onChange(of: isFocused.wrappedValue) { _, focused in
            if focused { activateKeyboard() }
          }
          .onSubmit {
            let submittedQuery = SearchQuery(query)
            query = submittedQuery.value
            submitQuery(submittedQuery)
            isFocused.wrappedValue = false
          }
          .accessibilityIdentifier("search.field")

        if !query.isEmpty {
          Button {
            query = ""
          } label: {
            Image(systemName: "xmark.circle.fill")
              .foregroundStyle(ZenbuTheme.mutedForeground)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Clear text")
        }

      }
      .font(.body)
      .padding(.horizontal, 10)
      .frame(minHeight: 44)
      .background(ZenbuTheme.searchField, in: RoundedRectangle(cornerRadius: 9))

      Button(action: openImageSource) {
        Image(systemName: "camera")
          .font(.title3)
          .foregroundStyle(ZenbuTheme.interactiveForeground)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Image Search")
      .accessibilityIdentifier("search.image-source")

      if isInputActive {
        Button("Cancel", action: cancel)
          .buttonStyle(.plain)
          .foregroundStyle(ZenbuTheme.interactiveForeground)
          .frame(minHeight: 44)
          .accessibilityIdentifier("search.cancel")
      }
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 10)
    .background(ZenbuTheme.background)
  }

  @ViewBuilder
  private var searchTextField: some View {
    if dynamicTypeSize >= .xxLarge {
      TextField("Search", text: $query)
    } else {
      TextField("Search Japanese or English", text: $query)
    }
  }
}

private struct SearchResultsView: View {
  let query: SearchQuery
  let results: LookupSearchResults
  let exampleCount: Int
  let showsAdditionalMatches: Bool
  let selectRefinement: (SearchRefinement) -> Void
  let openResult: (DictionaryEntry) -> Void
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void
  let openExamples: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      if exampleCount > 0 {
        Button(action: openExamples) {
          HStack {
            Text(exampleActionTitle)
              .frame(maxWidth: .infinity, alignment: .center)
              .fixedSize(horizontal: false, vertical: true)
            Image(systemName: "chevron.right")
              .foregroundStyle(ZenbuTheme.secondaryText)
              .accessibilityHidden(true)
          }
          .font(.headline)
          .foregroundStyle(ZenbuTheme.interactiveForeground)
          .padding(.horizontal, 18)
          .frame(minHeight: 52)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("search.examples")
      }

      ScrollView {
        LazyVStack(spacing: 0, pinnedViews: []) {
          if let refinement = results.readingRefinement {
            Button {
              selectRefinement(refinement)
            } label: {
              HStack {
                Text("Search for「\(refinement.query.value)」")
                  .frame(maxWidth: .infinity, alignment: .center)
                  .fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.right")
                  .foregroundStyle(ZenbuTheme.secondaryText)
                  .accessibilityHidden(true)
              }
              .font(.headline)
              .foregroundStyle(ZenbuTheme.interactiveForeground)
              .padding(.horizontal, 18)
              .frame(minHeight: 52)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Search for Japanese reading \(refinement.query.value)")
            .accessibilityIdentifier("search.reading-refinement")
          }

          if results.presentation == .discoveredWords {
            ResultSectionHeader(title: "Discovered Words")
            ForEach(
              Array((results.best + results.additional).prefix(12).enumerated()), id: \.offset
            ) {
              index, entry in
              ResultRow(entry: entry, marker: .additional, rank: .discovered(index + 1)) {
                openResult(entry)
              }
            }
          } else if query.isSingleKanji || !results.best.isEmpty {
            ResultSectionHeader(title: "Best Matches")
            if let character = KanjiCharacter(query.value) {
              KanjiPrimaryRow(character: character.rawValue, entry: primaryKanjiEntry) {
                openKanji(character, primaryKanjiEntry)
              }
            }
            ForEach(Array(results.best.enumerated()), id: \.element.id) { index, entry in
              ResultRow(
                entry: entry, marker: .best, rank: .best(index + (query.isSingleKanji ? 2 : 1))
              ) {
                openResult(entry)
              }
            }
          }

          if showsAdditionalMatches, results.presentation == .ranked, !results.additional.isEmpty {
            ResultSectionHeader(title: "Additional Matches")
            ForEach(Array(results.additional.enumerated()), id: \.element.id) { index, entry in
              ResultRow(entry: entry, marker: .additional, rank: .additional(index + 1)) {
                openResult(entry)
              }
            }
          }
        }
      }
      .id(query)
      .scrollIndicators(.hidden)
    }
    .background(ZenbuTheme.background)
  }

  private var primaryKanjiEntry: DictionaryEntry? {
    results.primaryEntry(for: query)
  }

  private var exampleActionTitle: String {
    if exampleCount > 50 { return "View 50+ Example Sentences" }
    return "View \(exampleCount) Example \(exampleCount == 1 ? "Sentence" : "Sentences")"
  }
}

private struct KanjiPrimaryRow: View {
  let character: String
  let entry: DictionaryEntry?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Text(character)
          .font(.title.weight(.light))
        Text("KANJI")
          .font(.caption2.weight(.bold))
          .foregroundStyle(ZenbuTheme.secondaryText)
        Text(entry?.summary ?? "Kanji detail")
          .lineLimit(1)
          .foregroundStyle(ZenbuTheme.secondaryText)
          .frame(maxWidth: .infinity, alignment: .trailing)
        Image(systemName: "chevron.right")
          .foregroundStyle(ZenbuTheme.secondaryText)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, 15)
      .frame(minHeight: 54)
      .contentShape(Rectangle())
      .overlay(alignment: .bottom) {
        Rectangle().fill(ZenbuTheme.divider).frame(height: 0.5)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(character), KANJI, \(entry?.summary ?? "Kanji detail")")
    .accessibilityValue("Best match 1, Kanji primary")
    .accessibilityIdentifier("result.kanji-primary.\(character)")
  }
}

private struct ResultSectionHeader: View {
  let title: String

  var body: some View {
    Text(title)
      .font(.callout.weight(.semibold))
      .foregroundStyle(ZenbuTheme.secondaryText)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 53)
      .frame(minHeight: 43, alignment: .bottom)
      .padding(.bottom, 7)
      .overlay(alignment: .bottom) {
        Rectangle().fill(ZenbuTheme.divider).frame(height: 0.5)
      }
  }
}

private struct ResultRow: View {
  enum Marker {
    case best
    case additional
  }

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let entry: DictionaryEntry
  let marker: Marker
  let rank: ResultRank
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Group {
        if usesExpandedLayout {
          VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 9) {
              markerView.frame(width: 24)
              titleBlock
              Spacer(minLength: 8)
              chevron
            }
            Text(entry.summary)
              .font(.body)
              .foregroundStyle(ZenbuTheme.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          }
        } else {
          HStack(spacing: 9) {
            markerView.frame(width: 24)
            titleBlock
              .frame(width: 92, alignment: .leading)
            Text(entry.summary)
              .font(.callout)
              .foregroundStyle(ZenbuTheme.secondaryText)
              .lineLimit(1)
              .frame(maxWidth: .infinity, alignment: .trailing)
            chevron
          }
        }
      }
      .padding(.horizontal, 15)
      .padding(.vertical, usesExpandedLayout ? 10 : 0)
      .frame(minHeight: 54)
      .contentShape(Rectangle())
      .overlay(alignment: .bottom) {
        Rectangle().fill(ZenbuTheme.divider).frame(height: 0.5)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(entry.headword), \(entry.reading), \(entry.summary)")
    .accessibilityValue(rank.accessibilityValue)
    .accessibilityIdentifier(resultIdentifier)
  }

  private var titleBlock: some View {
    JapaneseRubyText(
      surface: entry.headword,
      reading: entry.reading,
      baseFont: usesExpandedLayout ? .title3 : .title2,
      rubyFont: usesExpandedLayout ? .body.weight(.semibold) : .caption.weight(.semibold)
    )
    .fixedSize(horizontal: false, vertical: true)
    .foregroundStyle(ZenbuTheme.foreground)
  }

  private var chevron: some View {
    Image(systemName: "chevron.right")
      .font(.headline)
      .foregroundStyle(ZenbuTheme.secondaryText)
      .accessibilityHidden(true)
  }

  private var usesExpandedLayout: Bool {
    dynamicTypeSize >= .xxLarge
  }

  private var resultIdentifier: String {
    switch entry.headword {
    case "問題": "result.problem"
    case "日本": "result.japan"
    default: "result.\(entry.id.rawValue)"
    }
  }

  @ViewBuilder
  private var markerView: some View {
    switch marker {
    case .best:
      Circle()
        .stroke(ZenbuTheme.secondaryText, lineWidth: 1.2)
        .frame(width: 17, height: 17)
        .accessibilityHidden(true)
    case .additional:
      Rectangle()
        .stroke(ZenbuTheme.secondaryText, lineWidth: 1.2)
        .frame(width: 13, height: 13)
        .rotationEffect(.degrees(45))
        .accessibilityHidden(true)
    }
  }
}

private enum ResultRank {
  case best(Int)
  case additional(Int)
  case discovered(Int)

  var accessibilityValue: String {
    switch self {
    case .best(let position): "Best match \(position)"
    case .additional(let position): "Additional match \(position)"
    case .discovered(let position): "Discovered word \(position)"
    }
  }
}
