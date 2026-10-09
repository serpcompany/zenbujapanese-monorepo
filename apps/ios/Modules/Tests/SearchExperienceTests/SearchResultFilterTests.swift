import Testing
@testable import SearchExperience

@Suite("Search result Filter")
struct SearchResultFilterTests: SearchResultFixture {
  private var entries: [DictionaryEntry] { [first, second, third, fourth] }
  private var known: Set<LanguageReferenceID> { [first.id, third.id] }

  @Test("Words picks known words, unknown words, or all of them")
  func filtersByKnownStatus() {
    #expect(filtered(.known) == ids(first, third))
    #expect(filtered(.unknown) == ids(second, fourth))
    #expect(filtered(.all) == entries.map(\.id))
  }

  @Test("filtering keeps the order it is given")
  func keepsOrder() {
    let shown = SearchResultFiltering.filtered(
      entries.reversed(), by: .unknown, isKnown: { known.contains($0) })
    #expect(shown.map(\.id) == ids(fourth, second))
  }

  @Test("a filter can hide every word")
  func hidesEveryWord() {
    let shown = SearchResultFiltering.filtered([first, third], by: .unknown) { known.contains($0) }
    #expect(shown.isEmpty)
  }

  @Test("the Sorted by row counts the filter, and the empty list's count reads naturally")
  func wording() {
    #expect(SearchResultFilter.allCases.map(\.title) == ["All", "Known", "Unknown"])
    #expect(SearchResultFilter.all.statusSuffix == nil)
    #expect(SearchResultFilter.unknown.statusSuffix == "1 filter")
    #expect(SearchResultFiltering.hiddenCountTitle(1) == "1 word hidden by filter")
    #expect(SearchResultFiltering.hiddenCountTitle(3) == "3 words hidden by filter")
    #expect(SearchResultFiltering.announcement(shownCount: 2) == "2 words shown")
  }

  @Test(
    "the filter is stored as text that reads back as the same filter",
    arguments: SearchResultFilter.allCases)
  func storedFilterRoundTrips(filter: SearchResultFilter) {
    #expect(SearchResultFilter(rawValue: filter.rawValue) == filter)
  }

  @Test(
    "stored text that isn't a filter, including a dictionary filter, is ignored",
    arguments: ["maybe", "", "unknown|in:zenbu.jlpt.waller", "in:zenbu.jlpt.waller"])
  func unreadableStoredFilterIsIgnored(rawValue: String) {
    #expect(SearchResultFilter(rawValue: rawValue) == nil)
  }

  private func filtered(_ filter: SearchResultFilter) -> [LanguageReferenceID] {
    SearchResultFiltering.filtered(entries, by: filter, isKnown: { known.contains($0) }).map(\.id)
  }
}
