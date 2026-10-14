import Foundation

struct JapaneseTextToken: Identifiable, Sendable {
  let id: Int
  let surface: String
  let entry: DictionaryEntry?
  let candidateEntries: [DictionaryEntry]
  let scalarRange: Range<Int>
  let reading: String?
  let ruby: JapaneseRuby?
  let isFunctionWord: Bool
  let isPageWord: Bool
  let matchesQuery: Bool
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
    isPageWord: Bool = false,
    matchesQuery: Bool = false,
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
    self.isPageWord = isPageWord
    self.matchesQuery = matchesQuery
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
    text: DictionaryTextData = .shared, lookupClient: LookupClient = .live
  ) -> JapaneseTextAnalysisClient {
    let linked = LinkedEntries(lookupClient: lookupClient)
    return JapaneseTextAnalysisClient(
      availability: { await text.availability() },
      linkedTokens: { japanese, highlightedQuery, highlightedEntry in
        guard
          let words = try? await text.linkedWords(
            LinkedText(
              text: japanese, query: highlightedQuery.value,
              highlightedEntry: highlightedEntry?.id.rawValue))
        else { return [] }
        return await linked.tokens(words, highlightedEntry: highlightedEntry)
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
    _ words: [LinkedWord], highlightedEntry: DictionaryEntry?
  ) async -> [JapaneseTextToken] {
    var found: [String: DictionaryEntry] = [:]
    if let highlightedEntry { found[highlightedEntry.id.rawValue] = highlightedEntry }
    var unread: [LanguageReferenceID] = []
    for id in Set(words.flatMap { $0.candidates + [$0.entry].compactMap { $0 } })
    where found[id] == nil {
      if let entry = entries[id] {
        found[id] = entry
      } else {
        unread.append(LanguageReferenceID(rawValue: id))
      }
    }
    if !unread.isEmpty, let read = try? await lookupClient.entries(unread) {
      for (id, entry) in read { found[id.rawValue] = entry }
    }
    keep(found)
    return words.enumerated().map { index, word in
      let entry = word.entry.flatMap { found[$0] }
      return JapaneseTextToken(
        id: index,
        surface: word.surface,
        entry: entry,
        candidateEntries: entry.map { [$0] } ?? word.candidates.compactMap { found[$0] },
        scalarRange: word.start..<word.end,
        reading: word.reading,
        ruby: word.ruby.map {
          JapaneseRuby(surface: word.surface, reading: word.furigana ?? "", segments: $0)
        },
        isFunctionWord: word.isFunctionWord,
        isPageWord: word.isPageWord,
        matchesQuery: word.matchesQuery,
        lineBreak: JapaneseTokenLineBreakBehavior(attaching: word.attaches)
      )
    }
  }

  private func keep(_ found: [String: DictionaryEntry]) {
    let added = found.keys.count { entries[$0] == nil }
    if entries.count + added > Self.capacity {
      entries = found
    } else {
      entries.merge(found) { _, new in new }
    }
  }

  static let capacity = 4_000
}
