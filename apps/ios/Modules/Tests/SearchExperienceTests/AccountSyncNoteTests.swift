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
    let temporary = try TemporaryDefaults()
    let storage = WordNoteStorage(defaults: temporary.defaults, placing: SavedWords.lookup)
    let page = SavedItemNotes(store: SavedWords.observed(storage).0)
    let note = LearnerWordNote(id: noteID, text: "朝")
    await storage.save(note, for: SavedWords.taberu)
    await page.load(SavedWords.taberuItem)
    await storage.applySynced(
      [KeptNote(id: noteID, item: SavedWords.taberu.rawValue, text: "夜", headword: nil, reading: nil)], removing: [])

    page.beginEditing(note)
    page.draft = "朝ごはん"
    page.finishEditing()
    await page.refresh()

    #expect(Set(page.notes.map(\.text)) == ["夜", "朝ごはん"])
    #expect(page.notes.contains { $0.id == noteID && $0.text == "夜" })
  }

  @Test("deleting a note on a page left open across a sync deletes it, whatever case its ID is in")
  func deleteAcrossTheSyncedEcho() async throws {
    let temporary = try TemporaryDefaults()
    let storage = WordNoteStorage(defaults: temporary.defaults, placing: SavedWords.lookup)
    let page = SavedItemNotes(store: SavedWords.observed(storage).0)
    let legacy = LearnerWordNote(id: noteID.uppercased(), text: "朝")
    await storage.save(legacy, for: SavedWords.taberu)
    await page.load(SavedWords.taberuItem)
    await storage.applySynced(
      [KeptNote(id: noteID, item: SavedWords.taberu.rawValue, text: "朝", headword: nil, reading: nil)], removing: [])

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
    let (storage, writes) = try Self.countedStorage()
    let synced = (0..<200).map {
      KeptNote(id: "n\($0)", item: AccountFixture.taberu, text: "\($0)", headword: nil, reading: nil)
    }
    _ = await storage.load(SavedItemID(rawValue: AccountFixture.taberu))
    let before = writes.count(of: WordNoteStorage.storageKey)

    await storage.applySynced(synced, removing: [])

    #expect(writes.count(of: WordNoteStorage.storageKey) == before + 1)
    #expect(await storage.load(SavedItemID(rawValue: AccountFixture.taberu)).count == 200)
  }

  private static func countedStorage() throws -> (WordNoteStorage, WriteCounts) {
    let defaults = try #require(CountingDefaults())
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

final class CountingDefaults: UserDefaults {
  let writes = WriteCounts()
  private let suite: String

  init?(suite: String = "counting-\(UUID().uuidString)") {
    self.suite = suite
    super.init(suiteName: suite)
  }

  deinit {
    removePersistentDomain(forName: suite)
  }

  override func set(_ value: Any?, forKey key: String) {
    writes.add(key)
    super.set(value, forKey: key)
  }
}
