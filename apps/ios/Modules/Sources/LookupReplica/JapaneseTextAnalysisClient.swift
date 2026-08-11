import Foundation

struct JapaneseTextToken: Identifiable, Sendable {
  let id: Int
  let surface: String
  let entry: DictionaryEntry?

  var showsReading: Bool {
    guard let entry, entry.reading != surface else { return false }
    return surface.contains(where: \.isKanjiOrIterationMark)
  }
}

struct JapaneseTextAnalysisClient: Sendable {
  var lookupSegments: @Sendable (SearchQuery) -> [SearchQuery]
  var linkedTokens: @Sendable (
    _ text: String,
    _ highlightedQuery: SearchQuery,
    _ highlightedEntry: DictionaryEntry?
  ) async -> [JapaneseTextToken]

  static let characterFallback = JapaneseTextAnalysisClient(
    lookupSegments: { query in
      guard query.value.count > 1 else { return [] }
      let segments = query.value.map { SearchQuery(String($0)) }
      guard segments.allSatisfy({ $0.japaneseSegments == [$0] }) else { return [] }
      return segments
    },
    linkedTokens: { _, _, _ in [] }
  )

  static func live(lookupClient: LookupClient) -> JapaneseTextAnalysisClient {
    let analyzer = JapaneseTextAnalyzer()
    return JapaneseTextAnalysisClient(
      lookupSegments: characterFallback.lookupSegments,
      linkedTokens: { text, highlightedQuery, highlightedEntry in
        await analyzer.tokens(
          for: text,
          highlightedQuery: highlightedQuery,
          highlightedEntry: highlightedEntry,
          lookupClient: lookupClient
        )
      }
    )
  }
}

private actor JapaneseTextAnalyzer {
  private var entryCache: [String: DictionaryEntry] = [:]

  func tokens(
    for text: String,
    highlightedQuery: SearchQuery,
    highlightedEntry: DictionaryEntry?,
    lookupClient: LookupClient
  ) async -> [JapaneseTextToken] {
    let characters = Array(text)
    let highlightedCharacters = Array(highlightedQuery.value)
    var tokens: [JapaneseTextToken] = []
    var position = 0

    while position < characters.count {
      if let highlightedEntry,
        !highlightedCharacters.isEmpty,
        position + highlightedCharacters.count <= characters.count,
        Array(characters[position..<(position + highlightedCharacters.count)]) == highlightedCharacters
      {
        tokens.append(
          JapaneseTextToken(
            id: tokens.count,
            surface: highlightedQuery.value,
            entry: highlightedEntry
          )
        )
        position += highlightedCharacters.count
        continue
      }

      if characters[position].isJapaneseLanguageItemStart,
        let match = await longestMatch(in: characters, at: position, lookupClient: lookupClient)
      {
        tokens.append(JapaneseTextToken(id: tokens.count, surface: match.surface, entry: match.entry))
        position += match.surface.count
      } else {
        tokens.append(
          JapaneseTextToken(id: tokens.count, surface: String(characters[position]), entry: nil)
        )
        position += 1
      }
    }
    return tokens
  }

  private func longestMatch(
    in characters: [Character],
    at position: Int,
    lookupClient: LookupClient
  ) async -> (surface: String, entry: DictionaryEntry)? {
    var length = 0
    while position + length < characters.count,
      length < 8,
      characters[position + length].isJapaneseLanguageItem
    {
      length += 1
    }

    for candidateLength in stride(from: length, through: 1, by: -1) {
      let surface = String(characters[position..<(position + candidateLength)])
      if let entry = await entry(for: surface, lookupClient: lookupClient) {
        return (surface, entry)
      }
      for baseForm in deinflectedForms(for: surface) {
        if let entry = await entry(for: baseForm, lookupClient: lookupClient) {
          return (surface, entry)
        }
      }
    }
    return nil
  }

  private func deinflectedForms(for surface: String) -> [String] {
    if surface == "して" { return ["する"] }
    if surface == "きて" || surface == "来て" { return ["くる", "来る"] }
    guard surface.hasSuffix("て"), surface.count > 1 else { return [] }
    return [String(surface.dropLast()) + "る"]
  }

  private func entry(for surface: String, lookupClient: LookupClient) async -> DictionaryEntry? {
    if let cached = entryCache[surface] { return cached }
    do {
      guard let entry = try await lookupClient.entryMatchingForm(surface) else { return nil }
      entryCache[surface] = entry
      return entry
    } catch {
      return nil
    }
  }
}

private extension Character {
  var isJapaneseLanguageItemStart: Bool {
    isKanjiOrIterationMark || unicodeScalars.allSatisfy { (0x30A0...0x30FF).contains(Int($0.value)) }
  }

  var isJapaneseLanguageItem: Bool {
    isKanjiOrIterationMark || unicodeScalars.allSatisfy {
      (0x3040...0x30FF).contains(Int($0.value))
    }
  }

  var isKanjiOrIterationMark: Bool {
    self == "々" || unicodeScalars.contains {
      (0x3400...0x9FFF).contains(Int($0.value))
    }
  }
}
