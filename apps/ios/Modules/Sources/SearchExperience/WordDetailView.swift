import SwiftUI
import UIKit

struct WordDetailView: View {
  @Environment(\.dismiss) private var dismiss
  @FocusState private var noteEditorFocused: Bool
  @State private var editingNoteID: String?
  @State private var noteDraft = ""
  @State private var notes: [LearnerWordNote] = []
  @State private var noteSaveTask: Task<Void, Never>?
  @State private var examples: [ExampleSentence] = []
  @State private var isLoadingExamples = true
  @State private var lastSpeechRequest: String?
  @State private var encounterMedia: [EncounterMedia] = []
  @State private var showsEncounterMediaPicker = false
  @State private var encounterMediaImportFailed = false

  let entry: DictionaryEntry
  let backTitle: String
  let initialImageAttachment: WordImageAttachment?
  let speechSynthesisClient: SpeechSynthesisClient
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let wordNoteStore: WordNoteStore
  let encounterMediaStore: EncounterMediaStore
  let conjugationTable: ConjugationTable?
  let openRelated: (DictionaryRelationship) -> Void
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void
  let openWord: (DictionaryEntry) -> Void
  let openConjugations: (ConjugationTable) -> Void

  var body: some View {
    VStack(spacing: 0) {
      DetailToolbar(
        backTitle: backTitle,
        isEditingNote: editingNoteID != nil,
        goBack: goBack,
        finishEditingNote: finishEditingNote,
        addNote: beginAddingNote,
        addEncounterMedia: { showsEncounterMediaPicker = true }
      )

      ScrollViewReader { proxy in
        ScrollView {
          VStack(spacing: 0) {
            WordHeader(
              entry: entry,
              encounterMedia: encounterMedia,
              pronounce: { speechSynthesisClient.speak(entry.reading) },
              removeEncounterMedia: removeEncounterMedia
            )
            PartOfSpeechRow(
              title: (entry.senses.first?.partsOfSpeech ?? entry.partsOfSpeech)
                .map(\.rawValue)
                .joined(separator: " · "),
              conjugationTable: conjugationTable,
              openConjugations: openConjugations
            )

            if !entry.alternativeForms.isEmpty {
              SectionLabel("ALTERNATIVES")
              AlternativeFormsSection(forms: entry.alternativeForms, openKanji: openKanji)
            }

            SectionLabel("MEANING")
            MeaningSection(senses: entry.senses)

            if !entry.primaryKanji.isEmpty {
              SectionLabel("KANJI")
              PrimaryKanjiSection(
                characters: entry.primaryKanji, entry: entry, openKanji: openKanji)
            }

            if !entry.alternativeKanji.isEmpty {
              SectionLabel("ALTERNATIVE KANJI")
              AlternativeKanjiSection(characters: entry.alternativeKanji, openKanji: openKanji)
            }

            if !entry.relationships.isEmpty {
              SectionLabel("RELATED WORDS")
              RelationshipsSection(relationships: entry.relationships, openRelated: openRelated)
            }

            SectionLabel("NOTES")
            NotesSection(
              notes: notes,
              editingNoteID: editingNoteID,
              noteDraft: $noteDraft,
              editorFocused: $noteEditorFocused,
              editNote: beginEditingNote,
              addNote: beginAddingNote
            )
            .id("word-note.section")

            SectionLabel("EXAMPLES")
            EntryExamplesSection(
              entry: entry,
              examples: examples,
              isLoading: isLoadingExamples,
              speechSynthesisClient: speechSynthesisClient,
              japaneseTextAnalysisClient: japaneseTextAnalysisClient,
              openWord: openWord
            )
          }
          .padding(.bottom, SearchExperienceLayout.bottomNavigationContentClearance)
        }
        .background(ZenbuTheme.background)
        .scrollIndicators(.hidden)
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
    }
    .background(ZenbuTheme.background)
    .toolbar(.hidden, for: .navigationBar)
    .sheet(isPresented: $showsEncounterMediaPicker) {
      ImagePhotoLibraryPicker { result in
        showsEncounterMediaPicker = false
        handleEncounterMediaSelection(result)
      }
    }
    .alert("Unable to Save Image", isPresented: $encounterMediaImportFailed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("The selected image could not be read.")
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
    .task(id: entry.id) {
      isLoadingExamples = true
      encounterMedia = []
      let word = entry.encounterWordReference
      if let initialImageAttachment {
        await encounterMediaStore.save(initialImageAttachment, word)
      }
      let storedMedia = await encounterMediaStore.encounters(word)
      guard !Task.isCancelled else { return }
      encounterMedia = storedMedia
      examples = (try? await exampleSentenceClient.examples(entry)) ?? []
      notes = await wordNoteStore.load(entry.noteID)
      editingNoteID = nil
      noteDraft = ""
      isLoadingExamples = false
    }
  }

  private func removeEncounterMedia(_ mediaID: String) {
    Task { @MainActor in
      let word = entry.encounterWordReference
      await encounterMediaStore.remove(word, mediaID)
      encounterMedia = await encounterMediaStore.encounters(word)
    }
  }

  private func handleEncounterMediaSelection(_ result: Result<[ImageTextAsset], Error>) {
    guard case .success(let assets) = result else {
      encounterMediaImportFailed = true
      return
    }
    guard let asset = assets.first else { return }
    Task { @MainActor in
      let word = entry.encounterWordReference
      await encounterMediaStore.save(
        WordImageAttachment(name: asset.name, data: asset.data), word)
      encounterMedia = await encounterMediaStore.encounters(word)
    }
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

  private func goBack() {
    if editingNoteID == nil {
      let pendingSave = noteSaveTask
      Task { @MainActor in
        await pendingSave?.value
        dismiss()
      }
      return
    }
    let updatedNotes = applyingDraft()
    let save = scheduleNoteSave(updatedNotes)
    Task { @MainActor in
      await save.value
      dismiss()
    }
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

private struct PrimaryKanjiSection: View {
  let characters: [String]
  let entry: DictionaryEntry
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    VStack(spacing: 0) {
      ForEach(characters, id: \.self) { character in
        if let kanji = KanjiCharacter(character) {
          Button {
            openKanji(kanji, entry)
          } label: {
            HStack {
              Text(character)
                .font(.title2.weight(.semibold))
              Text("Kanji in \(entry.headword)")
                .font(.subheadline)
                .foregroundStyle(ZenbuTheme.secondaryText)
              Spacer()
              Image(systemName: "chevron.right").foregroundStyle(
                ZenbuTheme.secondaryText
              )
              .accessibilityHidden(true)
            }
            .padding(.horizontal, 28)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("\(character), Kanji in \(entry.headword)")
          .accessibilityIdentifier("word-detail.kanji.\(character)")
        }
      }
    }
    .background(ZenbuTheme.row)
  }
}

private struct AlternativeKanjiSection: View {
  let characters: [String]
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    VStack(spacing: 0) {
      ForEach(characters, id: \.self) { character in
        if let kanji = KanjiCharacter(character) {
          Button {
            openKanji(kanji, nil)
          } label: {
            HStack {
              Text(character)
                .font(.title2.weight(.semibold))
              Spacer()
              Image(systemName: "chevron.right")
                .foregroundStyle(ZenbuTheme.secondaryText)
                .accessibilityHidden(true)
            }
            .padding(.horizontal, 28)
            .frame(minHeight: 50)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Alternative kanji \(character)")
          .accessibilityIdentifier("word-detail.alternative-kanji.\(character)")
        }
      }
    }
    .background(ZenbuTheme.row)
  }
}

private struct DetailToolbar: View {
  let backTitle: String
  let isEditingNote: Bool
  let goBack: () -> Void
  let finishEditingNote: () -> Void
  let addNote: () -> Void
  let addEncounterMedia: () -> Void

  var body: some View {
    HStack(spacing: 20) {
      Button(action: goBack) {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left")
          Text(backTitle)
        }
        .font(.body)
      }
      .buttonStyle(.plain)
      .frame(minHeight: 44)
      .accessibilityIdentifier("word-detail.back")
      Spacer()
      if isEditingNote {
        Button("Done", action: finishEditingNote)
          .buttonStyle(.plain)
          .font(.body.weight(.semibold))
          .frame(minWidth: 44, minHeight: 44)
          .accessibilityIdentifier("word-note.done")
      } else {
        Button(action: addNote) {
          Image(systemName: "square.and.pencil")
        }
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityLabel("Add note")
        .accessibilityIdentifier("word-detail.toolbar-note")
        Button(action: addEncounterMedia) {
          Image(systemName: "camera.badge.ellipsis")
        }
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityLabel("Add encounter image")
        .accessibilityIdentifier("word-detail.toolbar-image")
      }
    }
    .font(.title3)
    .foregroundStyle(ZenbuTheme.primaryForeground)
    .padding(.horizontal, 16)
    .frame(minHeight: 49)
    .background(ZenbuTheme.chrome.ignoresSafeArea(edges: .top))
  }
}

private struct WordHeader: View {
  let entry: DictionaryEntry
  let encounterMedia: [EncounterMedia]
  let pronounce: () -> Void
  let removeEncounterMedia: (String) -> Void
  @State private var showsAttachment = false
  @State private var selectedMediaID: String?

  var body: some View {
    VStack(spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        JapaneseRubyText(
          surface: entry.headword,
          reading: entry.reading,
          baseFont: .largeTitle.weight(.light),
          rubyFont: .title3.weight(.semibold)
        )
        Spacer()
        if let latest = encounterMedia.first, let image = UIImage(data: latest.data) {
          Button {
            selectedMediaID = latest.id
            showsAttachment = true
          } label: {
            VStack(spacing: 3) {
              Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 66, height: 52)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 5))
              Text(encounterMedia.count == 1 ? "Saved Image" : "\(encounterMedia.count) Images")
                .font(.caption2)
            }
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Saved encounter images, \(encounterMedia.count)")
          .accessibilityIdentifier("word-detail.image-attachment")
        } else {
          FrequencyBadge(frequency: entry.frequency)
        }
      }

      HStack(spacing: 18) {
        if let pitch = entry.pitchAccent {
          PitchAccentView(reading: entry.reading, pitch: pitch)
        }
        Spacer()
        Button(action: pronounce) {
          Label("Pronounce \(entry.reading)", systemImage: "speaker.wave.2.fill")
            .labelStyle(.iconOnly)
            .font(.title2)
            .frame(minWidth: 46, minHeight: 44)
            .background(ZenbuTheme.accent, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Pronounce \(entry.reading)")
        .accessibilityIdentifier("word-detail.pronounce")
      }
    }
    .padding(.horizontal, 28)
    .padding(.top, 6)
    .padding(.bottom, 9)
    .background(ZenbuTheme.row)
    .sheet(isPresented: $showsAttachment) {
      NavigationStack {
        TabView(selection: $selectedMediaID) {
          ForEach(encounterMedia) { media in
            VStack(spacing: 12) {
              if let image = UIImage(data: media.data) {
                Image(uiImage: image).resizable().scaledToFit()
              }
              Text(media.name).foregroundStyle(ZenbuTheme.secondaryText)
              Text("Saved with this word.")
                .font(.footnote)
                .foregroundStyle(ZenbuTheme.secondaryText)
            }
            .padding()
            .tag(Optional(media.id))
          }
        }
        .tabViewStyle(.page(indexDisplayMode: .automatic))
        .navigationTitle("Encounter Images")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Done") { showsAttachment = false }
              .accessibilityIdentifier("word-detail.image-attachment-done")
          }
          ToolbarItem(placement: .destructiveAction) {
            Button("Remove from Word", role: .destructive) {
              guard let selectedMediaID else { return }
              removeEncounterMedia(selectedMediaID)
              self.selectedMediaID = encounterMedia.first(where: { $0.id != selectedMediaID })?.id
              if encounterMedia.count <= 1 { showsAttachment = false }
            }
            .accessibilityIdentifier("word-detail.image-attachment-remove")
          }
        }
      }
    }
  }
}

extension DictionaryEntry {
  fileprivate var encounterWordReference: EncounterWordReference {
    EncounterWordReference(id: noteID, headword: headword, reading: reading)
  }
}

private struct FrequencyBadge: View {
  @ScaledMetric(relativeTo: .body) private var badgeSize = 66.0
  let frequency: DictionaryEntry.Frequency

  var body: some View {
    ZStack {
      Circle().stroke(ZenbuTheme.mutedForeground.opacity(0.18), lineWidth: 6)
      Text(frequency.rawValue)
        .font(.body.bold())
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(2)
    }
    .frame(width: badgeSize, height: badgeSize)
    .padding(.top, 3)
  }
}

private struct PitchAccentView: View {
  let reading: String
  let pitch: PitchAccent

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "ear.badge.waveform")
      Text(reading.katakana)
        .font(.body.weight(.medium))
        .padding(.bottom, 4)
        .overlay(alignment: .bottom) {
          PitchContour(downstep: pitch.downstep, moraCount: pitch.moraCount)
            .stroke(ZenbuTheme.destructive, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            .frame(height: 7)
        }
    }
    .padding(.horizontal, 12)
    .frame(minHeight: 34)
    .background(ZenbuTheme.accent, in: Capsule())
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
  let title: String
  let conjugationTable: ConjugationTable?
  let openConjugations: (ConjugationTable) -> Void

  var body: some View {
    if let conjugationTable {
      Button {
        openConjugations(conjugationTable)
      } label: {
        HStack {
          Text(title.isEmpty ? "Dictionary entry" : title)
          Spacer()
          Text("View Conjugations")
            .foregroundStyle(ZenbuTheme.secondaryText)
          Image(systemName: "chevron.right")
            .foregroundStyle(ZenbuTheme.secondaryText)
            .accessibilityHidden(true)
        }
        .font(.body)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("word-detail.conjugations")
      .rowChrome
    } else {
      Text(title.isEmpty ? "Dictionary entry" : title)
        .font(.headline)
        .frame(maxWidth: .infinity, alignment: .leading)
        .rowChrome
    }
  }
}

extension View {
  fileprivate var rowChrome: some View {
    padding(.horizontal, 28)
      .padding(.vertical, 11)
      .background(ZenbuTheme.row)
      .overlay(alignment: .top) { Rectangle().fill(ZenbuTheme.divider).frame(height: 0.5) }
  }
}

private struct SectionLabel: View {
  let title: String
  init(_ title: String) { self.title = title }

  var body: some View {
    Text(title)
      .font(.footnote.weight(.medium))
      .foregroundStyle(ZenbuTheme.secondaryText)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 28)
      .frame(minHeight: 45, alignment: .bottom)
      .padding(.bottom, 8)
      .background(ZenbuTheme.background)
  }
}

private struct MeaningSection: View {
  let senses: [DictionarySense]

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      ForEach(Array(senses.enumerated()), id: \.offset) { index, sense in
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(index + 1).")
            Text(sense.meaning)
          }
          .font(.body.weight(.semibold))
          if !sense.notes.isEmpty {
            Text(sense.notes.joined(separator: " · "))
              .font(.footnote)
              .foregroundStyle(ZenbuTheme.secondaryText)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 32)
    .padding(.vertical, 15)
    .background(ZenbuTheme.row)
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
    .padding(.horizontal, 28)
    .padding(.vertical, 9)
    .background(ZenbuTheme.row)
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
      .foregroundStyle(form.labels.isEmpty ? ZenbuTheme.foreground : ZenbuTheme.secondaryText)
  }
}

private struct RelationshipsSection: View {
  let relationships: [DictionaryRelationship]
  let openRelated: (DictionaryRelationship) -> Void

  var body: some View {
    VStack(spacing: 0) {
      ForEach(relationships, id: \.self) { relationship in
        Button {
          openRelated(relationship)
        } label: {
          HStack {
            VStack(alignment: .leading, spacing: 3) {
              Text("\(relationship.headword)  \(relationship.reading)")
                .font(.headline)
              Text("\(relationship.relation) · \(relationship.summary)")
                .font(.footnote)
                .foregroundStyle(ZenbuTheme.secondaryText)
                .lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(
              ZenbuTheme.secondaryText
            )
            .accessibilityHidden(true)
          }
          .padding(.horizontal, 28)
          .padding(.vertical, 11)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("word-detail.related.\(relationship.headword)")
      }
    }
    .background(ZenbuTheme.row)
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
    VStack(alignment: .leading, spacing: 0) {
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
              .padding(.horizontal, 28)
              .padding(.vertical, 11)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier(index == 0 ? "word-detail.note" : "word-detail.note.\(index)")
        }
      }

      if let editingNoteID, !notes.contains(where: { $0.id == editingNoteID }) {
        noteEditor
      }

      if editingNoteID == nil || !noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        Button("Add Note", action: addNote)
          .buttonStyle(.plain)
          .italic()
          .foregroundStyle(ZenbuTheme.secondaryText)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 28)
          .padding(.vertical, 11)
          .accessibilityIdentifier("word-detail.add-note")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(ZenbuTheme.row)
  }

  private var noteEditor: some View {
    TextField("Add Note", text: $noteDraft, axis: .vertical)
      .italic()
      .focused(editorFocused)
      .padding(.horizontal, 28)
      .padding(.vertical, 11)
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
    VStack(alignment: .leading, spacing: 18) {
      if isLoading {
        ProgressView("Loading examples")
      } else if examples.isEmpty {
        Text("No source-matched examples")
          .foregroundStyle(ZenbuTheme.secondaryText)
      } else {
        ForEach(Array(examples.enumerated()), id: \.element.id) { index, example in
          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 10) {
              LinkedJapaneseText(
                text: example.japanese,
                highlightedQuery: SearchQuery(entry.headword),
                highlightedEntry: entry,
                japaneseTextAnalysisClient: japaneseTextAnalysisClient,
                identifierPrefix: "word-detail.example-token.\(index)",
                openWord: openWord
              )
              .frame(maxWidth: .infinity, alignment: .leading)

              Button {
                speechSynthesisClient.speak(example.japanese)
              } label: {
                Image(systemName: "speaker.wave.2")
                  .frame(width: 44, height: 44)
              }
              .accessibilityLabel("Speak Word Detail example \(index + 1)")
              .accessibilityIdentifier("word-detail.example-speaker.\(index)")
            }
            Text(example.english)
              .font(.subheadline)
              .foregroundStyle(ZenbuTheme.secondaryText)
              .accessibilityHidden(true)
          }
          .accessibilityElement(children: .contain)
          .accessibilityLabel("\(example.japanese), \(example.english)")
          .accessibilityIdentifier("word-detail.example.\(index)")
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 28)
    .padding(.vertical, 20)
    .background(ZenbuTheme.row)
  }
}

extension Character {
  fileprivate var isKanji: Bool {
    unicodeScalars.contains { (0x3400...0x9FFF).contains(Int($0.value)) }
  }
}
