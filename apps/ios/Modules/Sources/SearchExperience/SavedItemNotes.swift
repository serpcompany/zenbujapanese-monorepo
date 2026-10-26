import SwiftUI

@MainActor
@Observable
final class SavedItemNotes: TypedDraft {
  private(set) var notes: [LearnerWordNote] = []
  private(set) var editingNoteID: String?
  var draft = ""
  @ObservationIgnored private var item: SavedItem?
  @ObservationIgnored private var writtenBeforeLoading: [LearnerWordNote] = []
  @ObservationIgnored private var textWhenEditingBegan = ""
  @ObservationIgnored private var saveTask: Task<Void, Never>?
  @ObservationIgnored private var saves = 0
  @ObservationIgnored private let store: WordNoteStore

  init(store: WordNoteStore, drafts: TypedDrafts = .shared) {
    self.store = store
    drafts.hold(self)
  }

  var isEditing: Bool { editingNoteID != nil }

  var listed: [LearnerWordNote] {
    guard let editingNoteID, notes.note(editingNoteID) == nil else { return notes }
    return notes + [LearnerWordNote(id: editingNoteID, text: "")]
  }

  func load(_ item: SavedItem) async {
    let loaded = await store.load(item.id)
    guard !Task.isCancelled else { return }
    let hadLoaded = self.item != nil
    self.item = item
    notes = loaded
    guard hadLoaded else {
      for written in writtenBeforeLoading {
        let note = written.on(item.headword, reading: item.reading)
        notes.apply(note)
        save(note, to: item.id)
      }
      writtenBeforeLoading = []
      return
    }
    editingNoteID = nil
    draft = ""
  }

  func beginEditing(_ note: LearnerWordNote) {
    if let editingNoteID, editingNoteID != note.id { saveDraft(of: editingNoteID) }
    editingNoteID = note.id
    draft = note.text
    textWhenEditingBegan = note.text
  }

  func beginAdding() {
    if let editingNoteID { saveDraft(of: editingNoteID) }
    editingNoteID = UUID().uuidString.lowercased()
    draft = ""
    textWhenEditingBegan = ""
  }

  func finishEditing() {
    guard let editingNoteID else { return }
    saveDraft(of: editingNoteID)
    self.editingNoteID = nil
    draft = ""
  }

  func keepDraft() async {
    let typed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard item != nil, let editingNoteID, !typed.isEmpty else { return }
    saveDraft(of: editingNoteID)
    textWhenEditingBegan = typed
    await saveTask?.value
  }

  private func saveDraft(of editingNoteID: String) {
    let trimmed = { (text: String) in text.trimmingCharacters(in: .whitespacesAndNewlines) }
    guard trimmed(draft) != trimmed(textWhenEditingBegan) else { return }
    let note = LearnerWordNote(
      id: editingNoteID, text: draft, headword: item?.headword, reading: item?.reading)
    notes.apply(note)
    guard let item else {
      writtenBeforeLoading.append(note)
      return
    }
    save(note, to: item.id, startedFrom: textWhenEditingBegan)
  }

  func refresh() async {
    await saveTask?.value
    await reload(after: saves)
  }

  private func reload(after save: Int) async {
    guard let item, save == saves else { return }
    let loaded = await store.load(item.id)
    guard !Task.isCancelled, self.item?.id == item.id, save == saves else { return }
    notes = loaded
  }

  private func save(_ note: LearnerWordNote, to itemID: SavedItemID, startedFrom: String? = nil) {
    let store = store
    let precedingSave = saveTask
    saves += 1
    let save = saves
    saveTask = Task {
      await precedingSave?.value
      await store.save(note, itemID, startedFrom)
      await reload(after: save)
    }
  }
}

struct SavedItemNotesSection: View {
  @Bindable var notes: SavedItemNotes
  let editorFocused: FocusState<Bool>.Binding
  let identifierPrefix: String

  var body: some View {
    ForEach(Array(notes.listed.enumerated()), id: \.element.id) { index, note in
      if notes.editingNoteID == note.id {
        noteEditor
      } else {
        Button {
          notes.beginEditing(note)
        } label: {
          Text(note.text)
            .italic()
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier(
          index == 0 ? "\(identifierPrefix).note" : "\(identifierPrefix).note.\(index)")
      }
    }

    if !notes.isEditing || !notes.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      Button("Add Note", systemImage: "square.and.pencil", action: notes.beginAdding)
        .font(.body)
        .accessibilityIdentifier("\(identifierPrefix).add-note")
    }
  }

  private var noteEditor: some View {
    TextField("Add Note", text: $notes.draft, axis: .vertical)
      .italic()
      .focused(editorFocused)
      .focusedOnceTheClickIsHandled(editorFocused)
      .accessibilityIdentifier("word-note.editor")
  }
}
