import SwiftUI
import UIKit

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
  /// Empty while loading and when no frequency dictionary is enabled.
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
      .listStyle(.insetGrouped)
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
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        if notes.isEditing {
          Button("Done", action: notes.finishEditing)
            .font(.body.weight(.semibold))
            .accessibilityIdentifier("word-note.done")
        } else {
          ShareLink(item: shareText) {
            Label("Share", systemImage: "square.and.arrow.up")
          }
          .accessibilityIdentifier("word-detail.share")
          SavedItemMenu(
            item: item,
            identifierPrefix: "word-detail",
            addToList: { showsListPicker = true },
            addNote: notes.beginAdding,
            photos: photos
          )
        }
      }
    }
    .savedItemPhotoPresentation(photos)
    .sheet(isPresented: $showsListPicker) {
      WordListPickerView(item: item)
    }
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

/// The word itself: headword with furigana (following the Reading Aids setting), and its pitch
/// accent, pronounce button, and latest encounter photo in the space to its right.
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

/// A word or conjugated form shown large with furigana (following the Reading Aids setting),
/// with its pitch accent, pronounce button, and an optional accessory to its right. Word Detail
/// and the conjugation screens share it so a word always looks the same.
struct WordHeadline<Accessory: View>: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  let surface: String
  let reading: String
  /// A trailing part of `surface` in the accent color, such as a conjugation's ending.
  var highlightedEnding = ""
  var pitch: PitchAccent?
  let identifierPrefix: String
  let pronounce: () -> Void
  @ViewBuilder let accessory: () -> Accessory

  var body: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
      : AnyLayout(HStackLayout(alignment: .center, spacing: 12))
    layout {
      headword
        .frame(maxWidth: .infinity, alignment: .leading)
      controls
    }
    .padding(.vertical, 4)
  }

  private var headword: some View {
    ViewThatFits(in: .horizontal) {
      VStack(alignment: .leading, spacing: 2) {
        JapaneseRubyText(
          surface: surface,
          reading: reading,
          baseFont: .largeTitle,
          rubyFont: .title3.weight(.semibold),
          highlightedEnding: highlightedEnding
        )
        .fixedSize(horizontal: true, vertical: false)
        readingWithoutFurigana
      }

      VStack(alignment: .leading, spacing: 6) {
        Text(surface.highlightingEnding(highlightedEnding))
          .font(.title2.weight(.semibold))
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("\(identifierPrefix).identity-surface")
        Text(reading)
          .font(dynamicTypeSize.isAccessibilitySize ? .body : .callout)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("\(identifierPrefix).identity-reading")
        RomajiReadingAidText(trustedReading: reading, font: .callout)
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("\(identifierPrefix).identity")
    }
  }

  /// A headword always needs its reading, so it moves under the headword when the learner
  /// turns furigana off.
  @ViewBuilder
  private var readingWithoutFurigana: some View {
    if !readingAidPreferences.showsFurigana, reading != surface {
      Text(reading)
        .font(.title3)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("\(identifierPrefix).identity-reading")
    }
  }

  private var controls: some View {
    HStack(spacing: 8) {
      if let pitch {
        PitchAccentBadge(reading: reading, pitch: pitch)
      }
      Button(action: pronounce) {
        Image(systemName: "speaker.wave.2.fill")
          .font(.title3)
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(.rect)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Pronounce \(reading)")
      .accessibilityIdentifier("\(identifierPrefix).pronounce")
      accessory()
    }
  }
}

extension WordHeadline where Accessory == EmptyView {
  init(
    surface: String,
    reading: String,
    highlightedEnding: String = "",
    pitch: PitchAccent? = nil,
    identifierPrefix: String,
    pronounce: @escaping () -> Void
  ) {
    self.init(
      surface: surface,
      reading: reading,
      highlightedEnding: highlightedEnding,
      pitch: pitch,
      identifierPrefix: identifierPrefix,
      pronounce: pronounce,
      accessory: { EmptyView() }
    )
  }
}

extension String {
  /// This string with `ending` drawn in the accent color when it ends the string.
  func highlightingEnding(_ ending: String) -> AttributedString {
    var result = AttributedString(self)
    guard !ending.isEmpty, hasSuffix(ending) else { return result }
    let start = result.characters.index(result.endIndex, offsetBy: -ending.count)
    result[start...].foregroundColor = .accentColor
    return result
  }
}

/// The part of speech, which opens the conjugation table when one exists.
private struct PartOfSpeechRow: View {
  let entry: DictionaryEntry
  let conjugationTable: ConjugationTable?

  var body: some View {
    if let conjugationTable {
      NavigationLink(value: SearchExperienceRoute.conjugations(entry, conjugationTable)) {
        label
      }
      .accessibilityHint("Shows conjugations")
      .accessibilityIdentifier("word-detail.conjugations")
    } else if !title.isEmpty {
      label
    }
  }

  private var label: some View {
    Text(title.isEmpty ? "Dictionary entry" : title)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityIdentifier("word-detail.entry.\(entry.id.rawValue)")
  }

  private var title: String { entry.displayPartOfSpeech }
}

/// The reading in katakana with its pitch accent drawn as a contour: a dot per mora at high or
/// low pitch joined by a line, and a hollow dot for the pitch of a following particle.
private struct PitchAccentBadge: View {
  let reading: String
  let pitch: PitchAccent
  @ScaledMetric(relativeTo: .body) private var moraWidth: CGFloat = 20
  @ScaledMetric(relativeTo: .body) private var contourSpace = 7.0
  @ScaledMetric(relativeTo: .body) private var horizontalPadding = 10.0

  var body: some View {
    let morae = reading.katakana.morae
    // A combined mora such as キョ needs more room than a single kana.
    let widths = morae.map { moraWidth * ($0.count > 1 ? 1.5 : 1) }
    HStack(spacing: 0) {
      ForEach(morae.enumerated(), id: \.offset) { index, mora in
        Text(mora)
          .font(.body)
          .lineLimit(1)
          .fixedSize()
          .frame(width: widths[index])
      }
      // Room for the particle dot after the last mora.
      Color.clear.frame(width: moraWidth * 0.6, height: 1)
    }
    .padding(.vertical, contourSpace)
    .overlay {
      PitchContour(
        levels: pitch.levels(moraCount: morae.count), moraWidths: widths,
        particleWidth: moraWidth * 0.6)
        .foregroundStyle(ZenbuTheme.pitchDownstep)
    }
    .padding(.horizontal, horizontalPadding)
    .padding(.vertical, 2)
    .background(.fill.tertiary, in: Capsule())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "Pitch accent for \(reading), downstep \(pitch.downstep), \(pitch.moraCount) mora")
    .accessibilityIdentifier("word-detail.pitch")
  }
}

/// Draws pitch levels across evenly spaced morae: high points at the top edge, low points at the
/// bottom edge, and a hollow point for the following particle.
private struct PitchContour: View {
  let levels: (morae: [Bool], particle: Bool)
  let moraWidths: [CGFloat]
  let particleWidth: CGFloat
  @ScaledMetric(relativeTo: .body) private var dotSize: CGFloat = 5

  var body: some View {
    Canvas { context, size in
      let inset = dotSize / 2 + 1
      func y(_ high: Bool) -> CGFloat { high ? inset : size.height - inset }
      var x: CGFloat = 0
      var moraPoints: [CGPoint] = []
      for (width, high) in zip(moraWidths, levels.morae) {
        moraPoints.append(CGPoint(x: x + width / 2, y: y(high)))
        x += width
      }
      guard !moraPoints.isEmpty else { return }
      let particlePoint = CGPoint(x: x + particleWidth / 2, y: y(levels.particle))
      var line = Path()
      line.addLines(moraPoints + [particlePoint])
      context.stroke(line, with: .foreground, lineWidth: 1.5)
      for point in moraPoints {
        context.fill(dot(at: point), with: .foreground)
      }
      context.fill(dot(at: particlePoint), with: .color(Color(.tertiarySystemFill)))
      context.stroke(dot(at: particlePoint), with: .foreground, lineWidth: 1.5)
    }
    .accessibilityHidden(true)
  }

  private func dot(at point: CGPoint) -> Path {
    Path(
      ellipseIn: CGRect(
        x: point.x - dotSize / 2, y: point.y - dotSize / 2, width: dotSize, height: dotSize))
  }
}

extension String {
  fileprivate var katakana: String {
    String(
      unicodeScalars.map { scalar in
        let value = scalar.value
        if (0x3041...0x3096).contains(value), let converted = UnicodeScalar(value + 0x60) {
          return Character(String(converted))
        }
        return Character(String(scalar))
      })
  }
}

/// The latest photo attached to a word or kanji, with how many there are; it opens them all.
struct SavedItemPhotoButton: View {
  @State private var presentedMedia: EncounterMedia?
  let media: EncounterMedia
  let count: Int
  let encounterMedia: [EncounterMedia]
  let removeEncounterMedia: (String) async -> Void

  var body: some View {
    Button {
      presentedMedia = media
    } label: {
      if let image = UIImage(data: media.data) {
        HStack(spacing: 8) {
          if count > 1 {
            Text("\(count)").font(.caption.monospacedDigit())
          }
          Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .frame(width: 56, height: 44)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Saved encounter images, \(count)")
    .accessibilityIdentifier("word-detail.image-attachment")
    .sheet(item: $presentedMedia) { media in
      EncounterMediaViewer(
        encounterMedia: encounterMedia,
        initialMediaID: media.id,
        removeEncounterMedia: removeEncounterMedia
      )
    }
  }
}

private struct EncounterMediaViewer: View {
  @Environment(\.dismiss) private var dismiss
  @State private var selectedMediaID: String
  @State private var isRemovingMedia = false

  let encounterMedia: [EncounterMedia]
  let removeEncounterMedia: (String) async -> Void

  init(
    encounterMedia: [EncounterMedia],
    initialMediaID: String,
    removeEncounterMedia: @escaping (String) async -> Void
  ) {
    self.encounterMedia = encounterMedia
    self.removeEncounterMedia = removeEncounterMedia
    _selectedMediaID = State(initialValue: initialMediaID)
  }

  var body: some View {
    NavigationStack {
      TabView(selection: $selectedMediaID) {
        ForEach(Array(encounterMedia.enumerated()), id: \.element.id) { index, media in
          VStack(spacing: 12) {
            if let image = UIImage(data: media.data) {
              Image(uiImage: image).resizable().scaledToFit()
                .accessibilityLabel("Image \(index + 1) of \(encounterMedia.count)")
                .accessibilityIdentifier("word-detail.image-page")
                .accessibilityHidden(media.id != selectedMediaID)
            }
          }
          .padding()
          .tag(media.id)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .automatic))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done", action: dismiss.callAsFunction)
            .accessibilityIdentifier("word-detail.image-attachment-done")
        }
        ToolbarItem(placement: .destructiveAction) {
          Button("Remove from Word", role: .destructive) {
            Task { await removeSelectedMedia() }
          }
          .disabled(isRemovingMedia)
          .accessibilityIdentifier("word-detail.image-attachment-remove")
        }
      }
    }
  }

  private func removeSelectedMedia() async {
    guard !isRemovingMedia else { return }
    isRemovingMedia = true
    defer { isRemovingMedia = false }
    await removeEncounterMedia(selectedMediaID)
    guard encounterMedia.count > 1,
      let nextMedia = encounterMedia.first(where: { $0.id != selectedMediaID })
    else {
      dismiss()
      return
    }
    selectedMediaID = nextMedia.id
  }
}

/// One enabled dictionary's rank for this entry. Selecting it opens that dictionary's details.
private struct FrequencyRankRow: View {
  let result: FrequencyLookupResult
  let showDetails: (FrequencyLookupResult) -> Void

  var body: some View {
    let presentation = FrequencyPresentationModel(result: result)
    Button {
      showDetails(result)
    } label: {
      HStack(spacing: 10) {
        FrequencyTierMarker(tier: presentation.tier)
        Text(presentation.packName)
          .foregroundStyle(.primary)
        Spacer(minLength: 8)
        Text(presentation.tier == nil ? presentation.missingText : presentation.inlineText)
          .monospacedDigit()
          .foregroundStyle(.secondary)
      }
      .contentShape(.rect)
    }
    // List buttons tint their labels with the accent color; keep the row's own text colors.
    .tint(.primary)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(presentation.inlineAccessibilityLabel)
    .accessibilityAddTraits(.isButton)
    .accessibilityIdentifier(
      "word-detail.frequency.\(presentation.pack?.id.rawValue ?? "unavailable")")
  }
}

private struct FrequencyDisclosureItem: Identifiable {
  let result: FrequencyLookupResult

  var id: String {
    FrequencyPresentationModel(result: result).pack?.id.rawValue ?? "frequency-unavailable"
  }
}

private struct FrequencyDisclosureView: View {
  @Environment(\.dismiss) private var dismiss
  let item: FrequencyDisclosureItem
  let manage: () -> Void

  var body: some View {
    let presentation = FrequencyPresentationModel(result: item.result)
    NavigationStack {
      List {
        if let pack = presentation.pack {
          Section(pack.displayName) {
            LabeledContent("Domain", value: pack.domain)
            Text(pack.domainDescription)
            LabeledContent("Version", value: pack.version)
            LabeledContent("Source", value: pack.attribution)
          }
        }
        Section(presentation.levelText == nil ? "Frequency" : "Level") {
          if let levelText = presentation.levelText {
            LabeledContent("JLPT Level", value: levelText)
          } else if let rankText = presentation.rankText,
            let percentileText = presentation.percentileText
          {
            LabeledContent("Rank", value: rankText)
            LabeledContent("Percentile", value: percentileText)
          } else if let explanation = presentation.explanation {
            Text(explanation)
          }
        }
        Section {
          Button("Manage Frequency Dictionaries", action: manage)
            .accessibilityIdentifier("frequency-detail.manage")
        }
      }
      .accessibilityIdentifier("frequency-detail.list")
      .navigationTitle("Frequency Details")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: dismiss.callAsFunction)
        }
      }
    }
  }
}

private struct MeaningSection: View {
  let senses: [DictionarySense]

  var body: some View {
    ForEach(senses, id: \.self) { sense in
      VStack(alignment: .leading, spacing: 6) {
        Text("\(senseNumber(for: sense)).  \(sense.meaning)")
          .font(.body.weight(.semibold))
        if !sense.notes.isEmpty {
          Text(sense.notes.joined(separator: " · "))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
    }
  }

  private func senseNumber(for sense: DictionarySense) -> Int {
    (senses.firstIndex(of: sense) ?? senses.startIndex) + 1
  }
}

private struct AlternativeFormsSection: View {
  let forms: [DictionaryForm]
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      if !writtenForms.isEmpty {
        AlternativeFormLine(forms: writtenForms, openKanji: openKanji)
      }
      if !readingForms.isEmpty {
        AlternativeFormLine(forms: readingForms, openKanji: openKanji)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var writtenForms: [DictionaryForm] { forms.filter { $0.kind == .written } }
  private var readingForms: [DictionaryForm] { forms.filter { $0.kind == .reading } }
}

private struct AlternativeFormLine: View {
  let forms: [DictionaryForm]
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 7) { tokens }
      VStack(alignment: .leading, spacing: 5) { tokens }
    }
  }

  @ViewBuilder
  private var tokens: some View {
    ForEach(Array(forms.enumerated()), id: \.element.value) { index, form in
      HStack(spacing: 2) {
        if index > 0 { Text(",") }
        if let character = form.value.first(where: { $0.isKanji }),
          let kanji = KanjiCharacter(String(character))
        {
          Button {
            openKanji(kanji, nil)
          } label: {
            formLabel(form)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("word-detail.alternative.\(form.value)")
        } else {
          formLabel(form)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("word-detail.alternative.\(form.value)")
        }
      }
    }
  }

  private func formLabel(_ form: DictionaryForm) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(form.value + (form.labels.isEmpty ? "" : " (\(form.labels.joined(separator: ", ")))"))
        .font(.body)
        .foregroundStyle(form.labels.isEmpty ? Color.primary : Color.secondary)
      RomajiReadingAidText(
        trustedReading: form.value,
        isEnabled: form.kind == .reading,
        exposesAccessibility: false
      )
    }
  }
}

private struct RelationshipsSection: View {
  let relationships: [DictionaryRelationship]
  let openRelated: (DictionaryRelationship) -> Void

  var body: some View {
    ForEach(relationships, id: \.self) { relationship in
      Button {
        openRelated(relationship)
      } label: {
        VStack(alignment: .leading, spacing: 3) {
          JapaneseRubyText(
            surface: relationship.headword,
            reading: relationship.reading,
            baseFont: .headline,
            rubyFont: .caption,
            exposesAccessibility: false
          )
          .foregroundStyle(.primary)
          .accessibilityIdentifier("word-detail.related-primary.\(relationship.headword)")
          Text("\(relationship.relation) · \(relationship.summary)")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .accessibilityIdentifier("word-detail.related-support.\(relationship.headword)")
        }
      }
      .tint(.primary)
      .accessibilityLabel(
        "\(relationship.headword), \(relationship.reading), \(relationship.relation), \(relationship.summary)"
      )
      .accessibilityIdentifier("word-detail.related.\(relationship.headword)")
    }
  }
}

/// The lists holding the word, each opening that list, then Add to List, which opens the picker.
extension Character {
  fileprivate var isKanji: Bool {
    unicodeScalars.contains { (0x3400...0x9FFF).contains(Int($0.value)) }
  }
}
