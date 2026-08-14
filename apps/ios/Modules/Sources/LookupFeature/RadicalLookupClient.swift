import Foundation

struct RadicalComponent: Codable, Hashable, Identifiable, Sendable {
  let id: String
  let glyph: String
  let strokeCount: Int
}

struct RadicalCharacter: Codable, Hashable, Sendable {
  let value: String
  let components: [String]
}

struct RadicalCatalog: Codable, Sendable {
  let snapshot: String
  let sourceIdentity: String
  let components: [RadicalComponent]
  let characters: [RadicalCharacter]

  func candidates(matching selectedComponents: Set<String>) -> [RadicalCharacter] {
    guard !selectedComponents.isEmpty else { return [] }
    return characters
      .filter { selectedComponents.isSubset(of: Set($0.components)) }
      .sorted { lhs, rhs in
        let lhsExtraCount = lhs.components.count - selectedComponents.count
        let rhsExtraCount = rhs.components.count - selectedComponents.count
        if lhsExtraCount != rhsExtraCount { return lhsExtraCount < rhsExtraCount }
        return lhs.value < rhs.value
      }
  }

  func componentGroups(matching candidates: [RadicalCharacter]) -> [(strokeCount: Int, values: [RadicalComponent])] {
    let availableIDs = candidates.isEmpty
      ? Set(components.map(\.id))
      : Set(candidates.flatMap(\.components))
    return Dictionary(grouping: components.filter { availableIDs.contains($0.id) }, by: \.strokeCount)
      .map { ($0.key, $0.value) }
      .sorted { $0.strokeCount < $1.strokeCount }
  }
}

struct RadicalLookupClient: Sendable {
  let load: @Sendable () throws -> RadicalCatalog

  static let live = RadicalLookupClient {
    guard let resourceURL = Bundle.module.url(forResource: "RadicalReferenceData", withExtension: "json") else {
      throw RadicalLookupError.missingBundledData
    }
    return try JSONDecoder().decode(RadicalCatalog.self, from: Data(contentsOf: resourceURL))
  }
}

enum RadicalLookupError: Error {
  case missingBundledData
}
