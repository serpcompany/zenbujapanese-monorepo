@preconcurrency import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct SearchView: View {
  @Binding var query: String
  let lookupClient: LookupClient
  let recentSearchStore: RecentSearchStore
  let handwritingRecognitionClient: HandwritingRecognitionClient
  let cameraAuthorizationClient: CameraAuthorizationClient
  let radicalLookupClient: RadicalLookupClient
  let exampleSentenceClient: ExampleSentenceClient
  let frequencyCapability: FrequencyCapability
  let frequencyRefreshID: Int
  let openImageText: ([ImageTextAsset]) -> Void
  @State private var results = LookupSearchResults.empty
  @State private var presentationState = SearchPresentationState.idle
  @State private var retryID = 0
  @State private var settledSearchTaskID: SearchTaskID?
  @State private var inputMode = SearchInputMode.inactive
  @State private var sparseRadicalQuery: SearchQuery?
  @State private var exampleCount = 0
  @State private var showsImageSources = false
  @State private var presentedImageSource: ImageSourceSheet?
  @State private var showsPhotoLibrary = false
  @State private var selectedPhotoItems: [PhotosPickerItem] = []
  @State private var showsFileImporter = false
  @State private var imageImportAlert: ImageImportAlert?
  @State private var isShowingImageImportAlert = false
  @State private var imageImportTask: Task<Void, Never>?
  @State private var isConfirmingClearAll = false
  @State private var recentSearchRefreshID = 0
  @FocusState private var isSearchFocused: Bool

  var body: some View {
    let taskID = searchTaskID
    let taskQuery = SearchQuery(taskID.query)
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

      switch resolvedPresentationState {
      case .idle:
        RecentSearchHistoryView(
          recentSearchStore: recentSearchStore,
          refreshID: recentSearchRefreshID,
          requestClearAll: { isConfirmingClearAll = true },
          selectSearch: selectRecentSearch
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
          showsAdditionalMatches: sparseRadicalQuery != searchQuery,
          frequencyCapability: frequencyCapability,
          frequencyRefreshID: frequencyRefreshID,
          selectRefinement: selectRefinement
        )
        .id(
          SearchResultsIdentity(
            query: searchQuery,
            best: results.best.map(\.id),
            additional: results.additional.map(\.id),
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
    .onChange(of: query) { _, _ in
      settledSearchTaskID = nil
      results = .empty
      exampleCount = 0
      presentationState = .idle
    }
    .task(id: taskID) {
      guard !Task.isCancelled, searchTaskID == taskID, settledSearchTaskID != taskID else {
        return
      }
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
        async let searchedExampleCount = exampleSentenceClient.count(taskQuery)
        let foundResults = try await searchedResults
        try Task.checkCancellation()
        let directExampleCount = (try? await searchedExampleCount) ?? 0
        try Task.checkCancellation()
        let foundExampleCount: Int
        if foundResults.usesPrimaryEntryExamples,
          let entry = foundResults.primaryEntry(for: taskQuery)
        {
          foundExampleCount = (try? await exampleSentenceClient.examples(entry).count) ?? 0
        } else {
          foundExampleCount = directExampleCount
        }
        try Task.checkCancellation()
        guard searchTaskID == taskID, settledSearchTaskID != taskID else { return }
        settledSearchTaskID = taskID
        results = foundResults
        exampleCount = foundExampleCount
        if foundResults.isEmpty && foundExampleCount == 0 && !taskQuery.isSingleKanji {
          presentationState = .noResults
        } else {
          presentationState = .results
        }
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled, searchTaskID == taskID, settledSearchTaskID != taskID else {
          return
        }
        settledSearchTaskID = taskID
        results = .empty
        exampleCount = 0
        presentationState = .failure
      }
    }
    .confirmationDialog("Image Search", isPresented: $showsImageSources) {
      Button("Take Photo") { presentCamera() }
        .accessibilityIdentifier("image-source.camera")
      Button("Photo Library") { presentPhotoLibrary() }
        .accessibilityIdentifier("image-source.photo-library")
      Button("Files") { showsFileImporter = true }
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
      }
    }
    .photosPicker(
      isPresented: $showsPhotoLibrary,
      selection: $selectedPhotoItems,
      maxSelectionCount: 1,
      matching: .images
    )
    .onChange(of: selectedPhotoItems) { _, items in
      importPhotoLibraryItems(items)
    }
    .fileImporter(
      isPresented: $showsFileImporter,
      allowedContentTypes: [.image],
      allowsMultipleSelection: true,
      onCompletion: importImages,
      onCancellation: {}
    )
    .alert(
      imageImportAlert?.title ?? "",
      isPresented: $isShowingImageImportAlert,
      presenting: imageImportAlert
    ) { alert in
      if alert.offersSettings {
        Button("Open Settings", action: cameraAuthorizationClient.openSettings)
        Button("Cancel", role: .cancel) {}
      } else {
        Button("OK") {}
      }
    } message: { alert in
      Text(alert.message)
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

  private var searchTaskID: SearchTaskID {
    SearchTaskID(query: query, retryID: retryID)
  }

  private var showsRecentSearches: Bool {
    searchQuery.isEmpty && (inputMode == .inactive || inputMode == .keyboard)
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

  private func importImages(_ result: Result<[URL], Error>) {
    guard case .success(let urls) = result else {
      if case .failure(let error) = result,
        error is CancellationError || (error as? CocoaError)?.code == .userCancelled
      {
        return
      }
      presentImageImportAlert(.importFailure("The Files selection could not be read."))
      return
    }
    guard !urls.isEmpty else { return }
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
        presentImageImportAlert(.importFailure("The selected files are not supported images."))
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
        presentImageImportAlert(.cameraUnavailable)
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
          presentImageImportAlert(.cameraDenied)
        }
      case .denied:
        presentImageImportAlert(.cameraDenied)
      case .restricted:
        presentImageImportAlert(.cameraRestricted)
      }
      imageImportTask = nil
    }
  }

  private func presentPhotoLibrary() {
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-PhotoLibraryProviderFailure") {
        Task { @MainActor in
          await Task.yield()
          presentImageImportAlert(.importFailure("The selected photos could not be read."))
        }
        return
      }
    #endif
    selectedPhotoItems = []
    showsPhotoLibrary = true
  }

  private func importCameraImage(_ result: Result<ImageTextAsset?, Error>) {
    switch result {
    case .success(let asset):
      if let asset { openImageText([asset]) }
    case .failure:
      presentImageImportAlert(.importFailure("The captured image could not be read."))
    }
  }

  private func importPhotoLibraryItems(_ items: [PhotosPickerItem]) {
    guard !items.isEmpty else { return }
    imageImportTask?.cancel()
    imageImportTask = Task {
      do {
        var assets: [ImageTextAsset] = []
        for item in items {
          guard let selected = try await item.loadTransferable(type: SelectedImageTextPhoto.self)
          else { continue }
          assets.append(selected.asset)
        }
        guard !Task.isCancelled else { return }
        guard !assets.isEmpty else { throw ImageSourcePickerError.unreadableImage }
        selectedPhotoItems = []
        openImageText(assets)
      } catch is CancellationError {
        return
      } catch {
        selectedPhotoItems = []
        presentImageImportAlert(.importFailure("The selected photos could not be read."))
      }
      imageImportTask = nil
    }
  }

  private func presentImageImportAlert(_ alert: ImageImportAlert) {
    imageImportAlert = alert
    isShowingImageImportAlert = true
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

  var id: String { rawValue }
}

private struct SelectedImageTextPhoto: Transferable {
  let asset: ImageTextAsset

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .image) { received in
      guard
        let asset = ImageTextAsset(
          photoLibraryImageAt: received.file,
          name: received.file.lastPathComponent)
      else {
        throw ImageSourcePickerError.unreadableImage
      }
      return SelectedImageTextPhoto(asset: asset)
    }
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
  let best: [LanguageReferenceID]
  let additional: [LanguageReferenceID]
  let refinement: SearchQuery?
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
          .foregroundStyle(.secondary)

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
              .foregroundStyle(.secondary)
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
      .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 9))

      Button(action: openImageSource) {
        Image(systemName: "camera")
          .font(.title3)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Image Search")
      .accessibilityIdentifier("search.image-source")

      if isInputActive {
        Button("Cancel", action: cancel)
          .buttonStyle(.plain)
          .frame(minHeight: 44)
          .accessibilityIdentifier("search.cancel")
      }
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 10)
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
  let frequencyCapability: FrequencyCapability
  let frequencyRefreshID: Int
  let selectRefinement: (SearchRefinement) -> Void
  @State private var frequencyResults: [LanguageReferenceID: FrequencyLookupResult] = [:]

  var body: some View {
    List {
      if exampleCount > 0 {
        Section {
          NavigationLink(
            value: SearchExperienceRoute.examples(
              query,
              results.primaryEntry(for: query),
              results.usesPrimaryEntryExamples
            )
          ) {
            Text(exampleActionTitle)
              .font(.headline)
          }
          .accessibilityIdentifier("search.examples")
        }
      }

      if let refinement = results.readingRefinement {
        Section {
          Button {
            selectRefinement(refinement)
          } label: {
            Text("Search for「\(refinement.query.value)」")
              .font(.headline)
          }
          .accessibilityLabel("Search for Japanese reading \(refinement.query.value)")
          .accessibilityIdentifier("search.reading-refinement")
        }
      }

      if results.presentation == .discoveredWords {
        Section("Discovered Words") {
          ForEach(
            (results.best + results.additional).prefix(12).enumerated(), id: \.element.id
          ) { index, entry in
            ResultRow(
              entry: entry,
              frequencyResult: frequencyResults[entry.id],
              rank: .discovered(index + 1)
            )
          }
        }
      } else if query.isSingleKanji || !results.best.isEmpty {
        Section("Best Matches") {
          if let character = KanjiCharacter(query.value) {
            KanjiPrimaryRow(character: character, entry: primaryKanjiEntry)
          }
          ForEach(results.best.enumerated(), id: \.element.id) { index, entry in
            ResultRow(
              entry: entry,
              frequencyResult: frequencyResults[entry.id],
              rank: .best(index + (query.isSingleKanji ? 2 : 1))
            )
          }
        }
      }

      if showsAdditionalMatches, results.presentation == .ranked, !results.additional.isEmpty {
        Section {
          ForEach(results.additional.enumerated(), id: \.element.id) { index, entry in
            ResultRow(
              entry: entry,
              frequencyResult: frequencyResults[entry.id],
              rank: .additional(index + 1)
            )
          }
        } header: {
          Text("Additional Matches")
            .accessibilityIdentifier("search.additional-matches-header")
        }
      }
    }
    .listStyle(.plain)
    .id(query)
    .accessibilityIdentifier("search.results")
    .task(id: frequencyTaskID) {
      frequencyResults = [:]
      do {
        let loaded = try await frequencyCapability.evidence(for: displayedEntryIDs)
        try Task.checkCancellation()
        frequencyResults = loaded
      } catch is CancellationError {
        return
      } catch {
        frequencyResults = FrequencyLookupResult.unavailableResults(
          for: displayedEntryIDs, pack: nil, reason: "Frequency data unavailable")
      }
    }
  }

  private var primaryKanjiEntry: DictionaryEntry? {
    results.primaryEntry(for: query)
  }

  private var exampleActionTitle: String {
    if exampleCount > 50 { return "View 50+ Example Sentences" }
    return "View \(exampleCount) Example \(exampleCount == 1 ? "Sentence" : "Sentences")"
  }

  private var displayedEntryIDs: [LanguageReferenceID] {
    let entries =
      results.presentation == .discoveredWords
      ? Array((results.best + results.additional).prefix(12))
      : results.best + (showsAdditionalMatches ? results.additional : [])
    var seen = Set<LanguageReferenceID>()
    return entries.compactMap { seen.insert($0.id).inserted ? $0.id : nil }
  }

  private var frequencyTaskID: SearchFrequencyTaskID {
    SearchFrequencyTaskID(entryIDs: displayedEntryIDs, refreshID: frequencyRefreshID)
  }
}

private struct KanjiPrimaryRow: View {
  let character: KanjiCharacter
  let entry: DictionaryEntry?

  var body: some View {
    NavigationLink(value: SearchExperienceRoute.kanji(character, entry)) {
      HStack(spacing: 10) {
        Text(character.rawValue)
          .font(.title.weight(.light))
        VStack(alignment: .leading, spacing: 3) {
          Text("KANJI")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.primary)
          Text(entry?.summary ?? "Kanji detail")
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(Rectangle())
    }
    .accessibilityLabel("\(character.rawValue), KANJI, \(entry?.summary ?? "Kanji detail")")
    .accessibilityValue("Best match 1, Kanji primary")
    .accessibilityIdentifier("result.kanji-primary.\(character.rawValue)")
  }
}

private struct ResultRow: View {
  let entry: DictionaryEntry
  let frequencyResult: FrequencyLookupResult?
  let rank: ResultRank
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    NavigationLink(value: SearchExperienceRoute.word(entry, nil)) {
      Group {
        if dynamicTypeSize.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 5) {
            frequencyRank
            entryContent
          }
        } else {
          HStack(alignment: .top, spacing: 10) {
            frequencyRank
              .frame(minWidth: 54, alignment: .leading)
            entryContent
          }
        }
      }
      .contentShape(Rectangle())
    }
    .accessibilityLabel("\(entry.headword), \(entry.reading), \(entry.summary)")
    .accessibilityValue("\(rank.accessibilityValue), \(frequencyPresentation.accessibilityValue)")
    .accessibilityIdentifier(resultIdentifier)
  }

  private var entryContent: some View {
    VStack(alignment: .leading, spacing: 5) {
      titleBlock
      Text(entry.summary)
        .font(.body)
        .foregroundStyle(.primary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var frequencyRank: some View {
    Text(frequencyPresentation.text)
      .font(.caption.monospacedDigit())
      .foregroundStyle(.primary)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityHidden(true)
  }

  private var frequencyPresentation: SearchFrequencyRankPresentationModel {
    SearchFrequencyRankPresentationModel(result: frequencyResult)
  }

  private var titleBlock: some View {
    JapaneseRubyText(
      surface: entry.headword,
      reading: entry.reading,
      baseFont: .title3,
      rubyFont: .caption.weight(.semibold)
    )
    .fixedSize(horizontal: false, vertical: true)
  }

  private var resultIdentifier: String {
    switch entry.headword {
    case "問題": "result.problem"
    case "日本": "result.japan"
    default: "result.\(entry.id.rawValue)"
    }
  }
}

private struct SearchFrequencyTaskID: Hashable {
  let entryIDs: [LanguageReferenceID]
  let refreshID: Int
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
