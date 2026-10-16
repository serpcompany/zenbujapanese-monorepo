import Foundation

struct WordNoteStore: Sendable {
  var load: @Sendable (SavedItemID) async -> [LearnerWordNote]
  var save: @Sendable (LearnerWordNote, SavedItemID) async -> Void
  var withoutAWord: @Sendable () async -> [NoteWithoutAWord] = { [] }

  static let live = WordNoteStore(
    load: { id in await WordNoteStorage.shared.load(id) },
    save: { note, id in await WordNoteStorage.shared.save(note, for: id) },
    withoutAWord: { await WordNoteStorage.shared.withoutAWord() }
  )
}

struct LearnerWordNote: Codable, Hashable, Identifiable, Sendable {
  let id: String
  var text: String

  init(id: String = UUID().uuidString, text: String) {
    self.id = id
    self.text = text
  }
}

struct NoteWithoutAWord: Identifiable, Hashable, Sendable {
  let key: SavedItemID
  let note: LearnerWordNote

  var id: String { "\(key.rawValue) \(note.id)" }
}

extension [LearnerWordNote] {
  mutating func apply(_ note: LearnerWordNote) {
    let text = note.text.trimmingCharacters(in: .whitespacesAndNewlines)
    if let index = firstIndex(where: { $0.id == note.id }) {
      if text.isEmpty { remove(at: index) } else { self[index].text = text }
    } else if !text.isEmpty {
      append(LearnerWordNote(id: note.id, text: text))
    }
  }

  mutating func keep(_ others: [LearnerWordNote]) {
    for note in others where !contains(where: { $0.id == note.id }) {
      append(note)
    }
  }
}

actor WordNoteStorage {
  static let shared = WordNoteStorage(placing: .live)
  static let storageKey = "lookup.word-notes.v5"
  static let earlierStorageKey = "lookup.word-notes.v4"
  private let defaults: UserDefaults
  private let placing: NoteIdentityLookup
  private var earlierNotesPlaced: Task<Void, Never>?

  init(defaults: UserDefaults = .standard, placing: NoteIdentityLookup) {
    self.defaults = defaults
    self.placing = placing
  }

  func load(_ id: SavedItemID) async -> [LearnerWordNote] {
    await placeEarlierNotes()
    return notes(under: Self.storageKey)[id.rawValue] ?? []
  }

  func save(_ note: LearnerWordNote, for id: SavedItemID) async {
    await placeEarlierNotes()
    var stored = notes(under: Self.storageKey)
    var word = stored[id.rawValue] ?? []
    word.apply(note)
    stored[id.rawValue] = word.isEmpty ? nil : word
    write(stored, under: Self.storageKey)
  }

  func withoutAWord() async -> [NoteWithoutAWord] {
    await placeEarlierNotes()
    return notes(under: Self.storageKey)
      .map { (key: SavedItemID(rawValue: $0.key), notes: $0.value) }
      .filter { $0.key.isNoteIdentity }
      .sorted { $0.key < $1.key }
      .flatMap { word in word.notes.map { NoteWithoutAWord(key: word.key, note: $0) } }
  }

  private func placeEarlierNotes() async {
    if earlierNotesPlaced == nil {
      earlierNotesPlaced = Task { await moveEarlierNotes() }
    }
    await earlierNotesPlaced?.value
  }

  private func moveEarlierNotes() async {
    let hasEarlierStore = defaults.object(forKey: Self.earlierStorageKey) != nil
    var stored = notes(under: Self.storageKey)
    if hasEarlierStore {
      for (key, earlier) in notes(under: Self.earlierStorageKey) {
        stored[key, default: []].keep(earlier)
      }
    }
    let placed = await placing.wordIDs(for: stored.keys.map(SavedItemID.init(rawValue:)))
    for (earlier, word) in placed.sorted(by: { $0.key < $1.key }) {
      guard let moving = stored.removeValue(forKey: earlier.rawValue) else { continue }
      stored[word.rawValue, default: []].keep(moving)
    }
    guard hasEarlierStore || !placed.isEmpty, write(stored, under: Self.storageKey) else { return }
    defaults.removeObject(forKey: Self.earlierStorageKey)
  }

  private func notes(under key: String) -> [String: [LearnerWordNote]] {
    guard let data = defaults.storedData(forKey: key) else { return [:] }
    let stored = try? JSONDecoder().decode(
      [String: LossyDecodable<[LossyDecodable<LearnerWordNote>]>].self, from: data)
    let words = stored?.compactMapValues(\.value) ?? [:]
    let notes = words.mapValues { $0.compactMap(\.value) }.filter { !$0.value.isEmpty }
    let lostNone =
      words.count == stored?.count && words.values.allSatisfy { $0.allSatisfy { $0.value != nil } }
    guard !lostNone else { return notes }
    UnreadableCopy.keep(key, in: defaults)
    write(notes, under: key)
    return notes
  }

  @discardableResult
  private func write(_ notes: [String: [LearnerWordNote]], under key: String) -> Bool {
    guard let data = try? JSONEncoder().encode(notes) else { return false }
    defaults.set(data, forKey: key)
    return true
  }
}
