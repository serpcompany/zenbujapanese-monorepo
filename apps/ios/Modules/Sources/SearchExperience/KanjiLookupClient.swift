import Foundation

struct KanjiReading: Codable, Hashable, Sendable {
  let value: String
  let kind: Kind

  enum Kind: String, Codable, Hashable, Sendable {
    case on
    case kun
    case name
  }
}

struct KanjiCharacter: Codable, Hashable, Sendable {
  let rawValue: String

  init?(_ value: String) {
    guard value.unicodeScalars.count == 1,
      let scalar = value.unicodeScalars.first,
      Self.isIdeograph(scalar.value)
    else { return nil }
    rawValue = value
  }

  private static func isIdeograph(_ value: UInt32) -> Bool {
    switch value {
    case 0x3400...0x4DBF, 0x4E00...0x9FFF, 0xF900...0xFAFF,
      0x20000...0x2FA1F, 0x30000...0x323AF:
      true
    default:
      false
    }
  }
}

struct KanjiReferenceEntry: Codable, Hashable, Sendable {
  let character: String
  let strokeCount: Int
  let commonMiscounts: [Int]
  let grade: Int?
  let jlpt: Int?
  let frequencyRank: Int?
  let classicalRadicalNumber: Int?
  let meanings: [String]
  let readings: [KanjiReading]
  let components: [String]

  var onReadings: [String] {
    readings.filter { $0.kind == .on }.map(\.value)
  }

  var kunReadings: [String] {
    readings.filter { $0.kind == .kun }.map(\.value)
  }

  var nameReadings: [String] {
    readings.filter { $0.kind == .name }.map(\.value)
  }
}

struct KanjiReferenceCatalog: Codable, Sendable {
  let snapshot: String
  let metadataSourceIdentity: String
  let componentSourceIdentity: String
  let entries: [KanjiReferenceEntry]
}

struct KanjiLookupClient: Sendable {
  var entry: @Sendable (KanjiCharacter) async throws -> KanjiReferenceEntry?
  var relatedWords: @Sendable (KanjiCharacter) async throws -> [DictionaryEntry]

  static func live(lookupClient: LookupClient) -> KanjiLookupClient {
    KanjiLookupClient(
      entry: { character in try await KanjiReferenceData.shared.entry(character) },
      relatedWords: { character in try await lookupClient.entriesContainingKanji(character.rawValue)
      }
    )
  }

  #if DEBUG
    static func clientFromProcessArguments(live: KanjiLookupClient) -> KanjiLookupClient? {
      guard ProcessInfo.processInfo.arguments.contains("-InjectKanjiRelatedWordsFailureOnce") else {
        return nil
      }
      let fixture = KanjiRelatedWordsFailureFixture()
      return KanjiLookupClient(
        entry: live.entry,
        relatedWords: { character in
          if await fixture.consumeFailure() {
            throw KanjiLookupFixtureError.injectedFailure
          }
          return try await live.relatedWords(character)
        }
      )
    }
  #endif
}

#if DEBUG
  private actor KanjiRelatedWordsFailureFixture {
    private var hasFailed = false

    func consumeFailure() -> Bool {
      guard !hasFailed else { return false }
      hasFailed = true
      return true
    }
  }

  private enum KanjiLookupFixtureError: Error {
    case injectedFailure
  }
#endif

private actor KanjiReferenceData {
  static let shared = KanjiReferenceData()
  private var entriesByScalar: [UInt32: KanjiReferenceEntry]?

  func entry(_ character: KanjiCharacter) throws -> KanjiReferenceEntry? {
    let scalar = character.rawValue.unicodeScalars.first!.value
    if let entriesByScalar { return entriesByScalar[scalar] }
    guard let url = Bundle.module.url(forResource: "KanjiReferenceData", withExtension: "json")
    else {
      throw KanjiReferenceDataError.missingBundledData
    }
    let catalog = try JSONDecoder().decode(KanjiReferenceCatalog.self, from: Data(contentsOf: url))
    let indexed = Dictionary(
      uniqueKeysWithValues: catalog.entries.compactMap { entry in
        entry.character.unicodeScalars.first.map { ($0.value, entry) }
      }
    )
    entriesByScalar = indexed
    return indexed[scalar]
  }
}

private enum KanjiReferenceDataError: Error {
  case missingBundledData
}
