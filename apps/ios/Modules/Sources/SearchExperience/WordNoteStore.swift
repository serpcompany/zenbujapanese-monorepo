import Foundation

struct WordNoteStore: Sendable {
  var load: @Sendable (SavedItemID) async -> [LearnerWordNote]
  var save: @Sendable (LearnerWordNote, SavedItemID, String?) async -> Void
  var withoutAWord: @Sendable () async -> [NoteWithoutAWord] = { [] }

  static let live = kept(in: .shared, searchedBy: { await LearnerNotes.shared })

  static func kept(
    in storage: WordNoteStorage, searchedBy search: @escaping @Sendable () async -> LearnerNotes
  ) -> WordNoteStore {
    WordNoteStore(
      load: { id in await storage.load(id) },
      save: { note, id, startedFrom in
        await storage.save(note, for: id, startedFrom: startedFrom)
        await search().reload()
      },
      withoutAWord: { await storage.withoutAWord() }
    )
  }
}

struct LearnerWordNote: Codable, Hashable, Identifiable, Sendable {
  let id: String
  var text: String
  var headword: String?
  var reading: String?

  init(
    id: String = UUID().uuidString.lowercased(), text: String, headword: String? = nil,
    reading: String? = nil
  ) {
    self.id = id
    self.text = text
    self.headword = headword
    self.reading = reading
  }

  func on(_ headword: String, reading: String) -> LearnerWordNote {
    LearnerWordNote(id: id, text: text, headword: headword, reading: reading)
  }

  func kept(on key: SavedItemID) -> KeptNote {
    KeptNote(
      id: id.lowercased(), item: key.rawValue, text: text, headword: headword, reading: reading)
  }
}

struct NoteWithoutAWord: Identifiable, Hashable, Sendable {
  let key: SavedItemID
  let note: LearnerWordNote

  var id: String { "\(key.rawValue) \(note.id)" }

  var word: String { note.headword ?? key.kanji ?? key.rawValue }
}

extension [LearnerWordNote] {
  func note(_ id: String) -> LearnerWordNote? {
    first { $0.id.lowercased() == id.lowercased() }
  }

  mutating func apply(_ note: LearnerWordNote) {
    let text = note.text.trimmingCharacters(in: .whitespacesAndNewlines)
    if let index = firstIndex(where: { $0.id.lowercased() == note.id.lowercased() }) {
      if text.isEmpty {
        remove(at: index)
      } else {
        self[index].text = text
        self[index].headword = note.headword ?? self[index].headword
        self[index].reading = note.reading ?? self[index].reading
      }
    } else if !text.isEmpty {
      append(LearnerWordNote(id: note.id, text: text, headword: note.headword, reading: note.reading))
    }
  }

  mutating func keep(_ others: [LearnerWordNote]) {
    for note in others where self.note(note.id) == nil {
      append(note)
    }
  }
}

actor WordNoteStorage {
  static let shared = WordNoteStorage(placing: .live)
  static let storageKey = "lookup.word-notes.v5"
  static let earlierStorageKey = "lookup.word-notes.v4"
  private let defaults: UserDefaults
  private let placing: SavedKeyLookup
  private var earlierNotesPlaced: Task<Void, Never>?
  private var keysWithoutAWord: Set<SavedItemID> = []
  nonisolated let relay = KeptChangeRelay()

  init(defaults: UserDefaults = .standard, placing: SavedKeyLookup) {
    self.defaults = defaults
    self.placing = placing
  }

  func load(_ id: SavedItemID) async -> [LearnerWordNote] {
    await placeEarlierNotes()
    return notes(under: Self.storageKey)[id.rawValue] ?? []
  }

  func save(_ note: LearnerWordNote, for id: SavedItemID, startedFrom: String? = nil) async {
    await placeEarlierNotes()
    var stored = notes(under: Self.storageKey)
    var word = stored[id.rawValue] ?? []
    var note = note
    if let startedFrom, let underneath = word.note(note.id),
      Self.normalized(underneath.text) != Self.normalized(startedFrom)
    {
      let edited = Self.normalized(note.text)
      guard !edited.isEmpty, edited != Self.normalized(underneath.text) else { return }
      note = LearnerWordNote(text: note.text, headword: note.headword, reading: note.reading)
    }
    let before = word.note(note.id)
    word.apply(note)
    stored[id.rawValue] = word.isEmpty ? nil : word
    write(stored, under: Self.storageKey)
    if let after = word.note(note.id) {
      guard after != before else { return }
      await relay.post(
        KeptChanges.noteWritten(after.kept(on: id), startedFrom: before?.text))
    } else if before != nil {
      await relay.post(KeptChanges.noteDeleted(note.id))
    }
  }

  static func normalized(_ text: String) -> String {
    AccountRules.shared.keptNoteText(text)
  }

  func keptNotes() async -> [KeptNote] {
    await placeEarlierNotes()
    return notes(under: Self.storageKey).sorted { $0.key < $1.key }
      .flatMap { key, notes in notes.map { $0.kept(on: SavedItemID(rawValue: key)) } }
  }

  func applySynced(_ synced: [KeptNote], removing gone: [String]) async {
    await placeEarlierNotes()
    let replaced = Set((synced.map(\.id) + gone).map { $0.lowercased() })
    var stored = notes(under: Self.storageKey)
      .mapValues { $0.filter { !replaced.contains($0.id.lowercased()) } }
      .filter { !$0.value.isEmpty }
    for note in synced {
      stored[note.item, default: []].append(
        LearnerWordNote(
          id: note.id.lowercased(), text: note.text, headword: note.headword,
          reading: note.reading))
    }
    write(stored, under: Self.storageKey)
  }

  func withoutAWord() async -> [NoteWithoutAWord] {
    await placeEarlierNotes()
    return words { keysWithoutAWord.contains($0) }
      .flatMap { word in word.notes.map { NoteWithoutAWord(key: word.key, note: $0) } }
  }

  func onTheirWords() async -> [SearchableNote] {
    await placeEarlierNotes()
    return words { !$0.isNoteIdentity && !keysWithoutAWord.contains($0) }
      .flatMap { word in word.notes.map { SearchableNote(key: word.key, note: $0) } }
      .filter { !$0.headword.isEmpty }
  }

  private func words(where kept: (SavedItemID) -> Bool)
    -> [(key: SavedItemID, notes: [LearnerWordNote])]
  {
    notes(under: Self.storageKey)
      .map { (key: SavedItemID(rawValue: $0.key), notes: $0.value) }
      .filter { kept($0.key) }
      .sorted { $0.key < $1.key }
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
    let places = await placing.places(for: stored.keys.map(SavedItemID.init(rawValue:)))
    keysWithoutAWord = places?.missing ?? []
    let placed = stored.placing(places?.words ?? [:])
    guard hasEarlierStore || placed != stored, write(placed, under: Self.storageKey) else { return }
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

extension [String: [LearnerWordNote]] {
  fileprivate func placing(_ words: [SavedItemID: SavedWordLabel]) -> Self {
    var placed = self
    var moving: [(word: SavedWordLabel, notes: [LearnerWordNote])] = []
    for (key, word) in words.sorted(by: { $0.key < $1.key }) {
      guard let notes = placed.removeValue(forKey: key.rawValue) else { continue }
      moving.append((word, notes))
    }
    for (word, notes) in moving {
      let labeled = notes.map { $0.on(word.headword, reading: word.reading) }
      placed[word.id.rawValue, default: []].keep(labeled)
    }
    return placed
  }
}
