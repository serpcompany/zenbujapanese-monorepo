import Foundation

struct LearnerFrequency: Encodable, Hashable, Sendable {
  struct Dictionary: Encodable, Hashable, Sendable {
    let id: String
    let kind: FrequencyPackKind
    let name: String
    let domain: String
    let description: String
    let version: String
    let source: String
    let coveredSourceRows: Int

    init(_ pack: FrequencyPackDisclosure) {
      id = pack.id.rawValue
      kind = pack.kind
      name = pack.displayName
      domain = pack.domain
      description = pack.domainDescription
      version = pack.version
      source = pack.attribution
      coveredSourceRows = pack.coveredSourceRows
    }
  }

  struct Lookup: Encodable, Hashable, Sendable {
    let dictionary: Int?
    let value: Int?
    let unavailable: String?

    private enum CodingKeys: String, CodingKey {
      case dictionary
      case value
      case unavailable
    }

    func encode(to encoder: Encoder) throws {
      var container = encoder.container(keyedBy: CodingKeys.self)
      try container.encode(dictionary, forKey: .dictionary)
      if let unavailable {
        try container.encode(unavailable, forKey: .unavailable)
      } else {
        try container.encode(value, forKey: .value)
      }
    }
  }

  let dictionaries: [Dictionary]
  let entries: [String: [Lookup]]

  init(_ ranks: [LanguageReferenceID: FrequencyRanks], for ids: [LanguageReferenceID]) {
    var dictionaries: [Dictionary] = []
    var positions: [FrequencyPackID: Int] = [:]
    func position(of pack: FrequencyPackDisclosure) -> Int {
      if let position = positions[pack.id] { return position }
      positions[pack.id] = dictionaries.count
      dictionaries.append(Dictionary(pack))
      return dictionaries.count - 1
    }
    var entries: [String: [Lookup]] = [:]
    for id in ids {
      guard let results = ranks[id] else { continue }
      entries[id.rawValue] = results.map { result in
        switch result {
        case .evidence(let evidence):
          Lookup(dictionary: position(of: evidence.pack), value: evidence.rank, unavailable: nil)
        case .level(let evidence):
          Lookup(
            dictionary: position(of: evidence.pack), value: evidence.level.rawValue,
            unavailable: nil)
        case .noEvidence(let pack):
          Lookup(dictionary: position(of: pack), value: nil, unavailable: nil)
        case .unavailable(let unavailable):
          Lookup(
            dictionary: unavailable.pack.map(position(of:)), value: nil,
            unavailable: unavailable.reason)
        }
      }
    }
    self.dictionaries = dictionaries
    self.entries = entries
  }

  static func unavailable(for ids: [LanguageReferenceID], reason: String) -> LearnerFrequency {
    LearnerFrequency(
      FrequencyLookupResult.unavailableResults(for: ids, pack: nil, reason: reason)
        .mapValues { [$0] },
      for: ids)
  }
}
