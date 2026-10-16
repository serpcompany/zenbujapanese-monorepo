import Observation
import SwiftUI

@MainActor
@Observable
final class NotesWithoutAWord {
  static let shared: NotesWithoutAWord = {
    let shared = NotesWithoutAWord(store: .live)
    Task { await shared.reload() }
    return shared
  }()

  private(set) var notes: [NoteWithoutAWord] = []
  @ObservationIgnored private let store: WordNoteStore
  @ObservationIgnored private var latestRead = 0

  init(store: WordNoteStore) {
    self.store = store
  }

  func reload() async {
    latestRead += 1
    let read = latestRead
    let found = await store.withoutAWord()
    if read == latestRead { notes = found }
  }

  func delete(_ saved: NoteWithoutAWord) async {
    await store.save(LearnerWordNote(id: saved.note.id, text: ""), saved.key)
    await reload()
  }
}

struct NotesWithoutAWordView: View {
  @Environment(NotesWithoutAWord.self) private var saved

  var body: some View {
    Group {
      if saved.notes.isEmpty {
        ContentUnavailableView(
          "No Notes Without a Word",
          systemImage: "note.text",
          description: Text("Every note you saved is on its word.")
        )
        .accessibilityIdentifier("notes-without-a-word.empty")
      } else {
        List {
          Section {
            ForEach(saved.notes) { note in
              VStack(alignment: .leading, spacing: 4) {
                Text(note.note.text)
                  .italic()
                  .fixedSize(horizontal: false, vertical: true)
                Text(note.word)
                  .font(.footnote)
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
                  .truncationMode(.middle)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .accessibilityElement(children: .combine)
              .accessibilityIdentifier("notes-without-a-word.note.\(note.note.id)")
                .rowActions(allowsFullSwipe: false) {
                  Button("Delete", role: .destructive) {
                    Task { await saved.delete(note) }
                  }
                  Button("Copy", systemImage: "doc.on.doc") {
                    Pasteboard.copy(note.note.text)
                  }
                }
            }
          } footer: {
            Text(
              "These notes were saved for words or kanji this dictionary doesn’t have, so they can’t be shown on a page. Copy a note to add it to another word, or delete it."
            )
          }
        }
        .accessibilityIdentifier("notes-without-a-word.list")
      }
    }
    .navigationTitle("Notes Without a Word")
    .inlineNavigationTitle()
  }
}
