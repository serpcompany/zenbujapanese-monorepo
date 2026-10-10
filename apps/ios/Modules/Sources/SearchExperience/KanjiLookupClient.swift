import Foundation

struct KanjiCharacter: Codable, Hashable, Sendable {
  let rawValue: String

  init?(_ value: String) {
    guard value.unicodeScalars.count == 1,
      let scalar = value.unicodeScalars.first,
      Self.isIdeograph(scalar.value)
    else { return nil }
    rawValue = value
  }

  var scalar: UInt32 { rawValue.unicodeScalars.first?.value ?? 0 }

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

struct KanjiElementID: Codable, Hashable, Sendable {
  let rawValue: String

  init?(_ value: String) {
    guard let character = KanjiCharacter(value) else { return nil }
    rawValue = character.rawValue
  }
}

struct KanjiPage: Hashable, Sendable {
  struct Stat: Decodable, Hashable, Sendable {
    let kind: String
    let label: String
    let value: String
    let spoken: String
  }

  struct Reading: Hashable, Sendable {
    let kind: String
    let label: String
    let value: String
    let words: [DictionaryEntry]
  }

  struct Element: Decodable, Hashable, Identifiable, Sendable {
    let id: KanjiElementID
    let role: String
    let roleLabel: String
    let meanings: [String]
    let linkedOnReadings: [String]
    let description: String
    let spoken: String

    private enum CodingKeys: String, CodingKey {
      case character
      case role
      case roleLabel
      case meanings
      case linkedOnReadings
      case description
      case spoken
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      id = try container.kanji(KanjiElementID.init, forKey: .character)
      role = try container.decode(String.self, forKey: .role)
      roleLabel = try container.decode(String.self, forKey: .roleLabel)
      meanings = try container.decode([String].self, forKey: .meanings)
      linkedOnReadings = try container.decode([String].self, forKey: .linkedOnReadings)
      description = try container.decode(String.self, forKey: .description)
      spoken = try container.decode(String.self, forKey: .spoken)
    }
  }

  let hasReference: Bool
  let stats: [Stat]
  let meanings: [String]
  let readings: [Reading]
  let components: [String]
  let elements: [Element]
  let words: [DictionaryEntry]
  let shareText: String
}

extension KanjiPage {
  private struct Request: Encodable {
    struct Word: Encodable {
      let id: String
      let headword: String
      let reading: String
      let summary: String
    }

    let character: String
    let words: [Word]
    let leadingWord: String?
  }

  private struct Answer: Decodable {
    struct Word: Decodable {
      let id: String
    }

    struct Reading: Decodable {
      let kind: String
      let label: String
      let value: String
      let words: [Word]
    }

    let hasReference: Bool
    let stats: [Stat]
    let meanings: [String]
    let readings: [Reading]
    let components: [String]
    let elements: [Element]
    let words: [Word]
    let shareText: String
  }

  init(
    _ character: KanjiCharacter, words: [DictionaryEntry], openedFrom: LanguageReferenceID?
  ) throws {
    let answer: Answer = try PresentationCore.shared.answer(
      "kanjiPage",
      Request(
        character: character.rawValue,
        words: words.map {
          Request.Word(
            id: $0.id.rawValue, headword: $0.headword, reading: $0.reading, summary: $0.summary)
        },
        leadingWord: openedFrom?.rawValue))
    let entries = Dictionary(words.map { ($0.id.rawValue, $0) }) { first, _ in first }
    self.init(
      hasReference: answer.hasReference,
      stats: answer.stats,
      meanings: answer.meanings,
      readings: answer.readings.map { reading in
        Reading(
          kind: reading.kind, label: reading.label, value: reading.value,
          words: reading.words.compactMap { entries[$0.id] })
      },
      components: answer.components,
      elements: answer.elements,
      words: answer.words.compactMap { entries[$0.id] },
      shareText: answer.shareText
    )
  }
}

struct KanjiElementPage: Decodable, Hashable, Sendable {
  struct Kanji: Decodable, Hashable, Identifiable, Sendable {
    let character: KanjiCharacter
    let meanings: [String]
    let onReadings: [String]
    let spoken: String

    var id: UInt32 { character.scalar }

    private enum CodingKeys: String, CodingKey {
      case character
      case meanings
      case onReadings
      case spoken
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      character = try container.kanji(KanjiCharacter.init, forKey: .character)
      meanings = try container.decode([String].self, forKey: .meanings)
      onReadings = try container.decode([String].self, forKey: .onReadings)
      spoken = try container.decode(String.self, forKey: .spoken)
    }
  }

  let meanings: [String]
  let explanation: String?
  let soundPatterns: String?
  let alternatives: [String]
  let standalone: Kanji?
  let containing: [Kanji]
  let structureSource: String
  let metadataSource: String
}

extension KeyedDecodingContainer {
  fileprivate func kanji<Kanji>(_ kanji: (String) -> Kanji?, forKey key: Key) throws -> Kanji {
    guard let found = kanji(try decode(String.self, forKey: key)) else {
      throw DecodingError.dataCorruptedError(
        forKey: key, in: self, debugDescription: "Not a kanji")
    }
    return found
  }
}

struct KanjiLookupClient: Sendable {
  var relatedWords: @Sendable (KanjiCharacter) async throws -> [DictionaryEntry]
  var page:
    @Sendable (
      _ character: KanjiCharacter, _ words: [DictionaryEntry], _ openedFrom: LanguageReferenceID?
    ) throws -> KanjiPage
  var meanings: @Sendable (KanjiCharacter) -> [String]
  var element: @Sendable (KanjiElementID) throws -> KanjiElementPage?

  static func live(lookupClient: LookupClient) -> KanjiLookupClient {
    KanjiLookupClient(
      relatedWords: { character in
        try await lookupClient.entriesContainingKanji(character.rawValue)
      },
      page: { character, words, openedFrom in
        try KanjiPage(character, words: words, openedFrom: openedFrom)
      },
      meanings: { character in
        (try? PresentationCore.shared.answer("kanjiMeanings", character.rawValue)) ?? []
      },
      element: { id in try PresentationCore.shared.answer("kanjiElementPage", id.rawValue) }
    )
  }
}
