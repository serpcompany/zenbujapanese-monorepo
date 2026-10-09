import Testing
@testable import SearchExperience

@Suite("Search input candidates")
struct SearchInputCandidateTests {
  @Test("a candidate is added to the end of the query, whichever panel picked it")
  func appendsToQuery() {
    #expect(SearchInputCandidate.query("", adding: "好").value == "好")
    #expect(SearchInputCandidate.query("好一", adding: "子").value == "好一子")
  }

  @Test("only a single radical candidate keeps the radical search's leading group")
  func sparseOnlyForSingleCharacter() {
    #expect(SearchInputCandidate.isSingleCharacter(SearchQuery("好")))
    #expect(!SearchInputCandidate.isSingleCharacter(SearchQuery("好子")))
  }
}
