import Foundation

struct JapaneseTextToken: Identifiable, Sendable {
  enum Accent: String, Decodable, Sendable {
    case entry
    case query
  }

  let id: Int
  let surface: String
  let entry: DictionaryEntry?
  let candidateEntries: [DictionaryEntry]
  let scalarRange: Range<Int>
  let reading: String?
  let ruby: JapaneseRuby?
  let isFunctionWord: Bool
  let accent: Accent?
  let lineBreak: JapaneseTokenLineBreakBehavior

  init(
    id: Int,
    surface: String,
    entry: DictionaryEntry?,
    candidateEntries: [DictionaryEntry] = [],
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
}

struct JapaneseTextAnalysisClient: Sendable {
  var availability: @Sendable () async -> JapaneseTextAnalysisAvailability
  var linkedTokens:
    @Sendable (
      _ text: String,
      _ highlightedQuery: SearchQuery,
      _ highlightedEntry: DictionaryEntry?
    ) async -> [JapaneseTextToken]
  var countedWords: @Sendable (_ lines: [String]) async -> [LanguageReferenceID]

  static func live(
    text: DictionaryTextData = .shared, linked: LinkedEntries = LinkedEntries(lookupClient: .live)
  ) -> JapaneseTextAnalysisClient {
    JapaneseTextAnalysisClient(
      availability: { await text.availability() },
      linkedTokens: { japanese, highlightedQuery, highlightedEntry in
        guard
          let words = try? await text.linkedWords(
            LinkedText(
              text: japanese, query: highlightedQuery.value,
              highlightedEntry: highlightedEntry?.id.rawValue))
        else { return [] }
        return await linked.tokens([words], highlightedEntry: highlightedEntry)[0]
      },
      countedWords: { lines in
        ((try? await text.countedWords(lines)) ?? []).map(LanguageReferenceID.init(rawValue:))
      }
    )
  }
}

actor LinkedEntries {
  private let lookupClient: LookupClient
  private var entries: [String: DictionaryEntry] = [:]

  init(lookupClient: LookupClient) {
    self.lookupClient = lookupClient
  }

  func tokens(
    _ texts: [[LinkedWord]], highlightedEntry: DictionaryEntry?
  ) async -> [[JapaneseTextToken]] {
    if let highlightedEntry { entries[highlightedEntry.id.rawValue] = highlightedEntry }
    var named: [String: DictionaryEntry] = [:]
    var unread: [LanguageReferenceID] = []
    for id in Set(texts.joined().flatMap { $0.candidates + [$0.entry].compactMap { $0 } }) {
      if let entry = entries[id] {
        named[id] = entry
      } else {
        unread.append(LanguageReferenceID(rawValue: id))
      }
    }
    if !unread.isEmpty, let read = try? await lookupClient.entries(unread) {
      if entries.count + read.count > Self.capacity { entries.removeAll(keepingCapacity: true) }
      for (id, entry) in read {
        entries[id.rawValue] = entry
        named[id.rawValue] = entry
      }
    }
    return texts.map { words in
      words.enumerated().map { Self.token($0.offset, $0.element, named: named) }
    }
  }

  private static func token(
    _ index: Int, _ word: LinkedWord, named entries: [String: DictionaryEntry]
  ) -> JapaneseTextToken {
    let entry = word.entry.flatMap { entries[$0] }
    return JapaneseTextToken(
      id: index,
      surface: word.surface,
      entry: entry,
      candidateEntries: entry.map { [$0] } ?? word.candidates.compactMap { entries[$0] },
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

  static let capacity = 4_000
}
