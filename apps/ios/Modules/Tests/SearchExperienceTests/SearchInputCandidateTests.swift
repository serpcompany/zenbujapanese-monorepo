import Testing
@testable import SearchExperience

@Suite("Search input candidates")
struct SearchInputCandidateTests {
  @Test("a candidate is added to the end of the query, whichever panel picked it")
  func appendsToQuery() {
    #expect(SearchInputCandidate.query("", adding: "好").value == "好")
    #expect(SearchInputCandidate.query("好一", adding: "子").value == "好一子")
  }

  @Test("of what the recognizer offers, only what is written in Japanese is kept, each once")
  func keepsJapaneseCandidates() throws {
    let kept: [String] = try PresentationCore.shared.answer(
      "japaneseCandidates", ["見る", "miru", "ﾐﾙ", "見る", "見る!", ""])
    #expect(kept == ["見る", "ミル"])
  }
}
