import SwiftUI
import UIKit

struct ImageWordAttachment {
  let name: String
  let data: Data
}

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

  let entry: DictionaryEntry
  let backTitle: String
  let imageAttachment: ImageWordAttachment?
  let speechSynthesisClient: SpeechSynthesisClient
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let wordNoteStore: WordNoteStore
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
        finishEditingNote: finishEditingNote
      )

      ScrollViewReader { proxy in
        ScrollView {
          VStack(spacing: 0) {
          WordHeader(
            entry: entry,
            imageAttachment: imageAttachment,
            pronounce: { speechSynthesisClient.speak(entry.reading) }
          )
          PartOfSpeechRow(
            title: (entry.senses.first?.partsOfSpeech ?? entry.partsOfSpeech)
              .map(\.rawValue)
              .joined(separator: " · "),
            conjugationTable: conjugationTable,
            openConjugations: openConjugations
          )
          SectionLabel("MEANING")
          MeaningSection(senses: entry.senses)

          if !entry.primaryKanji.isEmpty {
            SectionLabel("KANJI")
            PrimaryKanjiSection(characters: entry.primaryKanji, entry: entry, openKanji: openKanji)
          }

          if !entry.alternativeForms.isEmpty {
            SectionLabel("ALTERNATIVES")
            AlternativeFormsSection(forms: entry.alternativeForms, openKanji: openKanji)
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
        }
        .background(.black)
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
    .background(.black)
    .toolbar(.hidden, for: .navigationBar)
    .overlay(alignment: .topLeading) {
      if let lastSpeechRequest {
        Color.clear
          .frame(width: 1, height: 1)
          .accessibilityElement()
          .accessibilityLabel("Speech requested \(lastSpeechRequest)")
          .accessibilityIdentifier("speech.request")
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .speechSynthesisRequested)) { notification in
      lastSpeechRequest = notification.object as? String
    }
    .task(id: entry.id) {
      isLoadingExamples = true
      examples = (try? await exampleSentenceClient.examples(entry)) ?? []
      notes = await wordNoteStore.load(entry.noteID)
      editingNoteID = nil
      noteDraft = ""
      isLoadingExamples = false
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
          Button { openKanji(kanji, entry) } label: {
          HStack {
            Text(character)
              .font(.system(size: 25, weight: .semibold))
            Text("Kanji in \(entry.headword)")
              .font(.system(size: 15))
              .foregroundStyle(ReplicaPalette.secondaryText)
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.38))
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
    .background(ReplicaPalette.row)
  }
}

private struct DetailToolbar: View {
  let backTitle: String
  let isEditingNote: Bool
  let goBack: () -> Void
  let finishEditingNote: () -> Void

  var body: some View {
    HStack(spacing: 20) {
      Button(action: goBack) {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left")
          Text(backTitle)
        }
        .font(.system(size: 17))
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("word-detail.back")
      Spacer()
      if isEditingNote {
        Button("Done", action: finishEditingNote)
          .buttonStyle(.plain)
          .font(.system(size: 17, weight: .semibold))
          .accessibilityIdentifier("word-note.done")
      }
    }
    .font(.system(size: 23))
    .padding(.horizontal, 16)
    .frame(height: 49)
    .background(ReplicaPalette.chrome.ignoresSafeArea(edges: .top))
  }
}

private struct WordHeader: View {
  let entry: DictionaryEntry
  let imageAttachment: ImageWordAttachment?
  let pronounce: () -> Void
  @State private var showsAttachment = false

  var body: some View {
    VStack(spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: -4) {
          Text(entry.reading)
            .font(.system(size: 19, weight: .semibold))
          Text(entry.headword)
            .font(.system(size: 37, weight: .light))
        }
        Spacer()
        if let imageAttachment, let image = UIImage(data: imageAttachment.data) {
          Button { showsAttachment = true } label: {
            VStack(spacing: 3) {
              Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 66, height: 52)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 5))
              Text("Attach Photo")
                .font(.caption2)
            }
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Image attachment (imageAttachment.name), Attach Photo")
          .accessibilityIdentifier("word-detail.image-attachment")
        } else {
          FrequencyBadge(frequency: entry.frequency)
        }
      }

      HStack(spacing: 18) {
        if let pitch = entry.pitchAccent {
          PitchAccentView(pitch: pitch)
        }
        Spacer()
        Button(action: pronounce) {
          Label("Pronounce \(entry.reading)", systemImage: "speaker.wave.2.fill")
            .labelStyle(.iconOnly)
            .font(.system(size: 22))
            .frame(width: 46, height: 38)
            .background(.white.opacity(0.08), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Pronounce \(entry.reading)")
        .accessibilityIdentifier("word-detail.pronounce")
      }
    }
    .padding(.horizontal, 28)
    .padding(.top, 8)
    .padding(.bottom, 12)
    .background(ReplicaPalette.row)
    .sheet(isPresented: $showsAttachment) {
      if let imageAttachment, let image = UIImage(data: imageAttachment.data) {
        VStack(spacing: 16) {
          HStack {
            Spacer()
            Button("Done") { showsAttachment = false }
              .accessibilityIdentifier("word-detail.image-attachment-done")
          }
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
          Text(imageAttachment.name)
            .foregroundStyle(ReplicaPalette.secondaryText)
        }
        .padding()
        .background(.black)
      }
    }
  }
}

private struct FrequencyBadge: View {
  let frequency: DictionaryEntry.Frequency

  var body: some View {
    ZStack {
      Circle().stroke(.white.opacity(0.18), lineWidth: 6)
      Text(frequency.rawValue)
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(2)
    }
    .frame(width: 66, height: 66)
    .padding(.top, 3)
  }
}

private struct PitchAccentView: View {
  let pitch: PitchAccent

  var body: some View {
    HStack(spacing: 7) {
      Image(systemName: "waveform.path")
      Text(pitch.downstep == 0 ? "Flat" : "Downstep \(pitch.downstep)")
      Text("· \(pitch.moraCount) mora")
        .foregroundStyle(.white.opacity(0.55))
    }
    .font(.system(size: 14, weight: .medium))
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Pitch accent, downstep \(pitch.downstep), \(pitch.moraCount) mora")
    .accessibilityIdentifier("word-detail.pitch")
  }
}

private struct PartOfSpeechRow: View {
  let title: String
  let conjugationTable: ConjugationTable?
  let openConjugations: (ConjugationTable) -> Void

  var body: some View {
    if let conjugationTable {
      Button { openConjugations(conjugationTable) } label: {
        HStack {
          Text(title.isEmpty ? "Dictionary entry" : title)
          Spacer()
          Text("View Conjugations")
            .foregroundStyle(ReplicaPalette.secondaryText)
          Image(systemName: "chevron.right")
            .foregroundStyle(.white.opacity(0.38))
        }
        .font(.system(size: 18))
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("word-detail.conjugations")
      .rowChrome
    } else {
      Text(title.isEmpty ? "Dictionary entry" : title)
        .font(.system(size: 18))
        .frame(maxWidth: .infinity, alignment: .leading)
        .rowChrome
    }
  }
}

private extension View {
  var rowChrome: some View {
    padding(.horizontal, 28)
      .padding(.vertical, 13)
      .background(ReplicaPalette.row)
      .overlay(alignment: .top) { Rectangle().fill(ReplicaPalette.divider).frame(height: 0.5) }
  }
}

private struct SectionLabel: View {
  let title: String
  init(_ title: String) { self.title = title }

  var body: some View {
    Text(title)
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(.white.opacity(0.48))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 28)
      .frame(height: 45, alignment: .bottom)
      .padding(.bottom, 8)
      .background(.black)
  }
}

private struct MeaningSection: View {
  let senses: [DictionarySense]

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      ForEach(Array(senses.enumerated()), id: \.offset) { index, sense in
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(index + 1).")
            Text(sense.meaning)
          }
          .font(.system(size: 17, weight: .semibold))
          if !sense.notes.isEmpty {
            Text(sense.notes.joined(separator: " · "))
              .font(.system(size: 14))
              .foregroundStyle(ReplicaPalette.secondaryText)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 32)
    .padding(.vertical, 20)
    .background(ReplicaPalette.row)
  }
}

private struct AlternativeFormsSection: View {
  let forms: [DictionaryForm]
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    VStack(spacing: 0) {
      ForEach(forms, id: \.value) { form in
        if let character = form.value.first(where: { $0.isKanji }) {
          if let kanji = KanjiCharacter(String(character)) {
            Button {
              openKanji(kanji, nil)
            } label: {
            AlternativeFormRow(form: form, showsDisclosure: true)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("word-detail.alternative.\(form.value)")
          }
        } else {
          AlternativeFormRow(form: form, showsDisclosure: false)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("word-detail.alternative.\(form.value)")
        }
      }
    }
    .background(ReplicaPalette.row)
  }
}

private struct AlternativeFormRow: View {
  let form: DictionaryForm
  let showsDisclosure: Bool

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 3) {
        Text(form.value).font(.system(size: 20, weight: .semibold))
        if !form.labels.isEmpty {
          Text(form.labels.joined(separator: " · "))
            .font(.system(size: 13))
            .foregroundStyle(ReplicaPalette.secondaryText)
        }
      }
      Spacer()
      if showsDisclosure {
        Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.38))
      }
    }
    .padding(.horizontal, 28)
    .frame(minHeight: 56)
    .contentShape(Rectangle())
  }
}

private struct RelationshipsSection: View {
  let relationships: [DictionaryRelationship]
  let openRelated: (DictionaryRelationship) -> Void

  var body: some View {
    VStack(spacing: 0) {
      ForEach(relationships, id: \.self) { relationship in
        Button { openRelated(relationship) } label: {
          HStack {
            VStack(alignment: .leading, spacing: 3) {
              Text("\(relationship.headword)  \(relationship.reading)")
                .font(.system(size: 18, weight: .semibold))
              Text("\(relationship.relation) · \(relationship.summary)")
                .font(.system(size: 13))
                .foregroundStyle(ReplicaPalette.secondaryText)
                .lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.38))
          }
          .padding(.horizontal, 28)
          .padding(.vertical, 11)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("word-detail.related.\(relationship.headword)")
      }
    }
    .background(ReplicaPalette.row)
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
          Button { editNote(note) } label: {
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

      if editingNoteID == nil || !noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Button("Add Note", action: addNote)
          .buttonStyle(.plain)
          .italic()
          .foregroundStyle(ReplicaPalette.secondaryText)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 28)
          .padding(.vertical, 11)
          .accessibilityIdentifier("word-detail.add-note")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(ReplicaPalette.row)
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
          .foregroundStyle(ReplicaPalette.secondaryText)
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

              Button { speechSynthesisClient.speak(example.japanese) } label: {
                Image(systemName: "speaker.wave.2")
                  .frame(width: 34, height: 34)
              }
              .accessibilityLabel("Speak Word Detail example \(index + 1)")
              .accessibilityIdentifier("word-detail.example-speaker.\(index)")
            }
            Text(example.english)
              .font(.system(size: 15))
              .foregroundStyle(ReplicaPalette.secondaryText)
            Text("Tatoeba sentence \(example.sourceProvenance.sourceRecordID)")
              .font(.system(size: 11))
              .foregroundStyle(.white.opacity(0.38))
          }
          .accessibilityElement(children: .contain)
          .accessibilityIdentifier("word-detail.example.\(index)")
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 28)
    .padding(.vertical, 20)
    .background(ReplicaPalette.row)
  }
}

private extension Character {
  var isKanji: Bool {
    unicodeScalars.contains { (0x3400...0x9FFF).contains(Int($0.value)) }
  }
}
