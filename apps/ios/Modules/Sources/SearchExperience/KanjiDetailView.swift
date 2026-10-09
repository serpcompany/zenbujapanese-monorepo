import SwiftUI

struct KanjiDetailView: View {
  let character: KanjiCharacter
  let entry: DictionaryEntry?
  let kanjiLookupClient: KanjiLookupClient
  let kanjiElementLookupClient: KanjiElementLookupClient
  let kanjiStrokeOrderClient: KanjiStrokeOrderClient
  let preservedWordID: LanguageReferenceID?
  let preservedElementID: KanjiElementID?
  let openList: (UUID) -> Void

  @Environment(WordKnowledge.self) private var wordKnowledge
  @FocusState private var noteEditorFocused: Bool
  @State private var notes: SavedItemNotes
  @State private var photos: SavedItemPhotos
  @State private var showsListPicker = false
  @State private var loadState = KanjiDetailLoadState.loading
  @State private var retryID = 0
  @State private var strokeDiagramLoadState = KanjiStrokeDiagramLoadState.loading
  @State private var strokeRetryID = 0
  @State private var presentedStrokeDiagram: KanjiStrokeDiagram?
  @State private var pendingScrollTarget: KanjiDetailScrollTarget?

  init(
    character: KanjiCharacter,
    entry: DictionaryEntry?,
    kanjiLookupClient: KanjiLookupClient,
    kanjiElementLookupClient: KanjiElementLookupClient,
    kanjiStrokeOrderClient: KanjiStrokeOrderClient,
    wordNoteStore: WordNoteStore,
    encounterMediaStore: EncounterMediaStore,
    cameraAuthorizationClient: CameraAuthorizationClient,
    preservedWordID: LanguageReferenceID?,
    preservedElementID: KanjiElementID?,
    openList: @escaping (UUID) -> Void
  ) {
    _notes = State(initialValue: SavedItemNotes(store: wordNoteStore))
    _photos = State(
      initialValue: SavedItemPhotos(
        store: encounterMediaStore, cameraAuthorizationClient: cameraAuthorizationClient))
    self.character = character
    self.entry = entry
    self.kanjiLookupClient = kanjiLookupClient
    self.kanjiElementLookupClient = kanjiElementLookupClient
    self.kanjiStrokeOrderClient = kanjiStrokeOrderClient
    self.preservedWordID = preservedWordID
    self.preservedElementID = preservedElementID
    self.openList = openList
  }

  private var item: SavedItem {
    .kanji(character, reading: reference?.readings.first?.value ?? "")
  }

  private var shareText: String {
    KanjiReferenceEntry.shareText(for: character, reference: reference)
  }

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section {
          KanjiOverview(
            character: character.rawValue,
            reference: reference,
            strokeDiagramLoadState: strokeDiagramLoadState,
            retryStrokeOrder: retryStrokeOrder,
            openStrokeOrder: openStrokeOrder
          )
          if let latest = photos.displayable.first {
            SavedItemPhotoButton(
              media: latest,
              count: photos.displayable.count,
              encounterMedia: photos.displayable,
              removeEncounterMedia: photos.remove
            )
          }
          if wordKnowledge.isKnown(item) {
            KnownWordBadge(announces: true)
          }
        }

        if loadState == .loading {
          Section {
            HStack {
              Spacer()
              ProgressView("Loading kanji reference…")
              Spacer()
            }
            .padding(.vertical, 16)
          }
        }

        if loadFailed {
          Section {
            ContentUnavailableView {
              Label("Kanji reference unavailable", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
            } description: {
              Text("Some source-backed kanji content could not be loaded.")
            } actions: {
              Button("Retry", action: retry)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("kanji-detail.retry")
            }
          }
        }

        if let reference {
          KanjiReadingsSection(reference: reference, relatedWords: relatedWords)
          if elements.isEmpty, !reference.components.isEmpty {
            Section("COMPONENTS") {
              Text(reference.components.joined(separator: " · "))
                .font(.title3)
                .accessibilityIdentifier("kanji-detail.elements")
            }
          }
        }

        if !elements.isEmpty {
          KanjiElementsSection(elements: elements)
        }

        Section("LISTS") {
          SavedItemListsSection(
            item: item, identifierPrefix: "kanji-detail", openList: openList
          ) { showsListPicker = true }
        }

        Section("NOTES") {
          SavedItemNotesSection(
            notes: notes, editorFocused: $noteEditorFocused, identifierPrefix: "kanji-detail")
        }

        if !relatedWords.isEmpty {
          KanjiWordsSection(entries: orderedRelatedWords)
        }
      }
      .groupedList()
      .accessibilityIdentifier("kanji-detail.screen")
      .onAppear {
        restorePreservedWordPosition(in: relatedWords)
        restorePreservedElementPosition(in: elements)
      }
      .onChange(of: relatedWords.map(\.id)) {
        restorePreservedWordPosition(in: relatedWords)
      }
      .onChange(of: elements.map(\.id)) {
        restorePreservedElementPosition(in: elements)
      }
      .onChange(of: restorationState) { _, restorationState in
        guard let target = restorationState.readyTarget else { return }
        proxy.scrollTo(target, anchor: .center)
        pendingScrollTarget = nil
      }
    }
    .navigationTitle(character.rawValue)
    .inlineNavigationTitle()
    .savedItemActions(
      for: item, identifierPrefix: "kanji-detail", shareText: shareText, notes: notes,
      photos: photos, showsListPicker: $showsListPicker)
    .onChange(of: notes.editingNoteID) { _, noteID in
      noteEditorFocused = noteID != nil
    }
    .onDisappear {
      notes.finishEditing()
    }
    .task(id: character) {
      let item = SavedItem.kanji(character, reading: "")
      await photos.load(item)
      await notes.load(item.noteID)
    }
    .sheet(item: $presentedStrokeDiagram) { diagram in
      KanjiStrokeOrderSheet(diagram: diagram)
    }
    .task(id: KanjiStrokeDiagramLoadRequest(character: character, retryID: strokeRetryID)) {
      await loadStrokeDiagram()
    }
    .task(id: KanjiDetailLoadRequest(character: character, retryID: retryID)) {
      await loadDetail()
    }
  }

  private var reference: KanjiReferenceEntry? {
    switch loadState {
    case .loaded(let reference, _, _), .failed(let reference, _, _): reference
    case .loading: nil
    }
  }

  private var loadFailed: Bool {
    if case .failed = loadState { return true }
    return false
  }

  private var relatedWords: [DictionaryEntry] {
    switch loadState {
    case .loaded(_, _, let relatedWords), .failed(_, _, let relatedWords): relatedWords
    case .loading: []
    }
  }

  private var elements: [KanjiElementSummary] {
    switch loadState {
    case .loaded(_, let elements, _), .failed(_, let elements, _): elements
    case .loading: []
    }
  }

  private var orderedRelatedWords: [DictionaryEntry] {
    guard let entry, relatedWords.contains(entry) else { return relatedWords }
    return [entry] + relatedWords.filter { $0.id != entry.id }
  }

  private var restorationState: KanjiDetailRestorationState {
    KanjiDetailRestorationState(
      pendingTarget: pendingScrollTarget,
      snapshot: loadState.restorationSnapshot
    )
  }

  private func retry() {
    loadState = .loading
    retryID += 1
  }

  private func retryStrokeOrder() { strokeRetryID += 1 }

  private func openStrokeOrder(_ diagram: KanjiStrokeDiagram) {
    presentedStrokeDiagram = diagram
  }

  private func restorePreservedWordPosition(in loadedWords: [DictionaryEntry]) {
    guard let preservedWordID,
      loadedWords.contains(where: { $0.id == preservedWordID })
    else { return }
    pendingScrollTarget = .word(preservedWordID)
  }

  private func restorePreservedElementPosition(in loadedElements: [KanjiElementSummary]) {
    guard let preservedElementID,
      loadedElements.contains(where: { $0.id == preservedElementID })
    else { return }
    pendingScrollTarget = .element(preservedElementID)
  }

  private func loadStrokeDiagram() async {
    strokeDiagramLoadState = .loading
    do {
      if let diagram = try await kanjiStrokeOrderClient.diagram(character) {
        strokeDiagramLoadState = .available(diagram)
      } else {
        strokeDiagramLoadState = .unavailable
      }
    } catch is CancellationError {
      return
    } catch {
      strokeDiagramLoadState = .failed
    }
  }

  private func loadDetail() async {
    guard loadState.requiresLoad else { return }
    loadState = .loading
    var loadedReference: KanjiReferenceEntry?
    var loadedWords: [DictionaryEntry] = []
    var loadedElements: [KanjiElementSummary] = []
    var loadFailed = false

    do {
      loadedReference = try await kanjiLookupClient.entry(character)
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
    guard !Task.isCancelled else { return }

    do {
      loadedElements = try await kanjiElementLookupClient.elements(character)
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
    guard !Task.isCancelled else { return }

    do {
      loadedWords = try await kanjiLookupClient.relatedWords(character)
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
    guard !Task.isCancelled else { return }

    if loadFailed {
      loadState = .failed(
        reference: loadedReference,
        elements: loadedElements,
        relatedWords: loadedWords
      )
    } else {
      loadState = .loaded(
        reference: loadedReference,
        elements: loadedElements,
        relatedWords: loadedWords
      )
    }
  }
}

private struct KanjiDetailLoadRequest: Hashable {
  let character: KanjiCharacter
  let retryID: Int
}

private struct KanjiStrokeDiagramLoadRequest: Hashable {
  let character: KanjiCharacter
  let retryID: Int
}

enum KanjiDetailScrollTarget: Hashable {
  case word(LanguageReferenceID)
  case element(KanjiElementID)
}

struct KanjiDetailRestorationState: Equatable {
  enum Snapshot: Equatable {
    case loading
    case settled(availableTargets: Set<KanjiDetailScrollTarget>)
  }

  let pendingTarget: KanjiDetailScrollTarget?
  let snapshot: Snapshot

  var readyTarget: KanjiDetailScrollTarget? {
    guard let pendingTarget,
      case .settled(let availableTargets) = snapshot,
      availableTargets.contains(pendingTarget)
    else { return nil }
    return pendingTarget
  }
}

enum KanjiStrokeDiagramLoadState: Equatable {
  case loading
  case available(KanjiStrokeDiagram)
  case unavailable
  case failed
}

enum KanjiDetailLoadState: Equatable {
  case loading
  case loaded(
    reference: KanjiReferenceEntry?,
    elements: [KanjiElementSummary],
    relatedWords: [DictionaryEntry]
  )
  case failed(
    reference: KanjiReferenceEntry?,
    elements: [KanjiElementSummary],
    relatedWords: [DictionaryEntry]
  )

  var requiresLoad: Bool {
    if case .loading = self { return true }
    return false
  }

  var restorationSnapshot: KanjiDetailRestorationState.Snapshot {
    switch self {
    case .loading:
      .loading
    case .loaded(_, let elements, let relatedWords),
      .failed(_, let elements, let relatedWords):
      .settled(
        availableTargets: Set(
          relatedWords.map { .word($0.id) }
            + elements.map { .element($0.id) }
        )
      )
    }
  }
}
