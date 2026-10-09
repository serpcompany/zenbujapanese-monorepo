import Foundation
import Testing

@testable import SearchExperience

@Suite("Word notes")
struct WordNoteStorageTests {
  private let key = "lookup.word-notes.v4"
  private let taberu = WordNoteID(rawValue: "taberu-note")
  private let miru = WordNoteID(rawValue: "miru-note")

  @Test("a word's notes are saved trimmed, read back, and removed when emptied")
  func savesAndRemoves() async throws {
    let temporary = try TemporaryDefaults()
    let storage = try storage(in: temporary)

    await storage.save([LearnerWordNote(id: "1", text: "  毎日食べる  ")], for: taberu)
    let reloaded = try self.storage(in: temporary)
    #expect(await reloaded.load(taberu).map(\.text) == ["毎日食べる"])
    await storage.save([LearnerWordNote(id: "1", text: " ")], for: taberu)
    #expect(await storage.load(taberu).isEmpty)
  }

  @Test("notes that can't be read are kept aside, and new notes save")
  func keepsUnreadableNotesAside() async throws {
    let temporary = try TemporaryDefaults()
    let unreadable = Data(#"["not", "notes"]"#.utf8)
    temporary.defaults.set(unreadable, forKey: key)
    let storage = try storage(in: temporary)

    await storage.save([LearnerWordNote(text: "新しいメモ")], for: taberu)
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
  }

  private func storage(in temporary: TemporaryDefaults) throws -> WordNoteStorage {
    WordNoteStorage(defaults: try #require(UserDefaults(suiteName: temporary.suite)))
  }
}
