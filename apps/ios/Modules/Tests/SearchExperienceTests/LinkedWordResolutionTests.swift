import Testing

@testable import SearchExperience

@Suite("Linked words")
struct LinkedWordResolutionTests {
  private typealias Part = (surface: String, base: String, pos: [String])

  private static let readings = ["見": "ミ", "なかっ": "ナカッ", "た": "タ"]

  private func analyzed(_ parts: [Part]) -> JapaneseTextAnalysisClient {
    var offset = 0
    let words = parts.map { part in
      defer { offset += part.surface.unicodeScalars.count }
      return JapaneseMorpheme(
        surface: part.surface,
        begin: offset,
        end: offset + part.surface.unicodeScalars.count,
        dictionaryForm: part.base,
        normalizedForm: part.base,
        reading: Self.readings[part.surface] ?? part.surface,
        partOfSpeech: part.pos,
        isOutOfVocabulary: false
      )
    }
    let morphology = JapaneseMorphologyClient { _ in
      JapaneseMorphologyAnalysis(words: words, pieces: [])
    }
    return .live(text: DictionaryTextData(morphology: morphology))
  }

  private func entries(_ token: JapaneseTextToken?) -> [DictionaryEntry] {
    token?.candidateEntries ?? []
  }

  @Test("a joined verb links to its dictionary form, not a same-spelled headword")
  func joinedVerbPrefersDictionaryForm() async {
    let tokens = await analyzed([
      ("本", "本", ["名詞", "一般"]), ("を", "を", ["助詞", "格助詞"]),
      ("しまっ", "しまう", ["動詞", "自立"]), ("た", "た", ["助動詞"]),
    ]).linkedTokens("本をしまった", SearchQuery(""), nil)
    #expect(tokens.map(\.surface) == ["本", "を", "しまった"])
    #expect(tokens.map(\.scalarRange) == [0..<1, 1..<2, 2..<6])
    #expect(tokens.map(\.isFunctionWord) == [false, true, false])
    let put = entries(tokens.last)
    #expect(!put.isEmpty)
    #expect(put.allSatisfy { $0.reading == "しまう" })
    #expect(put.allSatisfy { $0.headword != "しまった" })
  }

  @Test("an inflected verb resolves to its dictionary entry, which the page's own word marks")
  func inflectedVerb() async throws {
    let see = try #require(
      try await LookupClient.live.entriesMatchingForm("見る").first { $0.headword == "見る" })
    let client = analyzed([
      ("見", "見る", ["動詞", "自立"]), ("なかっ", "ない", ["助動詞"]), ("た", "た", ["助動詞"]),
    ])
    let alone = await client.linkedTokens("見なかった", SearchQuery("見な"), nil)
    #expect(alone.map(\.surface) == ["見なかった"])
    #expect(entries(alone.first).contains { $0.id == see.id })
    #expect(alone.first?.accent == nil)

    let onItsPage = await client.linkedTokens("見なかった", SearchQuery("見る"), see)
    #expect(onItsPage.first?.entry == see)
    #expect(onItsPage.first?.accent == .entry)
    #expect(onItsPage.first?.ruby?.segments.first?.base == "見")
    #expect(onItsPage.first?.ruby?.segments.first?.reading == "み")
  }

  @Test("a joined word whose head has no entry falls back to its pieces")
  func unresolvedJoinedWordFallsBack() async {
    let tokens = await analyzed([
      ("ほげ", "ほげる", ["動詞", "自立"]), ("ない", "ない", ["助動詞"]),
    ]).linkedTokens("ほげない", SearchQuery(""), nil)
    #expect(tokens.map(\.surface) == ["ほげ", "ない"])
    #expect(tokens.map(\.id) == [0, 1])
    #expect(!entries(tokens.last).isEmpty)
  }

  @Test("a text nothing can analyze shows as one unlinked word")
  func unanalyzedText() async {
    let client = JapaneseTextAnalysisClient.live(
      text: DictionaryTextData(
        morphology: JapaneseMorphologyClient { _ in throw JapaneseMorphologyError.packUnavailable }
      ))
    let tokens = await client.linkedTokens("本をしまった", SearchQuery(""), nil)
    #expect(tokens.map(\.surface) == ["本をしまった"])
    #expect(tokens.first?.entry == nil)
    #expect(tokens.first?.reading == nil)
    #expect(tokens.first?.scalarRange == 0..<6)
    #expect(await client.linkedTokens("", SearchQuery(""), nil).isEmpty)
  }

  @Test("the core's tokenizer splits a sentence into its words and links each")
  func tokenizer() async throws {
    let client = JapaneseTextAnalysisClient.live()
    #expect(await client.availability() == .full)
    let tokens = await client.linkedTokens("猫が魚を食べました。", SearchQuery("食べ"), nil)
    #expect(tokens.map(\.surface) == ["猫", "が", "魚", "を", "食べました", "。"])
    #expect(tokens.map(\.isFunctionWord) == [false, true, false, true, false, true])
    #expect(tokens.allSatisfy { $0.accent == nil })
    #expect(tokens.map(\.reading) == ["ネコ", "ガ", "サカナ", "ヲ", "タベマシタ", "。"])
    let cat = try #require(tokens.first)
    #expect(entries(cat).contains { $0.headword == "猫" })
    #expect(entries(tokens[4]).contains { $0.headword == "食べる" })
    #expect(entries(tokens[5]).isEmpty)
    if let ruby = cat.ruby {
      #expect(ruby.segments == [JapaneseRubySegment(base: "猫", reading: "ねこ", kanjiReadings: nil)])
    }
  }
}
