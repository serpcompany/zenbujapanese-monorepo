import Foundation
import Testing
@testable import SearchExperience

@MainActor
@Suite("Word lists")
final class WordListsTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "word-lists-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private var fileURL: URL { directory.appending(path: "word-lists.json") }

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  private let taberu = LanguageReferenceID(rawValue: "0123456789abcdef0123456789abcdef")
  private let miru = LanguageReferenceID(rawValue: "fedcba9876543210fedcba9876543210")

  private func loadedLists() async -> WordLists {
    let lists = WordLists(fileURL: fileURL)
    await lists.flush()
    return lists
  }

  @Test("a new install starts with Favorites")
  func seedsFavorites() async {
    let lists = await loadedLists()
    #expect(lists.lists.map(\.name) == ["Favorites"])
    #expect(lists.lists.map(\.id) == [WordLists.favoritesID])

    let reloaded = await loadedLists()
    #expect(reloaded.lists.map(\.id) == lists.lists.map(\.id))
  }

  @Test("deleting Favorites is remembered")
  func favoritesNotRecreated() async throws {
    let lists = await loadedLists()
    let favorites = try #require(lists.lists.first)
    lists.deleteList(favorites.id)
    await lists.flush()

    let reloaded = await loadedLists()
    #expect(reloaded.lists.isEmpty)
  }

  @Test("creating, renaming, deleting, and reordering lists survive a reload")
  func listChangesPersist() async throws {
    let lists = await loadedLists()
    let anime = try #require(lists.createList(named: "  Anime S1 vocab \n"))
    let jlpt = try #require(lists.createList(named: "JLPT"))
    let drop = try #require(lists.createList(named: "Scratch"))
    lists.renameList(jlpt.id, to: "JLPT N5")
    lists.deleteList(drop.id)
    lists.moveLists(fromOffsets: [2], toOffset: 0)
    await lists.flush()

    let reloaded = await loadedLists()
    #expect(reloaded.lists.map(\.name) == ["JLPT N5", "Favorites", "Anime S1 vocab"])
    #expect(reloaded.lists.map(\.position) == [0, 1, 2])
    #expect(reloaded.lists.last?.id == anime.id)
  }

  @Test("names are trimmed and can't be empty, and duplicates are allowed")
  func names() async throws {
    let lists = await loadedLists()
    #expect(lists.createList(named: "   ") == nil)
    let second = try #require(lists.createList(named: "Favorites"))
    lists.renameList(second.id, to: " \n")
    #expect(lists.lists.map(\.name) == ["Favorites", "Favorites"])
  }

  @Test("a list that moves to a new ID can still be found by the ID it was opened with")
  func openListFollowsItsID() async throws {
    let lists = await loadedLists()
    let opened = try #require(lists.lists.first).id
    lists.addWord(taberu, headword: "食べる", reading: "たべる", to: opened)
    let moved = UUID()
    let newest = UUID()

    lists.moveList(opened, to: moved)
    #expect(lists.currentID(of: opened) == moved)
    #expect(lists.words(in: lists.currentID(of: opened)).map(\.entryID) == [taberu.rawValue])

    lists.moveList(moved, to: newest)
    #expect(lists.currentID(of: opened) == newest)
    #expect(lists.lists.first { $0.id == lists.currentID(of: opened) }?.name == "Favorites")
    let other = UUID()
    #expect(lists.currentID(of: other) == other)
  }

  @Test("names hold at most 500 characters, with control characters made spaces")
  func nameLimits() async throws {
    let lists = await loadedLists()
    let long = try #require(lists.createList(named: String(repeating: "語", count: 600)))
    #expect(long.name.unicodeScalars.count == WordLists.longestName)
    let tabbed = try #require(lists.createList(named: "Anime\tS1\u{7}"))
    #expect(tabbed.name == "Anime S1")
    #expect(lists.createList(named: "\u{7}\u{8}") == nil)
  }

  @Test("adding and removing words survive a reload, most recently added first")
  func membershipsPersist() async throws {
    let lists = await loadedLists()
    let favorites = try #require(lists.lists.first).id
    lists.addWord(taberu, headword: "食べる", reading: "たべる", to: favorites)
    lists.addWord(miru, headword: "見る", reading: "みる", to: favorites)
    await lists.flush()

    var reloaded = await loadedLists()
    #expect(reloaded.words(in: favorites).map(\.headword) == ["見る", "食べる"])
    #expect(reloaded.contains(taberu, in: favorites))

    reloaded.removeWord(taberu, from: favorites)
    await reloaded.flush()
    reloaded = await loadedLists()
    #expect(!reloaded.contains(taberu, in: favorites))
    #expect(reloaded.wordCount(in: favorites) == 1)
  }

  @Test("toggling a word adds it, then removes it")
  func toggle() async throws {
    let lists = await loadedLists()
    let favorites = try #require(lists.lists.first).id
    let entry = DictionaryEntry.fixture(id: taberu.rawValue, headword: "食べる", reading: "たべる")
    lists.toggle(entry, in: favorites)
    #expect(lists.contains(taberu, in: favorites))
    lists.toggle(entry, in: favorites)
    #expect(!lists.contains(taberu, in: favorites))
    lists.toggle(entry, in: favorites)
    await lists.flush()

    let reloaded = await loadedLists()
    #expect(reloaded.contains(taberu, in: favorites))
  }

  @Test("a word is in a list at most once")
  func noDuplicateMemberships() async throws {
    let lists = await loadedLists()
    let favorites = try #require(lists.lists.first).id
    lists.addWord(taberu, headword: "食べる", reading: "たべる", to: favorites)
    lists.addWord(taberu, headword: "食べる", reading: "たべる", to: favorites)
    #expect(lists.wordCount(in: favorites) == 1)
  }

  @Test("a repeated membership in the file loads once")
  func duplicateMembershipsInFile() async throws {
    let listID = UUID()
    try writeFile("""
      {"version":1,"lists":[{"id":"\(listID)","name":"Favorites","position":0,"createdAt":0,"updatedAt":0}],
      "memberships":[
      \(taberuMembership(in: listID, addedAt: 0)),
      \(taberuMembership(in: listID, addedAt: 5))]}
      """)
    let lists = await loadedLists()
    #expect(lists.wordCount(in: listID) == 1)
  }

  @Test("a repeated list ID in the file loads once, keeping the latest copy")
  func duplicateListsInFile() async throws {
    let listID = UUID()
    try writeFile("""
      {"version":1,"lists":[
      {"id":"\(listID)","name":"Old","position":0,"createdAt":0,"updatedAt":0},
      {"id":"\(listID)","name":"New","position":0,"createdAt":0,"updatedAt":5}],
      "memberships":[
      \(taberuMembership(in: listID, addedAt: 0))]}
      """)
    let lists = await loadedLists()
    #expect(lists.lists.map(\.name) == ["New"])
    #expect(lists.wordCount(in: listID) == 1)
  }

  @Test("deleting a list deletes its words")
  func deletingListDeletesMemberships() async throws {
    let lists = await loadedLists()
    let anime = try #require(lists.createList(named: "Anime"))
    lists.addWord(taberu, headword: "食べる", reading: "たべる", to: anime.id)
    lists.deleteList(anime.id)
    #expect(lists.wordCount(in: anime.id) == 0)
    await lists.flush()

    let stored = try String(decoding: Data(contentsOf: fileURL), as: UTF8.self)
    #expect(!stored.contains(anime.id.uuidString))
    #expect(!stored.contains(taberu.rawValue))
  }

  @Test("a corrupt file loads as no lists, without Favorites, and is kept aside")
  func corruptFile() async throws {
    try writeFile("not json")
    let lists = await loadedLists()
    #expect(lists.isLoaded)
    #expect(!lists.isReadOnly)
    #expect(lists.lists.isEmpty)
    #expect(try backups().count == 1)

    let relaunched = await loadedLists()
    #expect(relaunched.lists.isEmpty)
    #expect(try backups().count == 1)
  }

  @Test("an unreadable record doesn't discard the rest")
  func unreadableRecord() async throws {
    let listID = UUID()
    try writeFile("""
      {"version":1,"lists":[{"id":"\(listID)","name":"Anime","position":0,"createdAt":0,"updatedAt":0},
      {"id":"not-a-uuid","name":"Broken"}],
      "memberships":[
      \(taberuMembership(in: listID, addedAt: 0))]}
      """)
    let lists = await loadedLists()
    #expect(lists.lists.map(\.name) == ["Anime"])
    #expect(lists.contains(taberu, in: listID))
    #expect(try backups().count == 1)
  }

  @Test("a file that exists but can't be read is never replaced with Favorites")
  func unreadableFileIsReadOnly() async throws {
    let json = """
      {"version":1,"lists":[{"id":"\(UUID())","name":"Anime","position":0,"createdAt":0,"updatedAt":0}],
      "memberships":[]}
      """
    try writeFile(json)
    try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: fileURL.path)
    defer {
      try? FileManager.default.setAttributes(
        [.posixPermissions: 0o644], ofItemAtPath: fileURL.path)
    }

    let lists = await loadedLists()
    #expect(lists.readOnlyReason == .couldNotRead)
    #expect(lists.createList(named: "New") == nil)
    await lists.flush()
    try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: fileURL.path)
    #expect(try Data(contentsOf: fileURL) == Data(json.utf8))
  }

  @Test("changes made before the file loads are ignored")
  func changesBeforeLoad() async {
    let lists = WordLists(fileURL: fileURL)
    #expect(lists.createList(named: "Early") == nil)
    await lists.flush()
    #expect(lists.lists.map(\.name) == ["Favorites"])
  }

  @Test("a file from a newer version is never saved over")
  func newerVersionIsReadOnly() async throws {
    let listID = UUID()
    let json = """
      {"version":3,"lists":[{"id":"\(listID)","name":"Anime","position":0,"createdAt":0,"updatedAt":0,"color":"red"}],
      "memberships":[]}
      """
    try writeFile(json)
    let lists = await loadedLists()
    #expect(lists.readOnlyReason == .newerVersion)
    #expect(lists.lists.map(\.name) == ["Anime"])
    #expect(lists.createList(named: "New") == nil)
    lists.addWord(taberu, headword: "食べる", reading: "たべる", to: listID)
    lists.deleteList(listID)
    await lists.flush()
    #expect(lists.lists.count == 1)
    #expect(try Data(contentsOf: fileURL) == Data(json.utf8))
  }

  @Test("a failed write is saved again by saveIfNeeded")
  func retryAfterFailedWrite() async throws {
    let lists = await loadedLists()
    try FileManager.default.removeItem(at: directory)
    try Data().write(to: directory)
    lists.createList(named: "Anime")
    await lists.flush()

    try FileManager.default.removeItem(at: directory)
    lists.saveIfNeeded()
    await lists.flush()
    let reloaded = await loadedLists()
    #expect(reloaded.lists.map(\.name) == ["Favorites", "Anime"])
  }

  private func taberuMembership(in listID: UUID, addedAt: Int) -> String {
    #"{"listID":"\#(listID)","entryID":"\#(taberu.rawValue)","headword":"食べる","reading":"たべる","addedAt":\#(addedAt)}"#
  }

  private func writeFile(_ contents: String) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(contents.utf8).write(to: fileURL)
  }

  private func backups() throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: directory.path)
      .filter { $0.hasPrefix("word-lists.unreadable-") }
  }
}
