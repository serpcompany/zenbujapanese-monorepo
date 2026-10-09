import Foundation
import Testing

@testable import SearchExperience

@Suite("Word notes")
struct WordNoteStorageTests {
  private let key = "lookup.word-notes.v4"
  private let taberu = WordNoteID(rawValue: "taberu-note")
  private let miru = WordNoteID(rawValue: "miru-note")

  @Test("a note is saved trimmed, read back, changed in place, and removed when emptied")
  func savesAndRemoves() async throws {
    let temporary = try TemporaryDefaults()
    let storage = try storage(in: temporary)

    await storage.save(LearnerWordNote(id: "1", text: "  毎日食べる  "), for: taberu)
    await storage.save(LearnerWordNote(id: "2", text: "朝ごはん"), for: taberu)
    await storage.save(LearnerWordNote(id: "1", text: "よく食べる"), for: taberu)
    let reloaded = try self.storage(in: temporary)
    #expect(await reloaded.load(taberu).map(\.text) == ["よく食べる", "朝ごはん"])
    await storage.save(LearnerWordNote(id: "1", text: " "), for: taberu)
    await storage.save(LearnerWordNote(id: "2", text: ""), for: taberu)
    #expect(await storage.load(taberu).isEmpty)
  }

  @Test("two pages open on one word each add a note, and both are kept")
  func keepsNotesFromTwoPages() async throws {
    let temporary = try TemporaryDefaults()
    let storage = try storage(in: temporary)
    let (saves, saved) = AsyncStream<Void>.makeStream()
    let store = WordNoteStore(
      load: { await storage.load($0) },
      save: { note, id in
        await storage.save(note, for: id)
        saved.yield()
      })
    var savesFinished = saves.makeAsyncIterator()
    let pages = await MainActor.run { [SavedItemNotes(store: store), SavedItemNotes(store: store)] }
    for page in pages { await page.load(taberu) }

    for (page, text) in zip(pages, ["一つ目の窓", "二つ目の窓"]) {
      await MainActor.run {
        page.beginAdding()
        page.draft = text
        page.finishEditing()
      }
      await savesFinished.next()
    }

    #expect(Set(await storage.load(taberu).map(\.text)) == ["一つ目の窓", "二つ目の窓"])
  }

  @Test("notes that can't be read are kept aside, and new notes save")
  func keepsUnreadableNotesAside() async throws {
    let temporary = try TemporaryDefaults()
    let unreadable = Data(#"["not", "notes"]"#.utf8)
    temporary.defaults.set(unreadable, forKey: key)
    let storage = try storage(in: temporary)

    await storage.save(LearnerWordNote(text: "新しいメモ"), for: taberu)
    #expect(temporary.defaults.keptCopies(of: key) == [unreadable])
    #expect(await storage.load(taberu).map(\.text) == ["新しいメモ"])
  }

  @Test(
    "a note that can't be read is kept aside, and every readable note stays, on its word or another",
    arguments: [
      #"{"miru-note":[{"id":"1","text":"見る"}],"taberu-note":"not notes"}"#,
      #"{"miru-note":[{"id":"1","text":"見る"},{"id":5}],"taberu-note":[{"id":5}]}"#,
    ])
  func keepsReadableNotes(stored json: String) async throws {
    let temporary = try TemporaryDefaults()
    let stored = Data(json.utf8)
    temporary.defaults.set(stored, forKey: key)
    let storage = try storage(in: temporary)

    #expect(await storage.load(miru).map(\.text) == ["見る"])
    #expect(await storage.load(taberu).isEmpty)
    #expect(temporary.defaults.keptCopies(of: key) == [stored])
    #expect(try await self.storage(in: temporary).load(miru).map(\.text) == ["見る"])
  }

  private func storage(in temporary: TemporaryDefaults) throws -> WordNoteStorage {
    WordNoteStorage(defaults: try #require(UserDefaults(suiteName: temporary.suite)))
  }
}
