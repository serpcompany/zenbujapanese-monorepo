import SwiftUI

struct KanjiDetailView: View {
  let character: KanjiCharacter
  let entry: DictionaryEntry?
  let kanjiLookupClient: KanjiLookupClient
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
  @State private var presentedMedia: EncounterMedia?
  @State private var pendingScrollTarget: KanjiDetailScrollTarget?

  init(
    character: KanjiCharacter,
    entry: DictionaryEntry?,
    kanjiLookupClient: KanjiLookupClient,
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
    self.kanjiStrokeOrderClient = kanjiStrokeOrderClient
    self.preservedWordID = preservedWordID
    self.preservedElementID = preservedElementID
    self.openList = openList
  }

  private var item: SavedItem {
    .kanji(character, reading: page?.savedReading ?? "")
  }

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section {
          KanjiOverview(
            character: character.rawValue,
            page: page,
            strokeDiagramLoadState: strokeDiagramLoadState,
            retryStrokeOrder: retryStrokeOrder,
            openStrokeOrder: openStrokeOrder
          )
          if let latest = photos.displayable.first {
            SavedItemPhotoButton(media: latest, count: photos.displayable.count) {
              presentedMedia = $0
            }
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

        ForEach(page?.sections ?? KanjiPage.sectionsWithoutContent, id: \.kind) { section in
          pageSection(section, of: page)
        }
      }
      .groupedList()
      .accessibilityIdentifier("kanji-detail.screen")
      .modifier(DrawRecorder(page, as: "kanji-detail.drawn", summary: KanjiPage.drawnSummary))
      .onAppear {
        restorePreservedWordPosition(in: words)
        restorePreservedElementPosition(in: elements)
      }
      .onChange(of: words.map(\.id)) {
        restorePreservedWordPosition(in: words)
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
    .encounterMediaViewer(
      $presentedMedia, encounterMedia: photos.displayable, removeEncounterMedia: photos.remove)
    .savedItemActions(
      for: item, identifierPrefix: "kanji-detail", share: SharedPage(kanji: character, page: page),
      notes: notes,
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
      await notes.load(item)
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

  @ViewBuilder
  private func pageSection(_ section: KanjiPage.Section, of page: KanjiPage?) -> some View {
    let title = section.title.uppercased()
    switch section.kind {
    case .readings:
      KanjiReadingsSection(title: title, readings: page?.readings ?? [])
    case .components:
      Section(title) {
        Text((page?.components ?? []).joined(separator: " · "))
          .font(.title3)
          .accessibilityIdentifier("kanji-detail.elements")
      }
    case .elements:
      KanjiElementsSection(title: title, elements: elements)
    case .lists:
      Section(title) {
        SavedItemListsSection(
          item: item, identifierPrefix: "kanji-detail", openList: openList
        ) { showsListPicker = true }
      }
    case .notes:
      Section(title) {
        SavedItemNotesSection(
          notes: notes, editorFocused: $noteEditorFocused, identifierPrefix: "kanji-detail")
      }
    case .words:
      KanjiWordsSection(title: title, entries: words)
    }
  }

  private var page: KanjiPage? {
    switch loadState {
    case .loaded(let page): page
    case .failed(let page): page
    case .loading: nil
    }
  }

  private var loadFailed: Bool {
    if case .failed = loadState { return true }
    return false
  }

  private var words: [DictionaryEntry] { page?.words ?? [] }

  private var elements: [KanjiPage.Element] { page?.elements ?? [] }

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

  private func restorePreservedElementPosition(in loadedElements: [KanjiPage.Element]) {
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
    var loadedWords: [DictionaryEntry] = []
    var loadFailed = false

    do {
      loadedWords = try await kanjiLookupClient.relatedWords(character)
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
    guard !Task.isCancelled else { return }

    guard let page = try? kanjiLookupClient.page(character, loadedWords, entry?.id) else {
      loadState = .failed(nil)
      return
    }
    loadState = loadFailed ? .failed(page) : .loaded(page)
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
  case loaded(KanjiPage)
  case failed(KanjiPage?)

  var requiresLoad: Bool {
    if case .loading = self { return true }
    return false
  }

  var restorationSnapshot: KanjiDetailRestorationState.Snapshot {
    switch self {
    case .loading:
      .loading
    case .loaded(let page), .failed(let page?):
      .settled(
        availableTargets: Set(
          page.words.map { .word($0.id) } + page.elements.map { .element($0.id) }))
    case .failed(nil):
      .settled(availableTargets: [])
    }
  }
}
