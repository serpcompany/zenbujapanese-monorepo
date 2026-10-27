import Foundation

struct LinkedWordEntry: Hashable, Identifiable, Sendable {
  let id: LanguageReferenceID
  let headword: String
  let reading: String
  let summary: String
  let gloss: String?
}

extension LinkedWordEntry: Decodable {
  private enum CodingKeys: String, CodingKey {
    case id, headword, reading, summary, gloss
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = LanguageReferenceID(rawValue: try container.decode(String.self, forKey: .id))
    headword = try container.decode(String.self, forKey: .headword)
    reading = try container.decode(String.self, forKey: .reading)
    summary = try container.decode(String.self, forKey: .summary)
    gloss = try container.decodeIfPresent(String.self, forKey: .gloss)
  }
}

struct JapaneseTextToken: Identifiable, Sendable {
  enum Accent: String, Decodable, Sendable {
    case entry
    case query
  }

  let id: Int
  let surface: String
  let entry: LinkedWordEntry?
  let candidateEntries: [LinkedWordEntry]
  let scalarRange: Range<Int>
  let reading: String?
  let ruby: JapaneseRuby?
  let isFunctionWord: Bool
  let accent: Accent?
  let lineBreak: JapaneseTokenLineBreakBehavior

  init(
    id: Int,
    surface: String,
    entry: LinkedWordEntry?,
    candidateEntries: [LinkedWordEntry] = [],
    scalarRange: Range<Int> = 0..<0,
    reading: String? = nil,
    ruby: JapaneseRuby? = nil,
    isFunctionWord: Bool = false,
    accent: Accent? = nil,
    lineBreak: JapaneseTokenLineBreakBehavior = .normal
  ) {
    self.id = id
    self.surface = surface
    self.entry = entry
    self.candidateEntries = candidateEntries
    self.scalarRange = scalarRange
    self.reading = reading
    self.ruby = ruby
    self.isFunctionWord = isFunctionWord
    self.accent = accent
    self.lineBreak = lineBreak
  }

  init(_ index: Int, _ word: LinkedWord) {
    self.init(
      id: index,
      surface: word.surface,
      entry: word.entry,
      candidateEntries: word.entry.map { [$0] } ?? word.candidates,
      scalarRange: word.start..<word.end,
      reading: word.reading,
      ruby: word.ruby.map {
        JapaneseRuby(surface: word.surface, reading: word.furigana ?? "", segments: $0)
      },
      isFunctionWord: word.isFunctionWord,
      accent: word.accent,
      lineBreak: JapaneseTokenLineBreakBehavior(attaching: word.attaches)
    )
  }

  static func words(_ linked: [LinkedWord]) -> [JapaneseTextToken] {
    linked.enumerated().map { JapaneseTextToken($0.offset, $0.element) }
  }

  static func unlinked(_ text: String) -> [JapaneseTextToken] {
    guard !text.isEmpty else { return [] }
    return [
      JapaneseTextToken(
        id: 0, surface: text, entry: nil, scalarRange: 0..<text.unicodeScalars.count)
    ]
  }
}

struct JapaneseTextAnalysisClient: Sendable {
  var availability: @Sendable () async -> JapaneseTextAnalysisAvailability
  var linkedTexts:
    @Sendable (_ texts: [String], _ highlightedEntry: LanguageReferenceID?) async
      -> [[JapaneseTextToken]]?
  var countedWords: @Sendable (_ lines: [String]) async -> [LanguageReferenceID]

  static func live(text: DictionaryTextData = .shared) -> JapaneseTextAnalysisClient {
    JapaneseTextAnalysisClient(
      availability: { await text.availability() },
      linkedTexts: { texts, highlightedEntry in
        guard !texts.isEmpty else { return [] }
        let request = TextsToLink(texts: texts, highlightedEntry: highlightedEntry?.rawValue)
        guard let linked = try? await text.linkedTexts(request), linked.count == texts.count
        else { return nil }
        return linked.map(JapaneseTextToken.words)
      },
      countedWords: { lines in
        ((try? await text.countedWords(lines)) ?? []).map(LanguageReferenceID.init(rawValue:))
      }
    )
  }

  func linkedTokens(_ text: String) async -> [JapaneseTextToken] {
    await linked([text])[0]
  }

  func linked(_ texts: [String]) async -> [[JapaneseTextToken]] {
    guard let linked = await linkedTexts(texts, nil), linked.count == texts.count else {
      return texts.map(JapaneseTextToken.unlinked)
    }
    return linked
  }
}
