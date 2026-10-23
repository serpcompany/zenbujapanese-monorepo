import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: word notes")
struct AccountSyncNoteTests {
  private typealias Fixture = AccountFixture
  private let taberu = SavedItemID(rawValue: AccountFixture.taberu)
  private let noteID = UUID().uuidString.lowercased()

  private func texts(of fixture: Fixture) async -> Set<String> {
    Set(await fixture.notes.load(taberu).map(\.text))
  }

  private func shared(_ text: String) async throws -> (FakeAccountService, Fixture, Fixture) {
    let (service, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    await phone.notes.save(LearnerWordNote(id: noteID, text: text), for: taberu)
    try await phone.syncNow()
    try await pad.signIn()
    return (service, phone, pad)
  }

  private func openPage(showing note: LearnerWordNote, thenSynced text: String) async
    -> (SavedItemNotes, WordNoteStorage)
  {
    let storage = WordNoteStorage(defaults: MemoryDefaults(), placing: SavedWords.lookup)
    let page = SavedItemNotes(store: SavedWords.observed(storage).0)
    await storage.save(note, for: SavedWords.taberu)
    await page.load(SavedWords.taberuItem)
    await synced(text, to: storage)
    return (page, storage)
  }

  private func synced(_ text: String, to storage: WordNoteStorage) async {
    await storage.applySynced(
      [KeptNote(id: noteID, item: SavedWords.taberu.rawValue, text: text, headword: nil, reading: nil)],
      removing: [])
  }

  @Test("a note deleted on one phone but edited on the other since stays, with the edit")
  func deleteLosesToAnEdit() async throws {
    let (_, phone, pad) = try await shared("朝")
    await pad.notes.save(LearnerWordNote(id: noteID, text: "朝ごはん"), for: taberu)
    try await pad.syncNow()
    await phone.notes.save(LearnerWordNote(id: noteID, text: ""), for: taberu)
    try await phone.syncNow()

    #expect(await texts(of: phone) == ["朝ごはん"])
  }

  @Test("a note the account refuses for its length stays on the phone untouched, and an edit after keeps the other phone's text too")
  func refusedNoteStays() async throws {
    let (_, phone, pad) = try await shared("朝")
    let long = String(repeating: "長", count: FakeAccountService.noteLength + 1)
    await phone.notes.save(LearnerWordNote(id: noteID, text: long), for: taberu)
    try await phone.syncNow()
    #expect(phone.sync.state.queue.isEmpty)

    await pad.notes.save(LearnerWordNote(id: noteID, text: "夜"), for: taberu)
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(await texts(of: phone) == [long])

    await phone.notes.save(LearnerWordNote(id: noteID, text: "昼"), for: taberu)
    try await phone.syncNow()
    try await pad.syncNow()
    #expect(await texts(of: phone) == ["夜", "昼"])
    #expect(await texts(of: pad) == ["夜", "昼"])
  }

  @Test("a note edited twice before its answer keeps one new note, the latest, beside the other phone's")
  func twoEditsOneNewNote() async throws {
    let (_, phone, pad) = try await shared("朝")
    await pad.notes.save(LearnerWordNote(id: noteID, text: "夜"), for: taberu)
    try await pad.syncNow()
    await phone.notes.save(LearnerWordNote(id: noteID, text: "朝ごはん"), for: taberu)
    await phone.notes.save(LearnerWordNote(id: noteID, text: "朝ごはんを食べる"), for: taberu)
    try await phone.syncNow()

    #expect(await texts(of: phone) == ["夜", "朝ごはんを食べる"])
  }

  @Test("an edit on a page that loaded before a sync changed the note becomes a note of its own, beside the newer text")
  func stalePageEdit() async throws {
    let note = LearnerWordNote(id: noteID, text: "朝")
    let (page, _) = await openPage(showing: note, thenSynced: "夜")

    page.beginEditing(note)
    page.draft = "朝ごはん"
    page.finishEditing()
    await page.refresh()

    #expect(Set(page.notes.map(\.text)) == ["夜", "朝ごはん"])
    #expect(page.notes.contains { $0.id == noteID && $0.text == "夜" })
  }

  @Test("an edit the other device already made, however its line breaks are written, isn't saved again; after a split the page edits the new note")
  func sameEditAndASecondEdit() async throws {
    let note = LearnerWordNote(id: noteID, text: "朝")
    let (page, storage) = await openPage(showing: note, thenSynced: "朝ごはん\nです")

    page.beginEditing(note)
    page.draft = "朝ごはん\r\nです"
    page.finishEditing()
    await page.refresh()
    #expect(page.notes.map(\.text) == ["朝ごはん\nです"])

    await synced("夜", to: storage)
    page.beginEditing(try #require(page.notes.first))
    page.draft = "昼"
    page.finishEditing()
    await page.refresh()
    let split = try #require(page.notes.first { $0.id != noteID })
    page.beginEditing(split)
    page.draft = "昼ごはん"
    page.finishEditing()
    await page.refresh()

    #expect(Set(await storage.load(SavedWords.taberu).map(\.text)) == ["夜", "昼ごはん"])
  }

  @Test("deleting a note on a page left open across a sync deletes it, whatever case its ID is in")
  func deleteAcrossTheSyncedEcho() async throws {
    let legacy = LearnerWordNote(id: noteID.uppercased(), text: "朝")
    let (page, storage) = await openPage(showing: legacy, thenSynced: "朝")

    page.beginEditing(legacy)
    page.draft = ""
    page.finishEditing()
    await page.refresh()

    #expect(page.notes.isEmpty)
    #expect(await storage.load(SavedWords.taberu).isEmpty)
  }
}

@Suite("Word notes from the account")
struct WordNoteBatchTests {
  @Test("notes from the account are written to the store once for a whole answer")
  func notesWriteOnce() async throws {
    let (storage, writes) = Self.countedStorage()
    let synced = (0..<200).map {
      KeptNote(id: "n\($0)", item: AccountFixture.taberu, text: "\($0)", headword: nil, reading: nil)
    }
    _ = await storage.load(SavedItemID(rawValue: AccountFixture.taberu))
    let before = writes.count(of: WordNoteStorage.storageKey)

    await storage.applySynced(synced, removing: [])

    #expect(writes.count(of: WordNoteStorage.storageKey) == before + 1)
    #expect(await storage.load(SavedItemID(rawValue: AccountFixture.taberu)).count == 200)
  }

  private static func countedStorage() -> (WordNoteStorage, WriteCounts) {
    let defaults = CountingDefaults()
    let writes = defaults.writes
    return (WordNoteStorage(defaults: defaults, placing: SavedWords.lookup), writes)
  }
}

final class WriteCounts: @unchecked Sendable {
  private let lock = NSLock()
  private var counts: [String: Int] = [:]

  func count(of key: String) -> Int { lock.withLock { counts[key] ?? 0 } }

  func add(_ key: String) { lock.withLock { counts[key, default: 0] += 1 } }
}

final class CountingDefaults: MemoryDefaults {
  let writes = WriteCounts()

  override func set(_ value: Any?, forKey key: String) {
    writes.add(key)
    super.set(value, forKey: key)
  }
}
