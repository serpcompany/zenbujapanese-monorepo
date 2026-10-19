import Foundation
import Observation

struct SearchableNote: Encodable, Hashable, Sendable {
  let key: String
  let id: String
  let text: String
  let headword: String
  let reading: String

  init(key: SavedItemID, note: LearnerWordNote) {
    self.key = key.rawValue
    id = note.id
    text = note.text
    headword = note.headword ?? key.kanji ?? ""
    reading = note.reading ?? ""
  }
}

struct NotesInSearch: Decodable, Hashable, Sendable {
  struct Row: Decodable, Hashable, Sendable {
    let key: String
    let id: String
    let headword: String
    let reading: String
    let before: String
    let match: String
    let after: String

    var place: String { "\(key).\(id)" }

    var spoken: String {
      [headword, reading, before + match + after].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var excerpt: AttributedString {
      var matched = AttributedString(match)
      matched.inlinePresentationIntent = .stronglyEmphasized
      return AttributedString(before) + matched + AttributedString(after)
    }
  }

  let title: String
  let rows: [Row]
}

private struct NotesInSearchRequest: Encodable {
  let query: String
  let notes: [SearchableNote]
}

struct ShownNotes: Hashable, Sendable {
  let query: SearchQuery
  let revision: Int
  let notes: NotesInSearch?

  static func drawnSummary(_ shown: ShownNotes?) -> String {
    shown.map { "\($0.notes?.rows.count ?? 0) notes" } ?? "no search"
  }
}

@MainActor
@Observable
final class LearnerNotes {
  static let shared: LearnerNotes = {
    let shared = LearnerNotes(reading: storedNotes)
    Task { await shared.ready() }
    return shared
  }()

  private nonisolated static func storedNotes() async -> [SearchableNote] {
    await WordNoteStorage.shared.onTheirWords()
  }

  private(set) var notes: [SearchableNote] = []
  private(set) var revision = 0
  @ObservationIgnored private let reading: @Sendable () async -> [SearchableNote]
  @ObservationIgnored private var firstRead: Task<Void, Never>?
  @ObservationIgnored private var latestRead = 0
  @ObservationIgnored private var appliedRead = 0

  init(reading: @escaping @Sendable () async -> [SearchableNote]) {
    self.reading = reading
  }

  func ready() async {
    if firstRead == nil { firstRead = Task { await reload() } }
    await firstRead?.value
  }

  func reload() async {
    latestRead += 1
    let read = latestRead
    let found = await reading()
    guard read > appliedRead else { return }
    appliedRead = read
    guard found != notes else { return }
    notes = found
    revision += 1
  }

  func inSearch(for query: SearchQuery, using core: PresentationCore = .shared) async
    -> ShownNotes
  {
    let notes = notes
    let revision = revision
    guard !notes.isEmpty else { return ShownNotes(query: query, revision: revision, notes: nil) }
    let found = await Self.answer(for: query, in: notes, using: core)
    return ShownNotes(query: query, revision: revision, notes: found)
  }

  private nonisolated static func answer(
    for query: SearchQuery, in notes: [SearchableNote], using core: PresentationCore
  ) async -> NotesInSearch? {
    let asked = NotesInSearchRequest(query: query.value, notes: notes)
    return try? core.answer("notesInSearch", asked) as NotesInSearch?
  }
}
