import SwiftUI

struct WordDetailView: View {
  @FocusState private var noteEditorFocused: Bool
  @State private var notes: SavedItemNotes
  @State private var photos: SavedItemPhotos
  @State private var examples = LoadedExamples()
  @Environment(\.exampleRowsOnScreen) private var rowsOnScreen
  @Environment(ZenbuAccount.self) private var zenbuAccount: ZenbuAccount?
  @State private var showsListPicker = false
  @State private var frequencyDisclosure: FrequencyRow?
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full

  let entry: DictionaryEntry
  let initialEncounterMedia: EncounterMediaAttachment?
  let speechSynthesisClient: SpeechSynthesisClient
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let openRelated: (DictionaryRelationship) -> Void
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void
  let openWord: (DictionaryEntry) -> Void
  let openConjugations: (Conjugations) -> Void
  let manageFrequencyDictionaries: () -> Void
  let openList: (UUID) -> Void

  init(
    entry: DictionaryEntry,
    initialEncounterMedia: EncounterMediaAttachment?,
    speechSynthesisClient: SpeechSynthesisClient,
    exampleSentenceClient: ExampleSentenceClient,
    japaneseTextAnalysisClient: JapaneseTextAnalysisClient,
    wordNoteStore: WordNoteStore,
    encounterMediaStore: EncounterMediaStore,
    cameraAuthorizationClient: CameraAuthorizationClient,
    openRelated: @escaping (DictionaryRelationship) -> Void,
    openKanji: @escaping (KanjiCharacter, DictionaryEntry?) -> Void,
    openWord: @escaping (DictionaryEntry) -> Void,
    openConjugations: @escaping (Conjugations) -> Void,
    manageFrequencyDictionaries: @escaping () -> Void,
    openList: @escaping (UUID) -> Void
  ) {
    _notes = State(initialValue: SavedItemNotes(store: wordNoteStore))
    _photos = State(
      initialValue: SavedItemPhotos(
        store: encounterMediaStore, cameraAuthorizationClient: cameraAuthorizationClient))
    self.entry = entry
    self.initialEncounterMedia = initialEncounterMedia
    self.speechSynthesisClient = speechSynthesisClient
    self.exampleSentenceClient = exampleSentenceClient
    self.japaneseTextAnalysisClient = japaneseTextAnalysisClient
    self.openRelated = openRelated
    self.openKanji = openKanji
    self.openWord = openWord
    self.openConjugations = openConjugations
    self.manageFrequencyDictionaries = manageFrequencyDictionaries
    self.openList = openList
  }

  private var item: SavedItem { .word(entry) }

  var body: some View {
    let page = WordPage(entry)
    let frame = WordPage.frame(for: entry, page: page)
    ScrollViewReader { proxy in
      List {
        Section {
          WordHeroView(
            entry: entry,
            page: page,
            pronounceLabel: frame?.pronounce ?? "",
            encounterMedia: photos.displayable,
            removeEncounterMedia: photos.remove,
            pronounce: { speechSynthesisClient.speak(entry.reading) }
          )
          PartOfSpeechRow(
            title: page?.partOfSpeechRow ?? "", entryID: entry.id,
            conjugations: page?.conjugations, openConjugations: openConjugations)
        }

        if let frame {
          ForEach(frame.sections, id: \.kind) { section in
            pageSection(section, of: page, in: frame)
          }
        }
      }
      .groupedList()
      .scrollDismissesKeyboard(.immediately)
      .accessibilityIdentifier("word-detail.screen")
      .onChange(of: notes.editingNoteID) { _, noteID in
        noteEditorFocused = noteID != nil
        guard noteID != nil else { return }
        Task { @MainActor in
          try? await Task.sleep(for: .milliseconds(350))
          proxy.scrollTo("word-note.section", anchor: .center)
        }
      }
    }
    .navigationTitle(entry.headword)
    .inlineNavigationTitle()
    .savedItemActions(
      for: item, identifierPrefix: "word-detail", share: SharedPage(word: entry, page: page),
      notes: notes,
      photos: photos, showsListPicker: $showsListPicker)
    .sheet(item: $frequencyDisclosure) { row in
      FrequencyDisclosureView(
        details: row.details,
        manage: {
          frequencyDisclosure = nil
          manageFrequencyDictionaries()
        }
      )
    }
    .onDisappear {
      notes.finishEditing()
    }
    .onChange(of: zenbuAccount?.sync.keptRevision) {
      Task {
        await notes.refresh()
        await photos.refresh()
      }
    }
    .task(id: entry.id) {
      await notes.load(item)
      await photos.load(item, saving: initialEncounterMedia)
      guard !Task.isCancelled else { return }
      analysisAvailability = await japaneseTextAnalysisClient.availability()
    }
    .screenTask(id: entry.id) { await loadExamples() }
  }

  private func loadExamples() async {
    await examples.load(entry.id.rawValue, rowsOnScreen: rowsOnScreen, read: readExamples)
  }

  private func readExamples(_ batch: ExampleBatch) async -> ExamplePage? {
    await exampleSentenceClient.shownExamples(entry, batch)
  }
}

extension WordDetailView {
  @ViewBuilder
  fileprivate func pageSection(
    _ section: WordPage.Section, of page: WordPage?, in frame: WordPage.Frame
  ) -> some View {
    let title = section.title.uppercased()
    switch section.kind {
    case .meaning:
      Section(title) {
        MeaningSection(senses: page?.senses ?? [])
      }
    case .frequency:
      Section(title) {
        ForEach((page?.frequency ?? []).enumerated(), id: \.offset) { _, row in
          FrequencyRankRow(row: row) { frequencyDisclosure = $0 }
        }
      }
    case .conjugations:
      EmptyView()
    case .alternatives:
      Section(title) {
        AlternativeFormsSection(forms: page?.alternatives ?? [], openKanji: openKanji)
      }
    case .kanji:
      Section(title) {
        PrimaryKanjiSection(characters: page?.kanji ?? [], entry: entry, openKanji: openKanji)
      }
    case .alternativeKanji:
      Section(title) {
        AlternativeKanjiSection(characters: page?.alternativeKanji ?? [], openKanji: openKanji)
      }
    case .related:
      Section(title) {
        RelationshipsSection(
          related: page?.related ?? [], relationships: entry.relationships,
          openRelated: openRelated)
      }
    case .lists:
      Section(title) {
        SavedItemListsSection(
          item: item, identifierPrefix: "word-detail", openList: openList
        ) { showsListPicker = true }
      }
    case .notes:
      Section(title) {
        SavedItemNotesSection(
          notes: notes, editorFocused: $noteEditorFocused, identifierPrefix: "word-detail")
        .id("word-note.section")
      }
    case .examples:
      if analysisAvailability == .reduced {
        Section {
          Label(
            "Japanese text analysis is unavailable. Reinstall or update Zenbu to restore word links.",
            systemImage: "info.circle"
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("word-detail.reduced-analysis")
        }
      }
      ExampleSentenceSections(
        title: title,
        examples: examples,
        source: entry.id.rawValue,
        emptyMessage: frame.noExamples,
        presentation: { .wordDetail(index: $0) },
        speechSynthesisClient: speechSynthesisClient,
        read: readExamples,
        readAgain: { await loadExamples() },
        openWord: openWord
      )
    }
  }
}

private struct PrimaryKanjiSection: View {
  let characters: [String]
  let entry: DictionaryEntry
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    ForEach(characters, id: \.self) { character in
      if let kanji = KanjiCharacter(character) {
        WordDetailKanjiLink(
          kanji: kanji,
          destinationEntry: entry,
          accessibilityLabel: "Kanji \(character)",
          accessibilityIdentifier: "word-detail.kanji.\(character)",
          openKanji: openKanji
        )
      }
    }
  }
}

private struct AlternativeKanjiSection: View {
  let characters: [String]
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    ForEach(characters, id: \.self) { character in
      if let kanji = KanjiCharacter(character) {
        WordDetailKanjiLink(
          kanji: kanji,
          destinationEntry: nil,
          accessibilityLabel: "Alternative kanji \(character)",
          accessibilityIdentifier: "word-detail.alternative-kanji.\(character)",
          openKanji: openKanji
        )
      }
    }
  }
}

private struct WordDetailKanjiLink: View {
  let kanji: KanjiCharacter
  let destinationEntry: DictionaryEntry?
  let accessibilityLabel: String
  let accessibilityIdentifier: String
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    LinkRow {
      openKanji(kanji, destinationEntry)
    } label: {
      Text(kanji.rawValue)
        .font(.title2.weight(.semibold))
    }
    .accessibilityLabel(accessibilityLabel)
    .accessibilityIdentifier(accessibilityIdentifier)
  }
}

private struct WordHeroView: View {
  let entry: DictionaryEntry
  let page: WordPage?
  let pronounceLabel: String
  let encounterMedia: [EncounterMedia]
  let removeEncounterMedia: (String) async -> Void
  let pronounce: () -> Void

  @Environment(WordKnowledge.self) private var wordKnowledge

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      headline
      if wordKnowledge.isKnown(entry.id) {
        KnownWordBadge(announces: true)
          .padding(.bottom, 4)
      }
    }
  }

  private var headline: some View {
    WordHeadline(
      ruby: JapaneseRuby(headwordOf: entry, on: page),
      pitch: page?.pitch,
      pronounceLabel: pronounceLabel,
      identifierPrefix: "word-detail",
      pronounce: pronounce
    ) {
      if let latest = encounterMedia.first {
        SavedItemPhotoButton(
          media: latest,
          count: encounterMedia.count,
          encounterMedia: encounterMedia,
          removeEncounterMedia: removeEncounterMedia
        )
      }
    }
  }
}
