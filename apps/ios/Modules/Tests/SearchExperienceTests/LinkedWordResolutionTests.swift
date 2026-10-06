import Testing
@testable import SearchExperience

@Suite("Linked word resolution")
struct LinkedWordResolutionTests {
  @Test("a joined verb links to its dictionary form, not a same-spelled headword")
  func joinedVerbPrefersDictionaryForm() async {
    let tokens = await linkedTokens(
      "本をしまった",
      parts: [
        ("本", "本", ["名詞", "一般"]), ("を", "を", ["助詞", "格助詞"]),
        ("しまっ", "しまう", ["動詞", "自立"]), ("た", "た", ["助動詞"]),
      ],
      dictionary: [
        "本": [.fixture(id: "hon", headword: "本")],
        "しまう": [.fixture(id: "shimau", headword: "しまう", partsOfSpeech: [.godanVerb])],
        "しまった": [.fixture(id: "shimatta", headword: "しまった")],
      ])
    #expect(tokens.map(\.surface) == ["本", "を", "しまった"])
    #expect(tokens.last?.entry?.headword == "しまう")
  }

  @Test("an inflected verb resolves to its dictionary entry")
  func inflectedVerb() async {
    let tokens = await linkedTokens(
      "見なかった",
      parts: [
        ("見", "見る", ["動詞", "自立"]), ("なかっ", "ない", ["助動詞"]), ("た", "た", ["助動詞"]),
      ],
      dictionary: ["見る": [.fixture(id: "miru", headword: "見る", partsOfSpeech: [.ichidanVerb])]])
    #expect(tokens.map(\.surface) == ["見なかった"])
    #expect(tokens.first?.entry?.headword == "見る")
  }

  @Test("a joined word whose head has no entry falls back to its pieces")
  func unresolvedJoinedWordFallsBack() async {
    let tokens = await linkedTokens(
      "ほげない",
      parts: [("ほげ", "ほげる", ["動詞", "自立"]), ("ない", "ない", ["助動詞"])],
      dictionary: ["ない": [.fixture(id: "nai", headword: "ない")]])
    #expect(tokens.map(\.surface) == ["ほげ", "ない"])
  }

  @Test("words() returns grouped surfaces")
  func wordSurfaces() async {
    let client = analysisClient(
      parts: [
        ("時計", "時計", ["名詞", "一般"]), ("見", "見る", ["動詞", "自立"]),
        ("なかっ", "ない", ["助動詞"]), ("た", "た", ["助動詞"]),
      ],
      dictionary: [:])
    #expect(await client.words("時計見なかった") == ["時計", "見なかった"])
  }

  private typealias Part = (surface: String, base: String, pos: [String])

  private func linkedTokens(
    _ text: String, parts: [Part], dictionary: [String: [DictionaryEntry]]
  ) async -> [JapaneseTextToken] {
    await analysisClient(parts: parts, dictionary: dictionary)
      .linkedTokens(text, SearchQuery(""), nil)
  }

  private func analysisClient(
    parts: [Part], dictionary: [String: [DictionaryEntry]]
  ) -> JapaneseTextAnalysisClient {
    var offset = 0
    let candidates = parts.map { part in
      defer { offset += part.surface.unicodeScalars.count }
      return JapaneseMorphologyCandidate(
        surface: part.surface,
        scalarRange: offset..<(offset + part.surface.unicodeScalars.count),
        dictionaryForm: part.base,
        normalizedForm: part.base,
        reading: part.surface,
        partOfSpeech: part.pos,
        isOutOfVocabulary: false,
        children: []
      )
    }
    let text = parts.map(\.surface).joined()
    let morphology = JapaneseMorphologyClient { _ in
      JapaneseMorphologyAnalysis(
        transcript: text, candidates: candidates, engine: "fixture", engineVersion: "1",
        dictionary: "fixture", dictionarySHA256: "fixture")
    }
    let lookup = LookupClient(
      search: { _ in throw FixtureError.unused },
      entry: { _ in nil },
      entryMatchingForm: { dictionary[$0]?.first },
      entriesMatchingForm: { dictionary[$0] ?? [] },
      entriesContainingKanji: { _ in [] }
    )
    return .resolving(morphologyClient: morphology, lookupClient: lookup)
  }

  private enum FixtureError: Error { case unused }
}
