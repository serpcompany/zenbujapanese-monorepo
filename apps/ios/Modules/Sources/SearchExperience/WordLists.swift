import Foundation
import Observation

struct WordList: Codable, Hashable, Identifiable, Sendable {
  let id: UUID
  var name: String
  var position: Int
  let createdAt: Date
  var updatedAt: Date
}

struct WordListMembership: Codable, Hashable, Identifiable, Sendable {
  let listID: UUID
  let entryID: String
  let headword: String
  let reading: String
  let addedAt: Date

  var id: String { entryID }
  var kanji: KanjiCharacter? { SavedItem.kanji(storedID: entryID) }
}

@MainActor
@Observable
final class WordLists {
  static let shared = WordLists()

  static let defaultListName = String(localized: "Favorites")

  private(set) var isLoaded = false
  private(set) var readOnlyReason: LocalFileReadOnlyReason?
  var isReadOnly: Bool { readOnlyReason != nil }
  private(set) var lists: [WordList] = []
  private(set) var membershipsByList: [UUID: [WordListMembership]] = [:]
  @ObservationIgnored private let writer: WordListsWriter
  @ObservationIgnored private let writes = LocalFileWriteQueue()

  init(fileURL: URL = WordLists.defaultFileURL) {
    let writer = WordListsWriter(fileURL: fileURL)
    self.writer = writer
    writes.load { [self] in
      let loaded = await writer.load()
      readOnlyReason = loaded.readOnlyReason
      if let contents = loaded.contents {
        lists = Dictionary(contents.lists.map { ($0.id, $0) }) {
          $0.updatedAt >= $1.updatedAt ? $0 : $1
        }
        .values
        .sorted { ($0.position, $0.createdAt) < ($1.position, $1.createdAt) }
        membershipsByList = Self.grouped(contents.memberships, in: lists)
      }
      isLoaded = true
      if loaded.contents == nil {
        createList(named: Self.defaultListName)
      } else if loaded.needsRewrite {
        persist()
      }
    }
  }

  var canChange: Bool { isLoaded && !isReadOnly }

  func words(in listID: UUID) -> [WordListMembership] {
    membershipsByList[listID] ?? []
  }

  func wordCount(in listID: UUID) -> Int {
    membershipsByList[listID]?.count ?? 0
  }

  func contains(_ id: LanguageReferenceID, in listID: UUID) -> Bool {
    contains(storedID: id.rawValue, in: listID)
  }

  func contains(_ item: SavedItem, in listID: UUID) -> Bool {
    contains(storedID: item.storedID, in: listID)
  }

  private func contains(storedID: String, in listID: UUID) -> Bool {
    membershipsByList[listID]?.contains { $0.entryID == storedID } == true
  }

  @discardableResult
  func createList(named name: String) -> WordList? {
    guard canChange, let name = Self.validName(name) else { return nil }
    let now = Date()
    let list = WordList(
      id: UUID(), name: name, position: (lists.map(\.position).max() ?? -1) + 1,
      createdAt: now, updatedAt: now)
    lists.append(list)
    persist()
    return list
  }

  func renameList(_ listID: UUID, to name: String) {
    guard canChange, let name = Self.validName(name),
      let index = lists.firstIndex(where: { $0.id == listID }), lists[index].name != name
    else { return }
    lists[index].name = name
    lists[index].updatedAt = Date()
    persist()
  }

  func deleteList(_ listID: UUID) {
    guard canChange, lists.contains(where: { $0.id == listID }) else { return }
    lists.removeAll { $0.id == listID }
    membershipsByList[listID] = nil
    persist()
  }

  func moveLists(fromOffsets source: IndexSet, toOffset destination: Int) {
    guard canChange else { return }
    lists.move(fromOffsets: source, toOffset: destination)
    let now = Date()
    for index in lists.indices where lists[index].position != index {
      lists[index].position = index
      lists[index].updatedAt = now
    }
    persist()
  }

  func toggle(_ entry: DictionaryEntry, in listID: UUID) {
    toggle(.word(entry), in: listID)
  }

  func toggle(_ item: SavedItem, in listID: UUID) {
    if contains(item, in: listID) {
      remove(storedID: item.storedID, from: listID)
    } else {
      add(item, to: listID)
    }
  }

  func add(_ item: SavedItem, to listID: UUID) {
    add(storedID: item.storedID, headword: item.headword, reading: item.reading, to: listID)
  }

  func addWord(_ id: LanguageReferenceID, headword: String, reading: String, to listID: UUID) {
    add(storedID: id.rawValue, headword: headword, reading: reading, to: listID)
  }

  func removeWord(_ id: LanguageReferenceID, from listID: UUID) {
    remove(storedID: id.rawValue, from: listID)
  }

  func remove(storedID: String, from listID: UUID) {
    guard canChange, contains(storedID: storedID, in: listID) else { return }
    membershipsByList[listID]?.removeAll { $0.entryID == storedID }
    persist()
  }

  private func add(storedID: String, headword: String, reading: String, to listID: UUID) {
    guard canChange, lists.contains(where: { $0.id == listID }),
      !contains(storedID: storedID, in: listID)
    else { return }
    let membership = WordListMembership(
      listID: listID, entryID: storedID, headword: headword, reading: reading, addedAt: Date())
    membershipsByList[listID, default: []].insert(membership, at: 0)
    persist()
  }

  func saveIfNeeded() {
    if writes.hasUnsavedChanges { persist() }
  }

  func flush() async {
    await writes.flush()
  }

  private func persist() {
    let writer = writer
    writes.save { [self] in
      await writer.write(lists: lists, memberships: membershipsByList.values.flatMap(\.self))
    }
  }

  private static func grouped(
    _ memberships: [WordListMembership], in lists: [WordList]
  ) -> [UUID: [WordListMembership]] {
    var grouped = Dictionary(uniqueKeysWithValues: lists.map { ($0.id, [WordListMembership]()) })
    var seen: [UUID: Set<String>] = [:]
    for membership in memberships.sorted(by: { $0.addedAt > $1.addedAt })
    where grouped[membership.listID] != nil
      && seen[membership.listID, default: []].insert(membership.entryID).inserted
    {
      grouped[membership.listID]?.append(membership)
    }
    return grouped
  }

  private static func validName(_ name: String) -> String? {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  nonisolated static let defaultFileURL = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "word-lists.json")
}

private actor WordListsWriter {
  private struct StoredFile: Codable {
    static let currentVersion = 2
    var version = currentVersion
    var lists: [WordList]
    var memberships: [WordListMembership]
  }

  private struct LoadedFile: Decodable {
    let lists: [LossyDecodable<WordList>]
    let memberships: [LossyDecodable<WordListMembership>]
  }

  struct Contents: Sendable {
    var lists: [WordList] = []
    var memberships: [WordListMembership] = []
  }

  struct Loaded: Sendable {
    var contents: Contents?
    var needsRewrite = false
    var readOnlyReason: LocalFileReadOnlyReason?
  }

  private let file: LocalJSONFile

  init(fileURL: URL) {
    file = LocalJSONFile(
      fileURL: fileURL, currentVersion: StoredFile.currentVersion,
      description: "word lists", logCategory: "WordLists")
  }

  func load() async -> Loaded {
    let data: Data
    switch await file.read() {
    case .missing:
      return Loaded()
    case .unreadable:
      return Loaded(contents: Contents(), readOnlyReason: .couldNotRead)
    case .newerVersion(let newer):
      let stored = try? JSONDecoder.localStore.decode(LoadedFile.self, from: newer)
      return Loaded(
        contents: stored.map(Self.readableContents) ?? Contents(), readOnlyReason: .newerVersion)
    case .current(let current):
      data = current
    }
    guard let stored = try? JSONDecoder.localStore.decode(LoadedFile.self, from: data) else {
      return await keepUnreadableCopy(of: Contents())
    }
    let contents = Self.readableContents(stored)
    guard
      contents.lists.count == stored.lists.count
        && contents.memberships.count == stored.memberships.count
    else { return await keepUnreadableCopy(of: contents) }
    return Loaded(contents: contents)
  }

  private func keepUnreadableCopy(of contents: Contents) async -> Loaded {
    await file.keepUnreadableCopy()
      ? Loaded(contents: contents, needsRewrite: true)
      : Loaded(contents: contents, readOnlyReason: .couldNotKeepCopy)
  }

  private static func readableContents(_ stored: LoadedFile) -> Contents {
    Contents(
      lists: stored.lists.compactMap(\.value),
      memberships: stored.memberships.compactMap(\.value))
  }

  func write(lists: [WordList], memberships: [WordListMembership]) async -> Bool {
    let stored = StoredFile(lists: lists, memberships: memberships)
    guard let data = try? JSONEncoder.localStore.encode(stored) else { return false }
    return await file.write(data)
  }
}
