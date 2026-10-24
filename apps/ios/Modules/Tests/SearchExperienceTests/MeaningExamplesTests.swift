import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("A word's meanings' examples", .timeLimit(.minutes(1)))
struct MeaningExamplesTests {
  private static let dog = LanguageReferenceID(rawValue: "681bff8274391329f3ce9ca80a4e04b0")
  private let lookup = LookupClient.reading(LanguageReferenceData())

  private func dog() async throws -> DictionaryEntry {
    try #require(try await lookup.entry(Self.dog))
  }

  @Test("a word's page waits for nothing more when its meanings' examples can't be read")
  func aFailedReadOpensThePageWithoutThem() async throws {
    let entry = try await dog()
    let unreadable = ExampleSentenceClient(
      text: DictionaryTextData(
        databaseURL: URL(fileURLWithPath: "/nonexistent/LanguageReferenceData.sqlite3")),
      linked: LinkedEntries(lookupClient: lookup))
    let loaded = LoadedMeaningExamples()
    #expect(loaded.examples(of: entry.id) == nil)
    await loaded.load(entry, read: unreadable.meaningExamples)
    #expect(loaded.examples(of: entry.id)?.bySense.isEmpty == true)
  }

  @Test("a word's meanings' examples are its first checked sentence for each, by meaning number")
  func eachMeaningHasItsFirstCheckedExample() async throws {
    let entry = try await dog()
    let loaded = LoadedMeaningExamples()
    let examples = ExampleSentenceClient(
      text: DictionaryTextData(), linked: LinkedEntries(lookupClient: lookup))
    await loaded.load(entry, read: examples.meaningExamples)
    let shown = try #require(loaded.examples(of: entry.id))
    #expect(shown.bySense.keys.sorted() == [1, 2])
    #expect(shown.bySense[1]?.sentence.japanese == "彼女は吠える犬を怖がる。")
    #expect(shown.bySense[1]?.words.contains { $0.accent == .entry && $0.surface == "犬" } == true)
  }
}
