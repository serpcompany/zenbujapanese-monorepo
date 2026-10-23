import Foundation
import Testing

@testable import SearchExperience

@Suite("Word notes", .timeLimit(.minutes(1)))
struct WordNoteStorageTests {
  private let key = WordNoteStorage.storageKey
  private let taberu = SavedWords.taberu
  private let miru = SavedWords.miru

  @Test("a note is saved trimmed, read back, changed in place, and removed when emptied")
  func savesAndRemoves() async throws {
    let defaults = MemoryDefaults()
    let storage = storage(in: defaults)

    await storage.save(LearnerWordNote(id: "1", text: "  毎日食べる  "), for: taberu)
    await storage.save(LearnerWordNote(id: "2", text: "朝ごはん"), for: taberu)
    await storage.save(LearnerWordNote(id: "1", text: "よく食べる"), for: taberu)
    let reloaded = self.storage(in: defaults)
    #expect(await reloaded.load(taberu).map(\.text) == ["よく食べる", "朝ごはん"])
    await storage.save(LearnerWordNote(id: "1", text: " "), for: taberu)
    await storage.save(LearnerWordNote(id: "2", text: ""), for: taberu)
    #expect(await storage.load(taberu).isEmpty)
  }

  @Test("two pages open on one word each add a note, and both are kept")
  func keepsNotesFromTwoPages() async throws {
    let defaults = MemoryDefaults()
    let storage = storage(in: defaults)
    let (store, saves) = SavedWords.observed(storage)
    var savesFinished = saves.makeAsyncIterator()
    let pages = await MainActor.run { [SavedItemNotes(store: store), SavedItemNotes(store: store)] }
    for page in pages { await page.load(SavedWords.taberuItem) }

    for (page, text) in zip(pages, ["一つ目の窓", "二つ目の窓"]) {
      await MainActor.run {
        page.beginAdding()
        page.draft = text
        page.finishEditing()
      }
      _ = await savesFinished.next()
    }

    #expect(Set(await storage.load(taberu).map(\.text)) == ["一つ目の窓", "二つ目の窓"])
  }

  @Test("a note written or begun before its page has loaded is kept, and saved once it has")
  func keepsNotesWrittenBeforeLoading() async throws {
    let defaults = MemoryDefaults()
    let storage = storage(in: defaults)
    await storage.save(LearnerWordNote(id: "1", text: "前のメモ"), for: taberu)
    let (store, saves) = SavedWords.observed(storage)
    var savesFinished = saves.makeAsyncIterator()
    let page = await MainActor.run { SavedItemNotes(store: store) }
    await MainActor.run {
      page.beginAdding()
      page.draft = "読み込み前のメモ"
      page.finishEditing()
      page.beginAdding()
      page.draft = "書きかけのメモ"
    }

    await page.load(SavedWords.taberuItem)
    _ = await savesFinished.next()
    #expect(await page.notes.map(\.text) == ["前のメモ", "読み込み前のメモ"])
    #expect(await page.draft == "書きかけのメモ")
    await MainActor.run { page.finishEditing() }
    _ = await savesFinished.next()

    let kept = ["前のメモ", "読み込み前のメモ", "書きかけのメモ"]
    #expect(await page.notes.map(\.text) == kept)
    #expect(await storage.load(taberu).map(\.text) == kept)
    await page.load(SavedWords.taberuItem)
    #expect(await page.notes.map(\.text) == kept)
  }

  @Test("notes that can't be read are kept aside, and new notes save")
  func keepsUnreadableNotesAside() async throws {
    let defaults = MemoryDefaults()
    let unreadable = Data(#"["not", "notes"]"#.utf8)
    defaults.set(unreadable, forKey: key)
    let storage = storage(in: defaults)

    await storage.save(LearnerWordNote(text: "新しいメモ"), for: taberu)
    #expect(defaults.keptCopies(of: key) == [unreadable])
    #expect(await storage.load(taberu).map(\.text) == ["新しいメモ"])
  }

  @Test(
    "a note that can't be read is kept aside, and every readable note stays, on its word or another",
    arguments: [
      #"{"MIRU":[{"id":"1","text":"見る"}],"TABERU":"not notes"}"#,
      #"{"MIRU":[{"id":"1","text":"見る"},{"id":5}],"TABERU":[{"id":5}]}"#,
    ])
  func keepsReadableNotes(stored json: String) async throws {
    let defaults = MemoryDefaults()
    let stored = Data(
      json.replacingOccurrences(of: "MIRU", with: miru.rawValue)
        .replacingOccurrences(of: "TABERU", with: taberu.rawValue).utf8)
    defaults.set(stored, forKey: key)
    let storage = storage(in: defaults)

    #expect(await storage.load(miru).map(\.text) == ["見る"])
    #expect(await storage.load(taberu).isEmpty)
    #expect(defaults.keptCopies(of: key) == [stored])
    #expect(await self.storage(in: defaults).load(miru).map(\.text) == ["見る"])
  }

  @Test("a page saves the note it was editing when it opens another")
  func savesADraftWhenAnotherNoteOpens() async throws {
    let defaults = MemoryDefaults()
    let (page, storage, saves, _) = await pageOnTwoNotes(in: defaults)
    var savesFinished = saves.makeAsyncIterator()

    await MainActor.run {
      page.beginEditing(page.notes[0])
      page.draft = "よく食べる"
      page.beginEditing(page.notes[1])
      page.draft = "朝ごはんに食べる"
      page.finishEditing()
    }
    while let saved = await savesFinished.next(), saved != "2" {}

    #expect(await storage.load(taberu).map(\.text) == ["よく食べる", "朝ごはんに食べる"])
  }

  @Test("a page saves the note it was editing when it adds another, and removes one emptied")
  func editsNotesThroughAPage() async throws {
    let defaults = MemoryDefaults()
    let (page, storage, saves, _) = await pageOnTwoNotes(in: defaults)
    var savesFinished = saves.makeAsyncIterator()
    let loaded = await MainActor.run { page.notes }

    for (note, draft) in zip(loaded, ["よく食べる", ""]) {
      await MainActor.run {
        page.beginEditing(note)
        page.draft = draft
        page.beginAdding()
        page.finishEditing()
      }
      _ = await savesFinished.next()
    }

    #expect(await storage.load(taberu).map(\.text) == ["よく食べる"])
    #expect(await MainActor.run { page.notes.map(\.text) } == ["よく食べる"])
  }

  @Test("a page that opens a note and leaves it unchanged doesn't write over another page's edit")
  func keepsAnotherPagesEdit() async throws {
    let defaults = MemoryDefaults()
    let (first, storage, saves, store) = await pageOnTwoNotes(in: defaults)
    var savesFinished = saves.makeAsyncIterator()
    let second = await MainActor.run { SavedItemNotes(store: store) }
    await second.load(SavedWords.taberuItem)

    await MainActor.run {
      second.beginEditing(second.notes[0])
      second.draft = "よく食べる"
      second.finishEditing()
    }
    _ = await savesFinished.next()
    await MainActor.run {
      first.beginEditing(first.notes[0])
      first.finishEditing()
      first.beginAdding()
      first.draft = "新しいメモ"
      first.finishEditing()
    }
    while let saved = await savesFinished.next(), saved == "1" {}

    #expect(await storage.load(taberu).map(\.text) == ["よく食べる", "朝ごはん", "新しいメモ"])
  }

  private func pageOnTwoNotes(in defaults: MemoryDefaults) async
    -> (SavedItemNotes, WordNoteStorage, AsyncStream<String>, WordNoteStore)
  {
    let storage = storage(in: defaults)
    await storage.save(LearnerWordNote(id: "1", text: "毎日食べる"), for: taberu)
    await storage.save(LearnerWordNote(id: "2", text: "朝ごはん"), for: taberu)
    let (store, saves) = SavedWords.observed(storage)
    let page = await MainActor.run { SavedItemNotes(store: store) }
    await page.load(SavedWords.taberuItem)
    return (page, storage, saves, store)
  }

  private func storage(in defaults: MemoryDefaults) -> WordNoteStorage {
    WordNoteStorage(defaults: defaults.opened(), placing: SavedWords.lookup)
  }
}
