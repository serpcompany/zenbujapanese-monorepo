import CoreTransferable
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct WordDetailView: View {
  @FocusState private var noteEditorFocused: Bool
  @State private var editingNoteID: String?
  @State private var noteDraft = ""
  @State private var notes: [LearnerWordNote] = []
  @State private var noteSaveTask: Task<Void, Never>?
  @State private var examples: [ExampleSentence] = []
  @State private var isLoadingExamples = true
  @State private var lastSpeechRequest: String?
  @State private var encounterMedia: [EncounterMedia] = []
  @State private var selectedEncounterMediaItem: PhotosPickerItem?
  @State private var encounterMediaImportFailed = false
  @State private var cameraAlert: WordDetailCameraAlert?
  @State private var showsCamera = false
  @State private var frequencyDisclosure: FrequencyDisclosureItem?
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @State private var frequency: FrequencyLookupResult = .unavailable(
    FrequencyPackUnavailable(
      pack: nil,
      reason: "Loading frequency data")
  )

  let entry: DictionaryEntry
  let initialEncounterMedia: EncounterMediaAttachment?
  let speechSynthesisClient: SpeechSynthesisClient
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let wordNoteStore: WordNoteStore
  let encounterMediaStore: EncounterMediaStore
  let cameraAuthorizationClient: CameraAuthorizationClient
  let frequencyCapability: FrequencyCapability
  let conjugationTable: ConjugationTable?
  let openRelated: (DictionaryRelationship) -> Void
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void
  let openWord: (DictionaryEntry) -> Void
  let manageFrequencyDictionaries: () -> Void

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section("WORD") {
          WordIdentityView(entry: entry)
          PronunciationRow(
            entry: entry,
            pronounce: { speechSynthesisClient.speak(entry.reading) }
          )
          if let latestEncounterMedia = displayableEncounterMedia.first {
            EncounterMediaRow(
              media: latestEncounterMedia,
              count: displayableEncounterMedia.count,
              encounterMedia: displayableEncounterMedia,
              removeEncounterMedia: removeEncounterMedia
            )
          }
        }

        Section("ENTRY") {
          PartOfSpeechRow(
            entry: entry,
            title: (entry.senses.first?.partsOfSpeech ?? entry.partsOfSpeech)
              .map(\.rawValue)
              .joined(separator: " · "),
            conjugationTable: conjugationTable
          )
          FrequencyRow(
            result: frequency,
            showDetails: { frequencyDisclosure = FrequencyDisclosureItem(result: frequency) }
          )
        }

        if !entry.alternativeForms.isEmpty {
          Section("ALTERNATIVES") {
            AlternativeFormsSection(forms: entry.alternativeForms, openKanji: openKanji)
          }
        }

        Section("MEANING") {
          MeaningSection(senses: entry.senses)
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

        Section("NOTES") {
          NotesSection(
            notes: notes,
            editingNoteID: editingNoteID,
            noteDraft: $noteDraft,
            editorFocused: $noteEditorFocused,
            editNote: beginEditingNote,
            addNote: beginAddingNote
          )
          .id("word-note.section")
        }

        Section("EXAMPLES") {
          if analysisAvailability == .reduced {
            Label(
              "Japanese text analysis is unavailable. Reinstall or update Zenbu to restore word links.",
              systemImage: "info.circle"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("word-detail.reduced-analysis")
          }
          EntryExamplesSection(
            entry: entry,
            examples: examples,
            isLoading: isLoadingExamples,
            speechSynthesisClient: speechSynthesisClient,
            japaneseTextAnalysisClient: japaneseTextAnalysisClient,
            openWord: openWord
          )
        }
      }
      .listStyle(.insetGrouped)
      .scrollDismissesKeyboard(.immediately)
      .accessibilityIdentifier("word-detail.screen")
      .onChange(of: editingNoteID) { _, noteID in
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
        if editingNoteID != nil {
          Button("Done", action: finishEditingNote)
            .font(.body.weight(.semibold))
            .accessibilityIdentifier("word-note.done")
        } else {
          Menu {
            Button("Add Note", systemImage: "square.and.pencil", action: beginAddingNote)
            Button("Take Photo", systemImage: "camera", action: presentCamera)
            PhotosPicker(selection: $selectedEncounterMediaItem, matching: .images) {
              Label("Choose Photo", systemImage: "photo.on.rectangle")
            }
          } label: {
            Label("Add", systemImage: "plus")
              .labelStyle(.iconOnly)
          }
          .menuOrder(.fixed)
          .accessibilityLabel("Add")
          .accessibilityIdentifier("word-detail.add-menu")
        }
      }
    }
    .alert("Unable to Save Image", isPresented: $encounterMediaImportFailed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("The selected image could not be read.")
    }
    .alert(item: $cameraAlert) { alert in
      alert.alert(openSettings: cameraAuthorizationClient.openSettings)
    }
    .sheet(isPresented: $showsCamera) {
      #if DEBUG
        if WordDetailCameraFixtureScenario.current == .cancel {
          WordDetailCameraCancelFixture {
            saveCameraResult(.success(nil))
            showsCamera = false
          }
        } else {
          cameraPicker
        }
      #else
        cameraPicker
      #endif
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
    .overlay(alignment: .topLeading) {
      if let lastSpeechRequest {
        Color.clear
          .frame(width: 1, height: 1)
          .accessibilityElement()
          .accessibilityLabel("Speech requested \(lastSpeechRequest)")
          .accessibilityIdentifier("speech.request")
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .speechSynthesisRequested)) {
      notification in
      lastSpeechRequest = notification.object as? String
    }
    .onChange(of: selectedEncounterMediaItem) {
      importSelectedEncounterMedia()
    }
    .onDisappear {
      guard editingNoteID != nil else { return }
      persistDraft()
    }
    .task(id: entry.id) {
      isLoadingExamples = true
      encounterMedia = []
      let word = entry.encounterWordReference
      if let initialEncounterMedia {
        await encounterMediaStore.save(initialEncounterMedia, word)
      }
      let storedMedia = await encounterMediaStore.encounters(word)
      guard !Task.isCancelled else { return }
      encounterMedia = storedMedia
      examples = (try? await exampleSentenceClient.examples(entry)) ?? []
      analysisAvailability = await japaneseTextAnalysisClient.availability()
      frequency =
        (try? await frequencyCapability.evidence(for: entry.id))
        ?? .unavailable(
          FrequencyPackUnavailable(
            pack: nil,
            reason: "Frequency data unavailable"
          ))
      notes = await wordNoteStore.load(entry.noteID)
      editingNoteID = nil
      noteDraft = ""
      isLoadingExamples = false
    }
  }

  private var displayableEncounterMedia: [EncounterMedia] {
    encounterMedia.filter { UIImage(data: $0.data) != nil }
  }

  private func removeEncounterMedia(_ mediaID: String) async {
    let word = entry.encounterWordReference
    await encounterMediaStore.remove(word, mediaID)
    encounterMedia = await encounterMediaStore.encounters(word)
  }

  private func importSelectedEncounterMedia() {
    guard let selectedEncounterMediaItem else { return }
    Task { @MainActor in
      defer { self.selectedEncounterMediaItem = nil }
      do {
        guard
          let selectedMedia = try await selectedEncounterMediaItem.loadTransferable(
            type: SelectedEncounterMedia.self)
        else {
          encounterMediaImportFailed = true
          return
        }
        await saveEncounterMedia(selectedMedia.asset)
      } catch {
        encounterMediaImportFailed = true
      }
    }
  }

  private func presentCamera() {
    guard cameraAuthorizationClient.isCameraAvailable() else {
      cameraAlert = .unavailable
      return
    }
    Task { @MainActor in
      switch cameraAuthorizationClient.state() {
      case .authorized:
        openCamera()
      case .notDetermined:
        if await cameraAuthorizationClient.requestAccess() {
          openCamera()
        } else {
          cameraAlert = .denied
        }
      case .denied:
        cameraAlert = .denied
      case .restricted:
        cameraAlert = .restricted
      }
    }
  }

  private func openCamera() {
    #if DEBUG
      if let fixtureResult = WordDetailCameraTestFixtures.resultFromProcessArguments() {
        saveCameraResult(fixtureResult)
        return
      }
    #endif
    showsCamera = true
  }

  private var cameraPicker: some View {
    ImageCameraPicker { result in
      showsCamera = false
      saveCameraResult(result)
    }
    .ignoresSafeArea()
  }

  private func saveCameraResult(_ result: Result<ImageTextAsset?, Error>) {
    switch result {
    case .success(let asset):
      guard let asset else { return }
      Task { @MainActor in
        await saveEncounterMedia(asset)
      }
    case .failure:
      cameraAlert = .saveFailure
    }
  }

  private func saveEncounterMedia(_ asset: ImageTextAsset) async {
    let word = entry.encounterWordReference
    await encounterMediaStore.save(
      EncounterMediaAttachment(name: asset.name, data: asset.data), word)
    encounterMedia = await encounterMediaStore.encounters(word)
  }

  private func beginEditingNote(_ note: LearnerWordNote) {
    editingNoteID = note.id
    noteDraft = note.text
    noteEditorFocused = true
  }

  private func beginAddingNote() {
    if let editingNoteID {
      let updatedNotes = notesApplyingDraft(noteID: editingNoteID, draft: noteDraft)
      notes = updatedNotes
      scheduleNoteSave(updatedNotes)
    }
    editingNoteID = UUID().uuidString
    noteDraft = ""
    noteEditorFocused = true
  }

  private func finishEditingNote() {
    persistDraft()
  }

  private func persistDraft() {
    let updatedNotes = applyingDraft()
    scheduleNoteSave(updatedNotes)
  }

  @discardableResult
  private func scheduleNoteSave(_ updatedNotes: [LearnerWordNote]) -> Task<Void, Never> {
    let precedingSave = noteSaveTask
    let save = Task {
      await precedingSave?.value
      await wordNoteStore.save(updatedNotes, entry.noteID)
    }
    noteSaveTask = save
    return save
  }

  private func applyingDraft() -> [LearnerWordNote] {
    guard let editingNoteID else { return notes }
    let updatedNotes = notesApplyingDraft(noteID: editingNoteID, draft: noteDraft)
    notes = updatedNotes
    self.editingNoteID = nil
    noteDraft = ""
    noteEditorFocused = false
    return updatedNotes
  }

  private func notesApplyingDraft(noteID: String, draft: String) -> [LearnerWordNote] {
    let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    var updatedNotes = notes
    if let index = updatedNotes.firstIndex(where: { $0.id == noteID }) {
      if normalized.isEmpty {
        updatedNotes.remove(at: index)
      } else {
        updatedNotes[index].text = normalized
      }
    } else if !normalized.isEmpty {
      updatedNotes.append(LearnerWordNote(id: noteID, text: normalized))
    }
    return updatedNotes
  }
}

#if DEBUG
  private struct WordDetailCameraCancelFixture: View {
    let cancel: () -> Void

    var body: some View {
      NavigationStack {
        Color.black
          .ignoresSafeArea()
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button("Cancel", action: cancel)
                .accessibilityIdentifier("word-detail.camera-fixture-cancel")
            }
          }
      }
    }
  }
#endif

private enum WordDetailCameraAlert: String, Identifiable {
  case unavailable
  case denied
  case restricted
  case saveFailure

  var id: String { rawValue }

  func alert(openSettings: @escaping () -> Void) -> Alert {
    switch self {
    case .unavailable:
      Alert(
        title: Text("Camera Unavailable"),
        message: Text("Camera capture requires a physical device with an available camera."),
        dismissButton: .default(Text("OK"))
      )
    case .denied:
      Alert(
        title: Text("Camera Access Denied"),
        message: Text("Allow Camera access in Settings to take a photo for this word."),
        primaryButton: .default(Text("Open Settings"), action: openSettings),
        secondaryButton: .cancel()
      )
    case .restricted:
      Alert(
        title: Text("Camera Access Restricted"),
        message: Text("Camera access is restricted on this device."),
        dismissButton: .default(Text("OK"))
      )
    case .saveFailure:
      Alert(
        title: Text("Unable to Save Image"),
        message: Text("The captured image could not be read."),
        dismissButton: .default(Text("OK"))
      )
    }
  }
}

private struct SelectedEncounterMedia: Transferable {
  let asset: ImageTextAsset

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .image) { received in
      guard
        let asset = ImageTextAsset(
          photoLibraryImageAt: received.file,
          name: received.file.lastPathComponent)
      else {
        throw CocoaError(.fileReadCorruptFile)
      }
      return SelectedEncounterMedia(asset: asset)
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

private struct WordIdentityView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let entry: DictionaryEntry

  var body: some View {
    ViewThatFits(in: .horizontal) {
      JapaneseRubyText(
        surface: entry.headword,
        reading: entry.reading,
        baseFont: .largeTitle.weight(.light),
        rubyFont: .title3.weight(.semibold)
      )
      .fixedSize(horizontal: true, vertical: false)

      VStack(alignment: .leading, spacing: 6) {
        Text(entry.headword)
          .font(.title2.weight(.semibold))
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("word-detail.identity-surface")
        Text(entry.reading)
          .font(dynamicTypeSize.isAccessibilitySize ? .body : .callout)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("word-detail.identity-reading")
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(entry.headword), \(entry.reading)")
      .accessibilityIdentifier("word-detail.identity")
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct PronunciationRow: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let entry: DictionaryEntry
  let pronounce: () -> Void

  @ViewBuilder
  var body: some View {
    if dynamicTypeSize.isAccessibilitySize {
      VStack(alignment: .leading, spacing: 12) {
        pitchAccent
        pronounceButton
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    } else {
      HStack(spacing: 16) {
        pitchAccent
        Spacer(minLength: 8)
        pronounceButton
      }
    }
  }

  @ViewBuilder
  private var pitchAccent: some View {
    if let pitch = entry.pitchAccent {
      PitchAccentView(reading: entry.reading, pitch: pitch)
    }
  }

  private var pronounceButton: some View {
    Button(action: pronounce) {
      Group {
        if dynamicTypeSize.isAccessibilitySize {
          Label("Play pronunciation", systemImage: "speaker.wave.2.fill")
            .font(.body)
        } else {
          Label("Play pronunciation", systemImage: "speaker.wave.2.fill")
            .labelStyle(.iconOnly)
            .font(.title2)
        }
      }
      .frame(minWidth: 44, minHeight: 44)
    }
    .buttonStyle(.bordered)
    .accessibilityLabel("Pronounce \(entry.reading)")
    .accessibilityIdentifier("word-detail.pronounce")
  }
}

private struct EncounterMediaRow: View {
  @State private var presentedMedia: EncounterMedia?
  let media: EncounterMedia
  let count: Int
  let encounterMedia: [EncounterMedia]
  let removeEncounterMedia: (String) async -> Void

  var body: some View {
    Button {
      presentedMedia = media
    } label: {
      LabeledContent("Encounter Media") {
        if let image = UIImage(data: media.data) {
          HStack(spacing: 8) {
            Text(count == 1 ? "Saved Image" : "\(count) Images")
            Image(uiImage: image)
              .resizable()
              .scaledToFill()
              .frame(width: 56, height: 44)
              .clipped()
              .clipShape(RoundedRectangle(cornerRadius: 5))
          }
        }
      }
      .frame(maxWidth: .infinity)
      .contentShape(.rect)
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
        ForEach(encounterMedia) { media in
          VStack(spacing: 12) {
            if let image = UIImage(data: media.data) {
              Image(uiImage: image).resizable().scaledToFit()
            }
            Text(media.name).foregroundStyle(.secondary)
            Text("Saved with this word.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
          .padding()
          .tag(media.id)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .automatic))
      .navigationTitle("Encounter Images")
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

extension DictionaryEntry {
  fileprivate var encounterWordReference: EncounterWordReference {
    EncounterWordReference(id: noteID, headword: headword, reading: reading)
  }
}

private struct FrequencyRow: View {
  let result: FrequencyLookupResult
  let showDetails: () -> Void

  var body: some View {
    let presentation = FrequencyPresentationModel(result: result)
    Button(action: showDetails) {
      LabeledContent("Frequency") {
        Text(presentation.inlineText)
          .font(.headline.monospacedDigit())
          .frame(minWidth: 44, minHeight: 44)
      }
      .frame(maxWidth: .infinity)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(presentation.inlineAccessibilityLabel)
    .accessibilityValue(presentation.inlineText)
    .accessibilityIdentifier("word-detail.frequency")
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
        Section("Frequency") {
          if let rankText = presentation.rankText,
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

private struct PitchAccentView: View {
  let reading: String
  let pitch: PitchAccent

  var body: some View {
    HStack(spacing: 8) {
      Text(reading.katakana)
        .font(.body.weight(.medium))
        .padding(.bottom, 4)
        .overlay(alignment: .bottom) {
          PitchContour(downstep: pitch.downstep, moraCount: pitch.moraCount)
            .stroke(
              ZenbuTheme.pitchDownstep,
              style: StrokeStyle(lineWidth: 1.5, lineCap: .round)
            )
            .frame(height: 7)
        }
    }
    .padding(.horizontal, 12)
    .frame(minHeight: 34)
    .background(.fill.tertiary, in: Capsule())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "Pitch accent for \(reading), downstep \(pitch.downstep), \(pitch.moraCount) mora"
    )
    .accessibilityIdentifier("word-detail.pitch")
  }
}

private struct PitchContour: Shape {
  let downstep: Int
  let moraCount: Int

  func path(in rect: CGRect) -> Path {
    var path = Path()
    let count = max(moraCount, 1)
    let drop = downstep == 0 ? count : min(max(downstep, 1), count)
    let dropX = rect.minX + rect.width * CGFloat(drop) / CGFloat(count)
    path.move(to: CGPoint(x: rect.minX, y: rect.minY + 1))
    path.addLine(to: CGPoint(x: dropX, y: rect.minY + 1))
    if downstep > 0 {
      path.addLine(to: CGPoint(x: min(rect.maxX, dropX + 5), y: rect.maxY - 1))
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - 1))
    }
    return path
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

private struct PartOfSpeechRow: View {
  let entry: DictionaryEntry
  let title: String
  let conjugationTable: ConjugationTable?

  var body: some View {
    if let conjugationTable {
      NavigationLink(value: SearchExperienceRoute.conjugations(entry, conjugationTable)) {
        LabeledContent {
          VStack(alignment: .trailing, spacing: 2) {
            Text(title.isEmpty ? "Dictionary entry" : title)
              .multilineTextAlignment(.trailing)
              .fixedSize(horizontal: false, vertical: true)
              .accessibilityIdentifier(entryVerificationIdentifier)
            Text("View Conjugations")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        } label: {
          Text("Part of speech")
        }
        .font(.body)
      }
      .accessibilityIdentifier("word-detail.conjugations")
    } else {
      LabeledContent {
        Text(title.isEmpty ? "Dictionary entry" : title)
          .multilineTextAlignment(.trailing)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier(entryVerificationIdentifier)
      } label: {
        Text("Part of speech")
      }
    }
  }

  private var entryVerificationIdentifier: String {
    "word-detail.entry.\(entry.id.rawValue)"
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
    Text(form.value + (form.labels.isEmpty ? "" : " (\(form.labels.joined(separator: ", ")))"))
      .font(.body)
      .foregroundStyle(form.labels.isEmpty ? Color.primary : Color.secondary)
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
          Text("\(relationship.headword)  \(relationship.reading)")
            .font(.headline)
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
      .accessibilityIdentifier("word-detail.related.\(relationship.headword)")
    }
  }
}

private struct NotesSection: View {
  let notes: [LearnerWordNote]
  let editingNoteID: String?
  @Binding var noteDraft: String
  let editorFocused: FocusState<Bool>.Binding
  let editNote: (LearnerWordNote) -> Void
  let addNote: () -> Void

  var body: some View {
    ForEach(Array(notes.enumerated()), id: \.element.id) { index, note in
      if editingNoteID == note.id {
        noteEditor
      } else {
        Button {
          editNote(note)
        } label: {
          Text(note.text)
            .italic()
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier(index == 0 ? "word-detail.note" : "word-detail.note.\(index)")
      }
    }

    if let editingNoteID, !notes.contains(where: { $0.id == editingNoteID }) {
      noteEditor
    }

    if editingNoteID == nil || !noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      Button("Add Note", systemImage: "square.and.pencil", action: addNote)
        .font(.body)
        .accessibilityIdentifier("word-detail.add-note")
    }
  }

  private var noteEditor: some View {
    TextField("Add Note", text: $noteDraft, axis: .vertical)
      .italic()
      .focused(editorFocused)
      .accessibilityIdentifier("word-note.editor")
  }
}

private struct EntryExamplesSection: View {
  let entry: DictionaryEntry
  let examples: [ExampleSentence]
  let isLoading: Bool
  let speechSynthesisClient: SpeechSynthesisClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    if isLoading {
      ProgressView("Loading examples")
    } else if examples.isEmpty {
      Text("No source-matched examples")
        .foregroundStyle(.secondary)
    } else {
      ForEach(Array(examples.enumerated()), id: \.element.id) { index, example in
        JapaneseExampleRowContent(
          example: example,
          highlightedQuery: SearchQuery(entry.headword),
          highlightedEntry: entry,
          japaneseTextAnalysisClient: japaneseTextAnalysisClient,
          presentation: .wordDetail(index: index),
          speak: { speechSynthesisClient.speak(example.japanese) },
          openWord: openWord
        )
      }
    }
  }
}

extension Character {
  fileprivate var isKanji: Bool {
    unicodeScalars.contains { (0x3400...0x9FFF).contains(Int($0.value)) }
  }
}
