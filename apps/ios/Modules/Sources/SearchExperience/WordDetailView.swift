import SwiftUI

struct WordDetailView: View {
  @FocusState private var noteEditorFocused: Bool
  @State private var notes: SavedItemNotes
  @State private var photos: SavedItemPhotos
  @State private var examples: [ExampleSentence] = []
  @State private var examplesEntryID: LanguageReferenceID?
  @State private var isLoadingExamples = true
  @State private var showsListPicker = false
  @State private var frequencyDisclosure: FrequencyDisclosureItem?
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @State private var frequency = FrequencyRanks()

  let entry: DictionaryEntry
  let initialEncounterMedia: EncounterMediaAttachment?
  let speechSynthesisClient: SpeechSynthesisClient
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let frequencyCapability: FrequencyCapability
  let conjugationTable: ConjugationTable?
  let openRelated: (DictionaryRelationship) -> Void
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void
  let openWord: (DictionaryEntry) -> Void
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
    frequencyCapability: FrequencyCapability,
    conjugationTable: ConjugationTable?,
    openRelated: @escaping (DictionaryRelationship) -> Void,
    openKanji: @escaping (KanjiCharacter, DictionaryEntry?) -> Void,
    openWord: @escaping (DictionaryEntry) -> Void,
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
    self.frequencyCapability = frequencyCapability
    self.conjugationTable = conjugationTable
    self.openRelated = openRelated
    self.openKanji = openKanji
    self.openWord = openWord
    self.manageFrequencyDictionaries = manageFrequencyDictionaries
    self.openList = openList
  }

  private var item: SavedItem { .word(entry) }

  private var shareText: String {
    let heading = entry.reading == entry.headword
      ? entry.headword : "\(entry.headword)【\(entry.reading)】"
    let meanings = entry.senses.enumerated().map { "\($0.offset + 1). \($0.element.meaning)" }
    return ([heading] + meanings).joined(separator: "\n")
  }

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section {
          WordHeroView(
            entry: entry,
            encounterMedia: photos.displayable,
            removeEncounterMedia: photos.remove,
            pronounce: { speechSynthesisClient.speak(entry.reading) }
          )
          PartOfSpeechRow(entry: entry, conjugationTable: conjugationTable)
        }

        Section("MEANING") {
          MeaningSection(senses: entry.senses)
        }

        if !frequency.isEmpty {
          Section("FREQUENCY") {
            ForEach(frequency.enumerated(), id: \.offset) { _, result in
              FrequencyRankRow(result: result) {
                frequencyDisclosure = FrequencyDisclosureItem(result: $0)
              }
            }
          }
          .accessibilityIdentifier("word-detail.frequency")
        }

        if !entry.alternativeForms.isEmpty {
          Section("ALTERNATIVES") {
            AlternativeFormsSection(forms: entry.alternativeForms, openKanji: openKanji)
          }
        }

        if !entry.primaryKanji.isEmpty {
          Section("KANJI") {
            PrimaryKanjiSection(
              characters: entry.primaryKanji, entry: entry)
          }
        }

        if !entry.alternativeKanji.isEmpty {
          Section("ALTERNATIVE KANJI") {
            AlternativeKanjiSection(characters: entry.alternativeKanji)
          }
        }

        if !entry.relationships.isEmpty {
          Section("RELATED WORDS") {
            RelationshipsSection(relationships: entry.relationships, openRelated: openRelated)
          }
        }

        Section("LISTS") {
          SavedItemListsSection(
            item: item, identifierPrefix: "word-detail", openList: openList
          ) { showsListPicker = true }
        }

        Section("NOTES") {
          SavedItemNotesSection(
            notes: notes, editorFocused: $noteEditorFocused, identifierPrefix: "word-detail")
          .id("word-note.section")
        }

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
          title: "EXAMPLES",
          examples: examplesEntryID == entry.id ? examples : [],
          isLoading: isLoadingExamples || examplesEntryID != entry.id,
          emptyMessage: "No source-matched examples",
          highlightedQuery: SearchQuery(entry.headword),
          highlightedEntry: entry,
          presentation: { .wordDetail(index: $0) },
          speechSynthesisClient: speechSynthesisClient,
          japaneseTextAnalysisClient: japaneseTextAnalysisClient,
          openWord: openWord
        )
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
      for: item, identifierPrefix: "word-detail", shareText: shareText, notes: notes,
      photos: photos, showsListPicker: $showsListPicker)
    .sheet(item: $frequencyDisclosure) { item in
      FrequencyDisclosureView(
        item: item,
        manage: {
          frequencyDisclosure = nil
          manageFrequencyDictionaries()
        }
      )
    }
    .onDisappear {
      notes.finishEditing()
    }
    .task(id: entry.id) {
      isLoadingExamples = true
      await photos.load(item, saving: initialEncounterMedia)
      guard !Task.isCancelled else { return }
      let loadedExamples = (try? await exampleSentenceClient.examples(entry)) ?? []
      guard !Task.isCancelled else { return }
      analysisAvailability = await japaneseTextAnalysisClient.availability()
      frequency =
        (try? await frequencyCapability.evidence(for: entry.id))
        ?? [
          .unavailable(
            FrequencyPackUnavailable(
              pack: nil,
              reason: "Frequency data unavailable"
            ))
        ]
      await notes.load(entry.noteID)
      guard !Task.isCancelled else { return }
      examples = loadedExamples
      examplesEntryID = entry.id
      isLoadingExamples = false
    }
  }
}

private struct PrimaryKanjiSection: View {
  let characters: [String]
  let entry: DictionaryEntry

  var body: some View {
    ForEach(characters, id: \.self) { character in
      if let kanji = KanjiCharacter(character) {
        WordDetailKanjiLink(
          kanji: kanji,
          destinationEntry: entry,
          accessibilityLabel: "Kanji \(character)",
          accessibilityIdentifier: "word-detail.kanji.\(character)"
        )
      }
    }
  }
}

private struct AlternativeKanjiSection: View {
  let characters: [String]

  var body: some View {
    ForEach(characters, id: \.self) { character in
      if let kanji = KanjiCharacter(character) {
        WordDetailKanjiLink(
          kanji: kanji,
          destinationEntry: nil,
          accessibilityLabel: "Alternative kanji \(character)",
          accessibilityIdentifier: "word-detail.alternative-kanji.\(character)"
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

  var body: some View {
    NavigationLink(value: SearchExperienceRoute.kanji(kanji, destinationEntry)) {
      Text(kanji.rawValue)
        .font(.title2.weight(.semibold))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityLabel(accessibilityLabel)
    .accessibilityIdentifier(accessibilityIdentifier)
  }
}

private struct WordHeroView: View {
  let entry: DictionaryEntry
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
      surface: entry.headword,
      reading: entry.reading,
      pitch: entry.pitchAccent,
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
