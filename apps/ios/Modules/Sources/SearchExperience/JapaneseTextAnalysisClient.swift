import Foundation

struct JapaneseTextToken: Identifiable, Sendable {
  let id: Int
  let surface: String
  let entry: DictionaryEntry?
  let scalarRange: Range<Int>
  let dictionaryForm: String?
  let reading: String?
  let partOfSpeech: [String]
  let isOutOfVocabulary: Bool?

  init(
    id: Int,
    surface: String,
    entry: DictionaryEntry?,
    scalarRange: Range<Int> = 0..<0,
    dictionaryForm: String? = nil,
    reading: String? = nil,
    partOfSpeech: [String] = [],
    isOutOfVocabulary: Bool? = nil
  ) {
    self.id = id
    self.surface = surface
    self.entry = entry
    self.scalarRange = scalarRange
    self.dictionaryForm = dictionaryForm
    self.reading = reading
    self.partOfSpeech = partOfSpeech
    self.isOutOfVocabulary = isOutOfVocabulary
  }

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
          guard
            let anchorStart = firstIndex(
              of: anchor,
              in: normalizedReading,
              startingAt: cursor + 1
            )
          else { return nil }
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
  var lookupSegments: @Sendable (SearchQuery) async -> [SearchQuery]
  var availability: @Sendable () async -> JapaneseAnalysisAvailability
  var linkedTokens:
    @Sendable (
      _ text: String,
      _ highlightedQuery: SearchQuery,
      _ highlightedEntry: DictionaryEntry?
    ) async -> [JapaneseTextToken]

  static let characterFallback = JapaneseTextAnalysisClient(
    lookupSegments: { _ in [] },
    availability: { .reduced },
    linkedTokens: { text, _, _ in
      guard !text.isEmpty else { return [] }
      return [
        JapaneseTextToken(
          id: 0,
          surface: text,
          entry: nil,
          scalarRange: 0..<text.unicodeScalars.count
        )
      ]
    }
  )

  static func live(lookupClient: LookupClient) -> JapaneseTextAnalysisClient {
    resolving(morphologyClient: .live, lookupClient: lookupClient)
  }

  static func resolving(
    morphologyClient: JapaneseMorphologyClient,
    lookupClient: LookupClient
  ) -> JapaneseTextAnalysisClient {
    let resolver = JapaneseTextAnalyzer(
      morphologyClient: morphologyClient,
      lookupClient: lookupClient
    )
    return JapaneseTextAnalysisClient(
      lookupSegments: { query in
        guard !query.isEmpty,
          let analysis = try? await morphologyClient.analyze(query.value)
        else { return [] }
        return analysis.candidates.compactMap { candidate in
          guard
            candidate.partOfSpeech.first.map(JapaneseTextAnalyzer.isLinkablePartOfSpeech)
              == true,
            candidate.isOutOfVocabulary == false
          else { return nil }
          let form =
            candidate.dictionaryForm == "*" || candidate.dictionaryForm.isEmpty
            ? candidate.surface : candidate.dictionaryForm
          return SearchQuery(form)
        }
      },
      availability: morphologyClient.availability,
      linkedTokens: { text, highlightedQuery, highlightedEntry in
        await resolver.tokens(
          for: text,
          highlightedQuery: highlightedQuery,
          highlightedEntry: highlightedEntry
        )
      }
    )
  }
}

private actor JapaneseTextAnalyzer {
  let morphologyClient: JapaneseMorphologyClient
  let lookupClient: LookupClient
  private var entryCache: [String: [DictionaryEntry]] = [:]

  init(morphologyClient: JapaneseMorphologyClient, lookupClient: LookupClient) {
    self.morphologyClient = morphologyClient
    self.lookupClient = lookupClient
  }

  func tokens(
    for text: String,
    highlightedQuery: SearchQuery,
    highlightedEntry: DictionaryEntry?
  ) async -> [JapaneseTextToken] {
    do {
      let analysis = try await morphologyClient.analyze(text)
      var tokens: [JapaneseTextToken] = []
      for (index, candidate) in analysis.candidates.enumerated() {
        let entry = await resolvedEntry(
          for: candidate,
          highlightedQuery: highlightedQuery,
          highlightedEntry: highlightedEntry
        )
        tokens.append(
          JapaneseTextToken(
            id: index,
            surface: candidate.surface,
            entry: entry,
            scalarRange: candidate.scalarRange,
            dictionaryForm: candidate.dictionaryForm,
            reading: candidate.reading,
            partOfSpeech: candidate.partOfSpeech,
            isOutOfVocabulary: candidate.isOutOfVocabulary
          ))
      }
      return tokens
    } catch {
      return await JapaneseTextAnalysisClient.characterFallback.linkedTokens(
        text, highlightedQuery, highlightedEntry)
    }
  }

  private func resolvedEntry(
    for candidate: JapaneseMorphologyCandidate,
    highlightedQuery: SearchQuery,
    highlightedEntry: DictionaryEntry?
  ) async -> DictionaryEntry? {
    if let highlightedEntry {
      let highlightedForms = Set(
        Self.forms(for: highlightedEntry, preferred: highlightedQuery.value))
      let evidence =
        [candidate.surface, candidate.dictionaryForm, candidate.normalizedForm]
        + candidate.children.flatMap { [$0.surface, $0.dictionaryForm, $0.normalizedForm] }
      if evidence.contains(where: { highlightedForms.contains($0) }) {
        return highlightedEntry
      }
    }

    guard candidate.partOfSpeech.first.map(Self.isLinkablePartOfSpeech) == true,
      candidate.isOutOfVocabulary == false
    else { return nil }

    let directEntries = await entries(for: candidate.surface)
    if candidate.surface.unicodeScalars.allSatisfy(\.isKana), directEntries.count > 1 {
      return nil
    }
    let providerForms = [candidate.dictionaryForm, candidate.normalizedForm]
      .filter { !$0.isEmpty && $0 != "*" }
    for form in providerForms {
      let candidates = await entries(for: form)
      if candidates.count == 1 { return candidates[0] }
      if candidates.count > 1 { return nil }
    }
    return directEntries.count == 1 ? directEntries[0] : nil
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

  fileprivate static func isLinkablePartOfSpeech(_ value: String) -> Bool {
    ["名詞", "動詞", "形容詞", "形状詞", "代名詞", "接頭辞", "接尾辞"].contains(value)
  }

  private func entries(for surface: String) async -> [DictionaryEntry] {
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

extension Character {
  fileprivate var isKanjiOrIterationMark: Bool {
    self == "々"
      || unicodeScalars.contains {
        (0x3400...0x9FFF).contains(Int($0.value))
      }
  }
}

extension Unicode.Scalar {
  fileprivate var isKana: Bool { (0x3040...0x30FF).contains(Int(value)) }
}
