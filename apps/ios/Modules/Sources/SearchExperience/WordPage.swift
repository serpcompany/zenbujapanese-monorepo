import Foundation

struct WordPage: Decodable, Hashable, Sendable {
  struct Section: Decodable, Hashable, Sendable {
    enum Kind: String, Decodable, Hashable, Sendable {
      case meaning
      case frequency
      case conjugations
      case alternatives
      case kanji
      case alternativeKanji
      case related
      case lists
      case notes
      case examples
    }

    let kind: Kind
    let title: String
  }

  struct Pitch: Decodable, Hashable, Sendable {
    struct Mora: Decodable, Hashable, Sendable {
      let mora: String
      let high: Bool
    }

    struct Point: Decodable, Hashable, Sendable {
      let x: Double
      let high: Bool
    }

    struct Graph: Decodable, Hashable, Sendable {
      let widths: [Double]
      let points: [Point]
      let particle: Point
      let width: Double
    }

    let morae: [Mora]
    let downstep: Int
    let moraCount: Int
    let particleHigh: Bool
    let graph: Graph
    let source: String
    let spoken: String
  }

  struct Sense: Decodable, Hashable, Sendable {
    let number: Int
    let meaning: String
    let notes: [String]
    let noteText: String?
  }

  struct AlternativeForm: Decodable, Hashable, Sendable {
    let value: String
    let kind: DictionaryForm.Kind
    let labels: [String]
    let labelText: String?
    let kanji: String?
  }

  struct Related: Decodable, Hashable, Sendable {
    let headword: String
    let reading: String
    let ruby: [JapaneseRubySegment]
    let relation: String
    let summary: String
    let description: String
  }

  let sections: [Section]
  let ruby: [JapaneseRubySegment]
  let partOfSpeech: String
  let partOfSpeechRow: String
  let pronounce: String
  let conjugations: Conjugations?
  let pitch: Pitch?
  let senses: [Sense]
  let alternatives: [AlternativeForm]
  let kanji: [String]
  let alternativeKanji: [String]
  let frequency: [FrequencyRow]
  let related: [Related]
  let noExamples: String
  let shareText: String
}

struct Conjugations: Decodable, Hashable, Sendable {
  struct Examples: Decodable, Hashable, Sendable {
    let title: String
    let empty: String
  }

  let title: String
  struct Row: Decodable, Hashable, Identifiable, Sendable {
    let kind: String
    let surface: String
    let reading: String
    let ending: String
    let title: String
    let explanation: String
    let ruby: [JapaneseRubySegment]
    let rowFurigana: Bool
    let sharedSpellings: [String]
    let note: String?
    let pronounce: String

    var id: String { kind }
  }

  let rule: String
  let modes: [String]
  let rows: [String: [Row]]
  let examples: Examples
}

extension WordPage {
  struct Frame: Decodable, Hashable, Sendable {
    let sections: [Section]
    let pronounce: String
    let noExamples: String
  }

  static func frame(
    for entry: DictionaryEntry, page: WordPage?, using core: PresentationCore = .shared
  ) -> Frame? {
    if let page {
      return Frame(sections: page.sections, pronounce: page.pronounce, noExamples: page.noExamples)
    }
    return try? core.answer("wordPageWithoutContent", entry.reading)
  }

  private struct Entry: Encodable {
    let id: String
    let headword: String
    let reading: String
    let summary: String
    let partsOfSpeech: [PartOfSpeech]
    let writtenForms: [DictionaryForm]
    let readingForms: [DictionaryForm]
    let senses: [DictionarySense]
    let relationships: [DictionaryRelationship]
    let pitch: PitchAccent?
    let compoundPitch: PitchAccent?

    init(_ entry: DictionaryEntry) {
      id = entry.id.rawValue
      headword = entry.headword
      reading = entry.reading
      summary = entry.summary
      partsOfSpeech = entry.partsOfSpeech
      writtenForms = entry.writtenForms
      readingForms = entry.readingForms
      senses = entry.senses
      relationships = entry.relationships
      pitch = entry.pitch
      compoundPitch = entry.compoundPitch
    }
  }

  init?(_ entry: DictionaryEntry, using core: PresentationCore = .shared) {
    guard let page = core.wordPage(of: entry.id, asking: { try DictionaryCore.argument(Entry(entry)) })
    else { return nil }
    self = page
  }
}
