import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Changes the share sheet hands the app")
final class SharedChangesTests {
  private let folder = URL.temporaryDirectory.appending(
    path: "shared-changes-\(UUID().uuidString)", directoryHint: .isDirectory)
  private var changes: SharedChanges { SharedChanges(folder: folder.appending(path: "Inbox")) }
  private let eki = LanguageReferenceID(rawValue: "d49b2f3c5cbf3002ebf317043cbebdad")

  deinit {
    try? FileManager.default.removeItem(at: folder)
  }

  private func stores(_ name: String) async -> (WordLists, WordKnowledge) {
    let lists = WordLists(fileURL: folder.appending(path: "\(name)-lists.json"))
    let knowledge = WordKnowledge(fileURL: folder.appending(path: "\(name)-knowledge.json"))
    await lists.flush()
    await knowledge.flush()
    return (lists, knowledge)
  }

  private func shareSheetStores() async -> (WordLists, WordKnowledge) {
    let (lists, knowledge) = await stores("share-sheet")
    lists.changeObserver = changes.record
    knowledge.changeObserver = changes.record
    return (lists, knowledge)
  }

  @Test("a list made, a word added to it, and a word marked known reach the app's stores")
  func changesReachTheApp() async throws {
    let (sheetLists, sheetKnowledge) = await shareSheetStores()
    let list = try #require(sheetLists.createList(named: "Station words"))
    sheetLists.addWord(eki, headword: "駅", reading: "えき", to: list.id)
    sheetLists.addWord(eki, headword: "駅", reading: "えき", to: WordLists.favoritesID)
    sheetKnowledge.setStatus(.known, id: eki, headword: "駅", reading: "えき")

    let (lists, knowledge) = await stores("app")
    var recorded: [SharedChange] = []
    lists.changeObserver = { recorded += SharedChange($0).map { [$0] } ?? [] }
    knowledge.changeObserver = { recorded += SharedChange($0).map { [$0] } ?? [] }
    await changes.apply(to: lists, knowledge)

    #expect(lists.lists.map(\.name) == ["Favorites", "Station words"])
    #expect(lists.contains(eki, in: list.id))
    #expect(lists.contains(eki, in: WordLists.favoritesID))
    #expect(knowledge.isKnown(eki))
    #expect(recorded.count == 4)
    #expect(changes.pending().isEmpty)
  }

  @Test("changes apply in the order they were made")
  func inOrder() async {
    let (sheetLists, _) = await shareSheetStores()
    let saved = SavedItem(kind: .word(eki), headword: "駅", reading: "えき")
    sheetLists.toggle(saved, in: WordLists.favoritesID)
    sheetLists.toggle(saved, in: WordLists.favoritesID)
    #expect(changes.pending().count == 2)

    let (lists, knowledge) = await stores("app")
    lists.addWord(eki, headword: "駅", reading: "えき", to: WordLists.favoritesID)
    await changes.apply(to: lists, knowledge)
    #expect(!lists.contains(eki, in: WordLists.favoritesID))
  }

  @Test("applying the same changes twice changes nothing more")
  func appliedOnce() async throws {
    let (sheetLists, _) = await shareSheetStores()
    let list = try #require(sheetLists.createList(named: "Trains"))
    sheetLists.addWord(eki, headword: "駅", reading: "えき", to: list.id)
    let (lists, knowledge) = await stores("app")
    await changes.apply(to: lists, knowledge)
    await changes.apply(to: lists, knowledge)
    #expect(lists.lists.filter { $0.name == "Trains" }.count == 1)
    #expect(lists.words(in: list.id).count == 1)
  }

  @Test("a change waits while the store it goes to can't be changed, and the others apply")
  func waitsForAStoreThatCantChange() async throws {
    let (sheetLists, sheetKnowledge) = await shareSheetStores()
    sheetLists.addWord(eki, headword: "駅", reading: "えき", to: WordLists.favoritesID)
    sheetKnowledge.setStatus(.known, id: eki, headword: "駅", reading: "えき")
    try Data(#"{"version":99,"records":[]}"#.utf8)
      .write(to: folder.appending(path: "app-knowledge.json"))

    let (lists, knowledge) = await stores("app")
    #expect(!knowledge.canChange)
    await changes.apply(to: lists, knowledge)
    #expect(lists.contains(eki, in: WordLists.favoritesID))
    #expect(changes.pending().map(\.change) == [.known(
      KnownWordChange(storedID: eki.rawValue, headword: "駅", reading: "えき", status: .known))])
  }

  @Test("a change file that can't be read is dropped")
  func unreadableChange() async throws {
    let inbox = folder.appending(path: "Inbox")
    try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
    try Data("{".utf8).write(to: inbox.appending(path: "0-broken.json"))
    #expect(changes.pending().isEmpty)
    #expect(try FileManager.default.contentsOfDirectory(atPath: inbox.path).isEmpty)
  }

  @Test("only list, word, and known-word changes are handed over")
  func handedOverChanges() {
    let list = WordList(
      id: UUID(), name: "Trains", position: 1, createdAt: Date(), updatedAt: Date())
    #expect(SharedChange(.listChanged(list, previous: list)) == nil)
    #expect(SharedChange(.listDeleted(WordLists.favoritesID)) == nil)
    let change = KnownWordChange(storedID: eki.rawValue, headword: "駅", reading: "えき", status: .known)
    #expect(SharedChange(.known(change, previous: .unknown)) == .known(change))
  }
}

@MainActor
@Suite("Copies of the app's stores the share sheet reads")
final class SharedCopyTests {
  private let folder = URL.temporaryDirectory.appending(
    path: "shared-copy-\(UUID().uuidString)", directoryHint: .isDirectory)
  private var file: URL { folder.appending(path: "app/word-lists.json") }
  private var copy: URL { folder.appending(path: "group/word-lists.json") }

  deinit {
    try? FileManager.default.removeItem(at: folder)
  }

  @Test("the share sheet's copy matches each save and each load")
  func copyFollowsTheFile() async throws {
    let lists = WordLists(fileURL: file, sharedCopy: copy)
    await lists.flush()
    lists.createList(named: "Station words")
    await lists.flush()
    #expect(try Data(contentsOf: copy) == Data(contentsOf: file))

    try FileManager.default.removeItem(at: copy)
    await WordLists(fileURL: file, sharedCopy: copy).flush()
    #expect(try Data(contentsOf: copy) == Data(contentsOf: file))
  }

  @Test("a copy of a file that is gone is removed")
  func copyOfAMissingFile() async throws {
    try FileManager.default.createDirectory(
      at: copy.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data("{}".utf8).write(to: copy)
    let knowledge = WordKnowledge(fileURL: file, sharedCopy: copy)
    await knowledge.flush()
    #expect(!FileManager.default.fileExists(atPath: copy.path))
  }
}
