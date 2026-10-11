import Foundation

struct RadicalComponent: Decodable, Hashable, Identifiable, Sendable {
  let id: String
  let glyph: String
}

struct RadicalPanel: Decodable, Hashable, Sendable {
  struct Group: Decodable, Hashable, Sendable {
    let strokeCount: Int
    let label: String
    let radicals: [RadicalComponent]
  }

  let candidates: [String]
  let groups: [Group]
}

struct RadicalLookupClient: Sendable {
  let panel: @Sendable (_ selected: [String]) throws -> RadicalPanel

  static let live = RadicalLookupClient { try PresentationCore.shared.answer("radicalPanel", $0) }

  static func bundledFile() -> [UInt8]? {
    Bundle.module.url(forResource: "RadicalReferenceData", withExtension: "json")
      .flatMap { try? Data(contentsOf: $0) }
      .map { Array($0) + [0] }
  }
}
