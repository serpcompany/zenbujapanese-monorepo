import Testing

@testable import SearchExperience

@Suite struct KanaHeadwordExampleTests {
  @Test(arguments: ["それで", "そんなに", "こんなに", "でも"])
  func commonKanaHeadwordsHaveExamples(headword: String) async throws {
    let examples = try await ExampleSentenceClient.live.examples(entry(headword))
    #expect(!examples.isEmpty)
  }

  @Test func examplesUseTheWordItselfNotLongerWordsContainingIt() async throws {
    let examples = try await ExampleSentenceClient.live.examples(entry("でも"))
    let sentences = Set(examples.map(\.japanese))
    #expect(sentences.allSatisfy { $0.contains("でも") })
    // でも only occurs inside いつでも (何時でも) here.
    #expect(!sentences.contains("必要な物や欲しい物があったら、いつでも電話してね。"))
  }

  @Test func kanaSharedByTwoWordsIsNotGuessed() async throws {
    // Tatoeba writes both the adverb 然う and the suffix そう as bare そう, so those
    // sentences belong to neither entry.
    let entries = try await LookupClient.live.entriesMatchingForm("そう")
    let suffix = try #require(entries.first { $0.summary.hasPrefix("appearing that") })
    let examples = try await ExampleSentenceClient.live.examples(suffix)
    #expect(!examples.contains { $0.japanese == "そう伝えます。" })
  }

  @Test func kanjiHeadwordsKeepWrittenFormMatching() async throws {
    let examples = try await ExampleSentenceClient.live.examples(entry("食べる"))
    #expect(examples.count >= 50)
    #expect(examples.allSatisfy { $0.japanese.contains("べ") })
  }

  private func entry(_ headword: String) async throws -> DictionaryEntry {
    let entries = try await LookupClient.live.entriesMatchingForm(headword)
    return try #require(entries.first { $0.headword == headword })
  }
}
