import Foundation

struct SchoolKanjiRequest: Encodable, Hashable, Sendable {
  let filter: String
  let known: [String]
}

struct SchoolKanjiPanel: Decodable, Hashable, Sendable {
  struct Tile: Decodable, Hashable, Sendable {
    let character: String
    let meaning: String
    let known: Bool
  }

  struct Section: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let title: String
    let count: String
    let known: Int
    let spoken: String
    let kanji: [Tile]
  }

  let filtered: Bool
  let sections: [Section]
}

struct SchoolKanjiClient: Sendable {
  let panel: @Sendable (_ request: SchoolKanjiRequest) throws -> SchoolKanjiPanel

  static let live = SchoolKanjiClient { try PresentationCore.shared.answer("schoolKanjiPanel", $0) }
}
