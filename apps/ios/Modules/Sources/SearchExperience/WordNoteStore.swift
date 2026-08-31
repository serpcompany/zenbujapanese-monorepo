import Foundation

struct WordNoteStore: Sendable {
  var load: @Sendable (WordNoteID) async -> [LearnerWordNote]
  var save: @Sendable ([LearnerWordNote], WordNoteID) async -> Void

  static let live = WordNoteStore(
    load: { id in await WordNoteStorage.shared.load(id) },
    save: { notes, id in await WordNoteStorage.shared.save(notes, for: id) }
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

private actor WordNoteStorage {
  static let shared = WordNoteStorage()
  private let defaults = UserDefaults.standard
  private let storageKey = "lookup.word-notes.v4"
  private var didPrepare = false

  func load(_ id: WordNoteID) -> [LearnerWordNote] {
    resetForUITestingIfRequested()
    return notes()[id.rawValue] ?? []
  }

  func save(_ incomingNotes: [LearnerWordNote], for id: WordNoteID) {
    resetForUITestingIfRequested()
    var stored = notes()
    let normalized = incomingNotes.compactMap { note -> LearnerWordNote? in
      let text = note.text.trimmingCharacters(in: .whitespacesAndNewlines)
      return text.isEmpty ? nil : LearnerWordNote(id: note.id, text: text)
    }
    if normalized.isEmpty {
      stored.removeValue(forKey: id.rawValue)
    } else {
      stored[id.rawValue] = normalized
    }
    write(stored)
  }

  private func notes() -> [String: [LearnerWordNote]] {
    guard let data = defaults.data(forKey: storageKey) else { return [:] }
    return (try? JSONDecoder().decode([String: [LearnerWordNote]].self, from: data)) ?? [:]
  }

  private func write(_ notes: [String: [LearnerWordNote]]) {
    guard let data = try? JSONEncoder().encode(notes) else { return }
    defaults.set(data, forKey: storageKey)
  }

  private func resetForUITestingIfRequested() {
    guard !didPrepare else { return }
    didPrepare = true
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-ResetWordNotes") {
        defaults.removeObject(forKey: storageKey)
      }
    #endif
  }
}
