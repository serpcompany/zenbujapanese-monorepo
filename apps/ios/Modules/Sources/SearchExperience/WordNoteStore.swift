import Foundation

struct WordNoteStore: Sendable {
  var load: @Sendable (WordNoteID) async -> [LearnerWordNote]
  var save: @Sendable (LearnerWordNote, WordNoteID) async -> Void

  static let live = WordNoteStore(
    load: { id in await WordNoteStorage.shared.load(id) },
    save: { note, id in await WordNoteStorage.shared.save(note, for: id) }
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

actor WordNoteStorage {
  static let shared = WordNoteStorage()
  private let defaults: UserDefaults
  private let storageKey = "lookup.word-notes.v4"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func load(_ id: WordNoteID) -> [LearnerWordNote] {
    return notes()[id.rawValue] ?? []
  }

  func save(_ note: LearnerWordNote, for id: WordNoteID) {
    var stored = notes()
    var word = stored[id.rawValue] ?? []
    let text = note.text.trimmingCharacters(in: .whitespacesAndNewlines)
    if let index = word.firstIndex(where: { $0.id == note.id }) {
      if text.isEmpty { word.remove(at: index) } else { word[index].text = text }
    } else if !text.isEmpty {
      word.append(LearnerWordNote(id: note.id, text: text))
    }
    stored[id.rawValue] = word.isEmpty ? nil : word
    write(stored)
  }

  private func notes() -> [String: [LearnerWordNote]] {
    guard let data = defaults.storedData(forKey: storageKey) else { return [:] }
    let stored = try? JSONDecoder().decode(
      [String: LossyDecodable<[LossyDecodable<LearnerWordNote>]>].self, from: data)
    let words = stored?.compactMapValues(\.value) ?? [:]
    let notes = words.mapValues { $0.compactMap(\.value) }.filter { !$0.value.isEmpty }
    let lostNone =
      words.count == stored?.count && words.values.allSatisfy { $0.allSatisfy { $0.value != nil } }
    guard !lostNone else { return notes }
    UnreadableCopy.keep(storageKey, in: defaults)
    write(notes)
    return notes
  }

  private func write(_ notes: [String: [LearnerWordNote]]) {
    guard let data = try? JSONEncoder().encode(notes) else { return }
    defaults.set(data, forKey: storageKey)
  }
}
