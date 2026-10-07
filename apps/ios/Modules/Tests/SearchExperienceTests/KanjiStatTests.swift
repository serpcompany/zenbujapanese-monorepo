import Testing

@testable import SearchExperience

@Suite struct KanjiStatTests {
  private func jlpt(_ character: String) async throws -> String? {
    let kanji = try #require(KanjiCharacter(character))
    let found = try await KanjiLookupClient.live(lookupClient: .live).entry(kanji)
    let reference = try #require(found)
    return reference.stats.first { $0.identifier == "kanji-detail.jlpt" }?.value
  }

  @Test func showsWallersLevelAsTheJLPTStat() async throws {
    #expect(try await jlpt("一") == "N5")
    #expect(try await jlpt("日") == "N5")
    #expect(try await jlpt("猫") == "N3")
    #expect(try await jlpt("彦") == "N1")
  }

  @Test func showsNoJLPTStatForAKanjiOutsideWallersLists() async throws {
    #expect(try await jlpt("分") == nil)
    #expect(try await jlpt("㐆") == nil)
  }

  @Test func listsStrokesThenGradeThenJLPT() async throws {
    let kanji = try #require(KanjiCharacter("一"))
    let found = try await KanjiLookupClient.live(lookupClient: .live).entry(kanji)
    let reference = try #require(found)
    #expect(reference.stats.map(\.accessibilityLabel) == ["1 Stroke", "Grade 1", "JLPT N5"])
  }
}
