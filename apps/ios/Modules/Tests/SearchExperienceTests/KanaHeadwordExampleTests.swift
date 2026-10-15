import Testing

@testable import SearchExperience

@Suite struct KanaHeadwordExampleTests {
  @Test(arguments: ["それで", "そんなに", "こんなに", "でも"])
  func commonKanaHeadwordsHaveExamples(headword: String) async throws {
    let examples = try await sentences(of: entry(headword))
    #expect(!examples.isEmpty)
  }

  @Test func examplesUseTheWordItselfNotLongerWordsContainingIt() async throws {
    let examples = try await sentences(of: entry("でも"))
    let sentences = Set(examples.map(\.japanese))
    #expect(sentences.allSatisfy { $0.contains("でも") })
    #expect(!sentences.contains("必要な物や欲しい物があったら、いつでも電話してね。"))
  }

  @Test func kanaSharedByTwoWordsIsNotGuessed() async throws {
    let entries = try await LookupClient.live.entriesMatchingForm("そう")
    let suffix = try #require(entries.first { $0.summary.hasPrefix("appearing that") })
    let examples = try await sentences(of: suffix)
    #expect(!examples.contains { $0.japanese == "そう伝えます。" })
  }

  @Test func kanjiHeadwordsKeepWrittenFormMatching() async throws {
    let examples = try await sentences(of: entry("食べる"))
    #expect(examples.count >= 50)
    #expect(examples.allSatisfy { $0.japanese.contains("べ") })
  }

  private func sentences(of entry: DictionaryEntry) async throws -> [ExampleSentence] {
    try await ExamplePage.every {
      try await ExampleSentenceClient.live.examples(entry, $0)
    }.examples.map(\.sentence)
  }

  private func entry(_ headword: String) async throws -> DictionaryEntry {
    let entries = try await LookupClient.live.entriesMatchingForm(headword)
    return try #require(entries.first { $0.headword == headword })
  }
}
