import Foundation

struct JapaneseTextToken: Identifiable, Sendable {
  let id: Int
  let surface: String
  let entry: DictionaryEntry?

  func represents(_ entry: DictionaryEntry) -> Bool {
    self.entry?.id == entry.id
  }
}

struct JapaneseRubySegment: Hashable, Sendable {
  let base: String
  let reading: String?
}

enum JapaneseRubyAnnotation {
  static func segments(surface: String, reading: String) -> [JapaneseRubySegment] {
    guard surface.contains(where: \.isKanjiOrIterationMark), surface != reading else {
      return [JapaneseRubySegment(base: surface, reading: nil)]
    }
    let runs = surfaceRuns(surface)
    guard runs.contains(where: \.isKanji), runs.contains(where: { !$0.isKanji }) else {
      return [JapaneseRubySegment(base: surface, reading: reading)]
    }
    return alignedSegments(runs: runs, reading: reading)
      ?? runs.map { JapaneseRubySegment(base: $0.base, reading: nil) }
  }

  private struct SurfaceRun {
    var base: String
    let isKanji: Bool
  }

  private static func surfaceRuns(_ surface: String) -> [SurfaceRun] {
    var runs: [SurfaceRun] = []
    for character in surface {
      let isKanji = character.isKanjiOrIterationMark
      if runs.last?.isKanji == isKanji {
        runs[runs.count - 1].base.append(character)
      } else {
        runs.append(SurfaceRun(base: String(character), isKanji: isKanji))
      }
    }
    return runs
  }

  private static func alignedSegments(
    runs: [SurfaceRun],
    reading: String
  ) -> [JapaneseRubySegment]? {
    let originalReading = Array(reading)
    let normalizedReading = normalizedKana(reading)
    var cursor = 0
    var segments: [JapaneseRubySegment] = []

    for (index, run) in runs.enumerated() {
      if run.isKanji {
        if let nextKana = runs[(index + 1)...].first(where: { !$0.isKanji }) {
          let anchor = normalizedKana(nextKana.base)
          guard let anchorStart = firstIndex(
            of: anchor,
            in: normalizedReading,
            startingAt: cursor + 1
          ) else { return nil }
          let ruby = String(originalReading[cursor..<anchorStart])
          guard !ruby.isEmpty else { return nil }
          segments.append(JapaneseRubySegment(base: run.base, reading: ruby))
          cursor = anchorStart
        } else {
          guard cursor < originalReading.count else { return nil }
          segments.append(
            JapaneseRubySegment(
              base: run.base,
              reading: String(originalReading[cursor...])
            )
          )
          cursor = originalReading.count
        }
      } else {
        let anchor = normalizedKana(run.base)
        guard cursor + anchor.count <= normalizedReading.count,
          Array(normalizedReading[cursor..<(cursor + anchor.count)]) == anchor
        else { return nil }
        segments.append(JapaneseRubySegment(base: run.base, reading: nil))
        cursor += anchor.count
      }
    }
    return cursor == originalReading.count ? segments : nil
  }

  private static func normalizedKana(_ value: String) -> [Character] {
    Array(value.applyingTransform(.hiraganaToKatakana, reverse: true) ?? value)
  }

  private static func firstIndex(
    of needle: [Character],
    in haystack: [Character],
    startingAt start: Int
  ) -> Int? {
    guard !needle.isEmpty, start >= 0, start + needle.count <= haystack.count else { return nil }
    for index in start...(haystack.count - needle.count) {
      if Array(haystack[index..<(index + needle.count)]) == needle { return index }
    }
    return nil
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
      if query.isMixedScript {
        let leadingParticles = ["には", "では", "に", "で", "を", "が", "は", "へ", "と", "も"]
        return query.japaneseSegments.compactMap { segment in
          let particle = leadingParticles.first { prefix in
            segment.value.hasPrefix(prefix) && segment.value.count > prefix.count
          }
          return SearchQuery(particle.map { String(segment.value.dropFirst($0.count)) } ?? segment.value)
        }
      }
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
  private var entryCache: [String: [DictionaryEntry]] = [:]

  func tokens(
    for text: String,
    highlightedQuery: SearchQuery,
    highlightedEntry: DictionaryEntry?,
    lookupClient: LookupClient
  ) async -> [JapaneseTextToken] {
    let characters = Array(text)
    let highlightedForms =
      highlightedEntry.map {
        Self.forms(for: $0, preferred: highlightedQuery.value)
      } ?? (highlightedQuery.isEmpty ? [] : [highlightedQuery.value])
    var tokens: [JapaneseTextToken] = []
    var position = 0

    while position < characters.count {
      if let highlightedSurface = Self.longestForm(
        in: characters,
        at: position,
        forms: highlightedForms
      ) {
        let entry: DictionaryEntry?
        if let highlightedEntry {
          entry = highlightedEntry
        } else {
          let candidates = await entries(for: highlightedSurface, lookupClient: lookupClient)
          entry = candidates.count == 1 ? candidates[0] : nil
        }
        tokens.append(
          JapaneseTextToken(
            id: tokens.count,
            surface: highlightedSurface,
            entry: entry
          )
        )
        position += highlightedSurface.count
        continue
      }

      if characters[position].isJapaneseLanguageItemStart,
        let match = await longestMatch(
          in: characters,
          at: position,
          preserving: Self.nextFormRange(
            in: characters,
            after: position,
            forms: highlightedForms
          ),
          lookupClient: lookupClient
        )
      {
        tokens.append(
          JapaneseTextToken(id: tokens.count, surface: match.surface, entry: match.entry))
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
    preserving reservedRange: Range<Int>?,
    lookupClient: LookupClient
  ) async -> (surface: String, entry: DictionaryEntry?)? {
    var length = 0
    while position + length < characters.count,
      length < 8,
      characters[position + length].isJapaneseLanguageItem
    {
      length += 1
    }

    for candidateLength in stride(from: length, through: 1, by: -1) {
      let candidateEnd = position + candidateLength
      if let reservedRange,
        candidateEnd > reservedRange.lowerBound,
        candidateEnd < reservedRange.upperBound
      {
        continue
      }
      let surface = String(characters[position..<(position + candidateLength)])
      let directEntries = await entries(for: surface, lookupClient: lookupClient)
      if !directEntries.isEmpty {
        return (surface, directEntries.count == 1 ? directEntries[0] : nil)
      }
      var deinflectedEntries: [LanguageReferenceID: DictionaryEntry] = [:]
      for baseForm in deinflectedForms(for: surface) {
        for entry in await entries(for: baseForm, lookupClient: lookupClient) {
          deinflectedEntries[entry.id] = entry
        }
      }
      if !deinflectedEntries.isEmpty {
        return (
          surface,
          deinflectedEntries.count == 1 ? deinflectedEntries.values.first : nil
        )
      }
    }
    return nil
  }

  private static func forms(for entry: DictionaryEntry, preferred: String) -> [String] {
    var seen = Set<String>()
    return
      ([preferred, entry.headword, entry.reading]
      + entry.writtenForms.map(\.value)
      + entry.readingForms.map(\.value))
      .filter { !$0.isEmpty && seen.insert($0).inserted }
      .sorted { $0.count > $1.count }
  }

  private static func longestForm(
    in characters: [Character],
    at position: Int,
    forms: [String]
  ) -> String? {
    forms.first { form in
      let candidate = Array(form)
      return position + candidate.count <= characters.count
        && Array(characters[position..<(position + candidate.count)]) == candidate
    }
  }

  private static func nextFormRange(
    in characters: [Character],
    after position: Int,
    forms: [String]
  ) -> Range<Int>? {
    guard !forms.isEmpty, position + 1 < characters.count else { return nil }
    for start in (position + 1)..<characters.count {
      if let form = longestForm(in: characters, at: start, forms: forms) {
        return start..<(start + form.count)
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

  private func entries(for surface: String, lookupClient: LookupClient) async -> [DictionaryEntry] {
    if let cached = entryCache[surface] { return cached }
    do {
      let entries = try await lookupClient.entriesMatchingForm(surface)
      entryCache[surface] = entries
      return entries
    } catch {
      return []
    }
  }
}

private extension Character {
  var isJapaneseLanguageItemStart: Bool {
    isKanjiOrIterationMark || unicodeScalars.allSatisfy {
      (0x3040...0x30FF).contains(Int($0.value))
    }
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
