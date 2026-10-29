import Foundation

struct KnownByDate: Decodable, Hashable, Sendable {
  struct Day: Decodable, Hashable, Identifiable, Sendable {
    let day: String
    let markedKnown: [String]
    let count: Int

    var id: String { day }
  }

  let week: Int
  let days: [Day]
  let total: Int
  let change: Int?
  let hasEarlier: Bool
  let hasLater: Bool
  let firstDay: String
}

struct KnownByDateRequest: Encodable, Hashable, Sendable {
  let days: [String: ProgressLogDay]
  let today: String
  let week: Int
}

extension ProgressLog {
  func knownByDate(week: Int, using core: PresentationCore = .shared) async -> KnownByDate? {
    let request = KnownByDateRequest(days: days, today: day(of: now()), week: week)
    guard let asked = try? JSONEncoder.localStore.encode(request) else { return nil }
    return try? core.answer("knownByDate", String(decoding: asked, as: UTF8.self))
  }
}

extension KnownByDate.Day {
  func records(in knowledge: [String: WordKnowledgeRecord]) -> [WordKnowledgeRecord] {
    markedKnown.map { id in
      knowledge[id]
        ?? WordKnowledgeRecord(
          entryID: id, headword: SavedItem.kanji(storedID: id)?.rawValue ?? "", reading: "",
          status: .unknown, updatedAt: .distantPast)
    }
  }
}
