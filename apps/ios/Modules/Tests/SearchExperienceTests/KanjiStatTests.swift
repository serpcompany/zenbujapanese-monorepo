import Testing

@testable import SearchExperience

@Suite struct KanjiStatTests {
  private func stats(_ character: String) throws -> [KanjiPage.Stat] {
    let kanji = try #require(KanjiCharacter(character))
    return try KanjiLookupClient.live(lookupClient: .live).page(kanji, [], nil).stats
  }

  private func jlpt(_ character: String) throws -> String? {
    try stats(character).first { $0.kind == "jlpt" }?.value
  }

  @Test func showsWallersLevelAsTheJLPTStat() throws {
    #expect(try jlpt("一") == "N5")
    #expect(try jlpt("日") == "N5")
    #expect(try jlpt("猫") == "N3")
    #expect(try jlpt("彦") == "N1")
  }

  @Test func showsNoJLPTStatForAKanjiOutsideWallersLists() throws {
    #expect(try jlpt("分") == nil)
    #expect(try jlpt("㐆") == nil)
  }

  @Test func listsStrokesThenGradeThenJLPT() throws {
    #expect(try stats("一").map(\.spoken) == ["1 Stroke", "Grade 1", "JLPT N5"])
    #expect(try stats("一").map(\.label) == ["Stroke", "Grade", "JLPT"])
  }

  @Test func showsNoStatsForAKanjiWithoutAReference() throws {
    let page = try KanjiLookupClient.live(lookupClient: .live).page(
      try #require(KanjiCharacter("亲")), [], nil)
    #expect(!page.hasReference)
    #expect(page.stats.isEmpty)
  }
}
