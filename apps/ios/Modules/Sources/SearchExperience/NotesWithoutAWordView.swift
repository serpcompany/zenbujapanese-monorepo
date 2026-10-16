import SwiftUI

struct NotesWithoutAWordView: View {
  @State private var notes: [NoteWithoutAWord]?
  let store: WordNoteStore

  var body: some View {
    Group {
      if let notes, notes.isEmpty {
        ContentUnavailableView(
          "No Notes Without a Word",
          systemImage: "note.text",
          description: Text("Every note you saved is on its word.")
        )
        .accessibilityIdentifier("notes-without-a-word.empty")
      } else {
        List {
          Section {
            ForEach(notes ?? []) { saved in
              Text(saved.note.text)
                .italic()
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
                .accessibilityIdentifier("notes-without-a-word.note.\(saved.note.id)")
                .rowActions {
                  Button("Delete", role: .destructive) {
                    delete(saved)
                  }
                }
            }
          } footer: {
            Text(
              "An earlier version of Zenbu saved these notes for words this dictionary doesn’t have, so they can’t be shown on a word. Copy a note to add it to another word, or delete it."
            )
          }
        }
        .accessibilityIdentifier("notes-without-a-word.list")
      }
    }
    .navigationTitle("Notes Without a Word")
    .inlineNavigationTitle()
    .task { notes = await store.withoutAWord() }
  }

  private func delete(_ saved: NoteWithoutAWord) {
    Task { @MainActor in
      await store.save(LearnerWordNote(id: saved.note.id, text: ""), saved.key)
      notes = await store.withoutAWord()
    }
  }
}
