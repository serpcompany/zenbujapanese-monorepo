import Foundation
import Testing
import os

@testable import SearchExperience

@MainActor
@Suite("What's being typed as Zenbu leaves the screen", .timeLimit(.minutes(1)))
struct TypedDraftsTests {
  private struct NotesPage {
    let page: SavedItemNotes
    let storage: WordNoteStorage
    let saves: OSAllocatedUnfairLock<Int>

    var saved: Int { saves.withLock { $0 } }

    func texts() async -> [String] {
      await storage.load(SavedWords.taberu).map(\.text)
    }
  }

  private func notesPage(holding notes: [String] = [], in drafts: TypedDrafts) async -> NotesPage {
    let storage = WordNoteStorage(defaults: MemoryDefaults().opened(), placing: SavedWords.lookup)
    for (index, text) in notes.enumerated() {
      await storage.save(LearnerWordNote(id: "\(index + 1)", text: text), for: SavedWords.taberu)
    }
    let saves = OSAllocatedUnfairLock(initialState: 0)
    let store = WordNoteStore(
      load: { await storage.load($0) },
      save: { note, id, startedFrom in
        await storage.save(note, for: id, startedFrom: startedFrom)
        saves.withLock { $0 += 1 }
      })
    let page = SavedItemNotes(store: store, drafts: drafts)
    await page.load(SavedWords.taberuItem)
    return NotesPage(page: page, storage: storage, saves: saves)
  }

  @Test("a note being typed is saved as Zenbu goes inactive, once, and its page goes on editing it")
  func keepsANoteBeingTyped() async {
    let drafts = TypedDrafts()
    let notes = await notesPage(in: drafts)
    notes.page.beginAdding()
    notes.page.draft = "書きかけ"
    notes.page.draft = "書きかけのメモ"
    #expect(notes.saved == 0)

    await drafts.sceneChanged(to: .inactive)
    #expect(await notes.texts() == ["書きかけのメモ"])
    #expect(notes.page.isEditing)
    #expect(notes.page.draft == "書きかけのメモ")
    await drafts.sceneChanged(to: .background)
    #expect(notes.saved == 1)

    notes.page.draft = "書きかけのメモの続き"
    notes.page.finishEditing()
    await notes.page.refresh()
    #expect(await notes.texts() == ["書きかけのメモの続き"])
    #expect(notes.saved == 2)
  }

  @Test("a note being changed is saved in place as Zenbu leaves, and one emptied waits for Done")
  func keepsANoteBeingChanged() async throws {
    let drafts = TypedDrafts()
    let notes = await notesPage(holding: ["毎日食べる"], in: drafts)
    let note = try #require(notes.page.notes.first)
    notes.page.beginEditing(note)
    notes.page.draft = "よく食べる"
    await drafts.sceneChanged(to: .inactive)
    #expect(await notes.storage.load(SavedWords.taberu).map(\.id) == [note.id])
    #expect(await notes.texts() == ["よく食べる"])

    notes.page.draft = ""
    await drafts.sceneChanged(to: .inactive)
    #expect(await notes.texts() == ["よく食べる"])
    notes.page.finishEditing()
    await notes.page.refresh()
    #expect(await notes.texts().isEmpty)
  }

  @Test("coming back to Zenbu saves nothing")
  func keepsNothingOnComingBack() async {
    let drafts = TypedDrafts()
    let notes = await notesPage(in: drafts)
    notes.page.beginAdding()
    notes.page.draft = "まだ書いている"
    await drafts.sceneChanged(to: .active)
    #expect(notes.saved == 0)
    #expect(await notes.texts().isEmpty)
  }

  @Test("a profile field being typed is saved as Zenbu goes inactive, and keeps its focus")
  func keepsAProfileField() async {
    let drafts = TypedDrafts()
    let defaults = MemoryDefaults()
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")
    let profile = UserProfile(defaults: defaults, photoURL: photoURL)
    let edits = OSAllocatedUnfairLock(initialState: 0)
    profile.changeObserver = { _ in edits.withLock { $0 += 1 } }
    let editing = ProfileEditing(drafts: drafts)
    editing.profile = profile
    editing.showSaved()
    editing.focusMoved(from: nil, to: .name)
    editing.name.text = "Kana Fan"

    await drafts.sceneChanged(to: .inactive)
    #expect(UserProfile(defaults: defaults, photoURL: photoURL).name == "Kana Fan")
    #expect(editing.name.text == "Kana Fan")
    editing.focusMoved(from: .name, to: nil)
    #expect(profile.name == "Kana Fan")
    #expect(edits.withLock { $0 } == 1)
  }

  @Test(
    "a username being typed waits for its field to be left, so a half-typed one is never claimed",
    arguments: ["kana_fan", "has.period"])
  func leavesAUsernameToItsField(typed: String) async {
    let drafts = TypedDrafts()
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")
    let profile = UserProfile(defaults: MemoryDefaults(), photoURL: photoURL)
    let editing = ProfileEditing(drafts: drafts)
    editing.profile = profile
    editing.showSaved()
    editing.focusMoved(from: nil, to: .username)
    editing.username.text = typed

    await drafts.sceneChanged(to: .inactive)
    #expect(profile.username.isEmpty)
    #expect(!editing.showsUsernameError)
    editing.focusMoved(from: .username, to: nil)
    let accepted = typed == "kana_fan"
    #expect(profile.username == (accepted ? typed : ""))
    #expect(editing.showsUsernameError == !accepted)
  }
}
