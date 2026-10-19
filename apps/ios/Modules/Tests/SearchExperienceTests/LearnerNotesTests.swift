import Foundation
import Testing

@testable import SearchExperience

@Suite("Notes in Search", .timeLimit(.minutes(1)))
struct LearnerNotesTests {
  private let taberu = SavedWords.taberu

  @Test("a note written on a word's page is in Search at once, and so is its change and deletion")
  func showsEachChangeAtOnce() async throws {
    let temporary = try TemporaryDefaults()
    let storage = try storage(in: temporary)
    let (search, store, saves) = await searched(in: storage)
    var saved = saves.makeAsyncIterator()
    let page = await MainActor.run { SavedItemNotes(store: store) }
    await page.load(SavedWords.taberuItem)

    await write("to squish flat", on: page)
    _ = await saved.next()
    let squish = try #require(await found(search, "ＳＱＵＩＳＨ").first)
    #expect(
      [squish.key, squish.headword, squish.reading, squish.before, squish.match, squish.after]
        == [taberu.rawValue, "食べる", "たべる", "to ", "squish", " flat"])

    await write("crushed", on: page)
    _ = await saved.next()
    #expect(await found(search, "squish").isEmpty)
    #expect(await found(search, "crush").map(\.match) == ["crush"])

    await write("", on: page)
    _ = await saved.next()
    #expect(await found(search, "crush").isEmpty)
  }

  @Test("notes are in Search again after a relaunch, each word a note is on once")
  func findsNotesAfterARelaunch() async throws {
    let temporary = try TemporaryDefaults()
    let storage = try storage(in: temporary)
    await storage.save(LearnerWordNote(id: "1", text: "plmqz on both"), for: taberu)
    await storage.save(LearnerWordNote(id: "2", text: "plmqz on both"), for: SavedWords.miru)
    await storage.save(
      LearnerWordNote(id: "3", text: "plmqz, the kanji"), for: SavedItemID(rawValue: "kanji:食"))

    let relaunched = try await relaunch(in: temporary)

    #expect(
      await found(relaunched, "PLMQZ").map { [$0.key, $0.headword, $0.reading] } == [
        [SavedWords.miru.rawValue, "見る", "みる"],
        ["kanji:食", "食", ""],
        [taberu.rawValue, "食べる", "たべる"],
      ])
  }

  @Test("a note whose word the dictionary doesn't have isn't in Search")
  func leavesOutNotesWithoutAWord() async throws {
    let temporary = try TemporaryDefaults()
    let storage = try storage(in: temporary)
    await storage.save(LearnerWordNote(id: "1", text: "plmqz kept"), for: taberu)
    await storage.save(LearnerWordNote(id: "2", text: "plmqz dropped"), for: SavedWords.droppedWord)
    await storage.save(LearnerWordNote(id: "3", text: "plmqz kanji"), for: SavedWords.droppedKanji)
    temporary.defaults.set(
      try SavedWords.earlierNotes([
        SavedWords.goneNoteIdentity: [LearnerWordNote(id: "4", text: "plmqz gone")]
      ]), forKey: WordNoteStorage.earlierStorageKey)

    let relaunched = try await relaunch(in: temporary)

    #expect(await found(relaunched, "plmqz").map(\.id) == ["1"])
  }

  @Test("while the dictionary can't be read, a note with no word to name isn't in Search")
  func leavesOutNotesWithNoName() async throws {
    let temporary = try TemporaryDefaults()
    let storage = WordNoteStorage(
      defaults: try #require(UserDefaults(suiteName: temporary.suite)),
      placing: SavedWords.unreadable)
    await storage.save(LearnerWordNote(id: "1", text: "plmqz unnamed"), for: taberu)
    await storage.save(
      LearnerWordNote(id: "2", text: "plmqz named", headword: "見る", reading: "みる"),
      for: SavedWords.miru)

    let (search, _, _) = await searched(in: storage)
    await search.ready()

    #expect(await found(search, "plmqz").map(\.id) == ["2"])
  }

  private func relaunch(in temporary: TemporaryDefaults) async throws -> LearnerNotes {
    let storage = try storage(in: temporary)
    let (search, _, _) = await searched(in: storage)
    await search.ready()
    return search
  }

  @MainActor
  private func write(_ text: String, on page: SavedItemNotes) {
    if let note = page.notes.first { page.beginEditing(note) } else { page.beginAdding() }
    page.draft = text
    page.finishEditing()
  }

  private func found(_ search: LearnerNotes, _ query: String) async -> [NotesInSearch.Row] {
    await search.inSearch(for: SearchQuery(query)).notes?.rows ?? []
  }

  @MainActor
  private func searched(in storage: WordNoteStorage)
    -> (LearnerNotes, WordNoteStore, AsyncStream<String>)
  {
    let search = LearnerNotes(reading: { await storage.onTheirWords() })
    let (store, saves) = SavedWords.observed(WordNoteStore.kept(in: storage, searchedBy: { search }))
    return (search, store, saves)
  }

  private func storage(in temporary: TemporaryDefaults) throws -> WordNoteStorage {
    WordNoteStorage(
      defaults: try #require(UserDefaults(suiteName: temporary.suite)), placing: SavedWords.lookup)
  }
}
