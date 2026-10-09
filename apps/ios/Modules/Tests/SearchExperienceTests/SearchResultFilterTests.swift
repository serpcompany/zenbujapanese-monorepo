import Testing
@testable import SearchExperience

@Suite("Search result Filter")
struct SearchResultFilterTests: SearchResultFixture {
  private var entries: [DictionaryEntry] { [first, second, third, fourth] }
  private var known: Set<LanguageReferenceID> { [first.id, third.id] }

  private var ranks: [LanguageReferenceID: FrequencyRanks] {
    let values: [LanguageReferenceID: [Int?]] = [
      first.id: [JLPTLevel.n5.rawValue, 120, nil],
      second.id: [nil, 800, nil],
      third.id: [nil, nil, 40],
      fourth.id: [JLPTLevel.n1.rawValue, nil, nil],
    ]
    return Dictionary(
      uniqueKeysWithValues: entries.map { entry in
        (entry.id, zip(values[entry.id] ?? [], [jlpt, youTube, anime]).map { value, dictionary in
          result(value, from: dictionary, for: entry)
        })
      })
  }

  @Test("Known Words shows only known words, Unknown Words only the rest")
  func knownStatusAlone() {
    #expect(filtered(SearchResultFilter(known: true)) == ids(first, third))
    #expect(filtered(SearchResultFilter(unknown: true)) == ids(second, fourth))
  }

  @Test("with both or neither known status checked, known status doesn't filter")
  func knownStatusBothOrNeither() {
    #expect(filtered(SearchResultFilter(known: true, unknown: true)) == entries.map(\.id))
    #expect(filtered(.none) == entries.map(\.id))
  }

  @Test("a rank dictionary keeps the words it ranks")
  func oneRankDictionary() {
    #expect(filtered(SearchResultFilter(families: [youTube])) == ids(first, second))
  }

  @Test("JLPT keeps the words it lists at any level")
  func jlptAnyLevel() {
    #expect(filtered(SearchResultFilter(families: [jlpt])) == ids(first, fourth))
  }

  @Test("several dictionaries keep a word any one of them ranks")
  func severalDictionaries() {
    #expect(filtered(SearchResultFilter(families: [jlpt, anime])) == ids(first, third, fourth))
  }

  @Test("known status and dictionaries combine")
  func combined() {
    #expect(filtered(SearchResultFilter(unknown: true, families: [jlpt])) == ids(fourth))
    #expect(filtered(SearchResultFilter(known: true, families: [anime])) == ids(third))
  }

  @Test("filtering keeps the order it is given")
  func keepsOrder() {
    let reversed = Array(entries.reversed())
    let shown = SearchResultFiltering.filtered(
      reversed, by: SearchResultFilter(families: [jlpt]), ranks: ranks,
      isKnown: { known.contains($0) })
    #expect(shown.map(\.id) == ids(fourth, first))
  }

  @Test("a filter can hide every word")
  func hidesEveryWord() {
    #expect(filtered(SearchResultFilter(unknown: true, families: [anime])).isEmpty)
  }

  @Test("a disabled or removed dictionary drops out and the rest of the filter stays")
  func disabledDictionaryDropsOut() {
    let filter = SearchResultFilter(unknown: true, families: [jlpt, anime])
    let kept = filter.keeping([jlpt, youTube])
    #expect(kept == SearchResultFilter(unknown: true, families: [jlpt]))
    #expect(SearchResultFiltering.forgetsDictionaries(filter, dictionaries: [jlpt, youTube]))
    #expect(!SearchResultFiltering.forgetsDictionaries(filter, dictionaries: [jlpt, anime]))
  }

  @Test("while ranks load or can't be read, the dictionary part waits and is kept")
  func unknownDictionariesKeepChoice() {
    let filter = SearchResultFilter(unknown: true, families: [jlpt])
    #expect(SearchResultFiltering.applied(filter, dictionaries: nil) == SearchResultFilter(unknown: true))
    #expect(!SearchResultFiltering.forgetsDictionaries(filter, dictionaries: nil))
  }

  @Test("the menu and the row name the filter, and the hidden count reads naturally")
  func wording() {
    let dictionaries = [jlpt, youTube]
    #expect(SearchResultFilter.none.summary(dictionaries: dictionaries) == "All Words")
    #expect(SearchResultFilter(unknown: true).summary(dictionaries: dictionaries) == "Unknown Words")
    #expect(
      SearchResultFilter(known: true, families: [jlpt]).summary(dictionaries: dictionaries)
        == "Known, in JLPT")
    #expect(
      SearchResultFilter(families: [jlpt, youTube]).summary(dictionaries: dictionaries)
        == "In JLPT, YouTube")
    #expect(SearchResultFilter.none.statusSuffix == nil)
    #expect(SearchResultFilter(unknown: true).statusSuffix == "1 filter")
    #expect(SearchResultFilter(unknown: true, families: [jlpt]).statusSuffix == "2 filters")
    #expect(SearchResultFiltering.hiddenCountTitle(1) == "1 word hidden by filter")
    #expect(SearchResultFiltering.hiddenCountTitle(3) == "3 words hidden by filter")
    #expect(SearchResultFiltering.announcement(shownCount: 2) == "2 words shown")
  }

  @Test(
    "the filter is stored as text that reads back as the same filter",
    arguments: [
      SearchResultFilter.none,
      SearchResultFilter(known: true),
      SearchResultFilter(unknown: true, families: ["zenbu.jlpt.waller", "zenbu.tubelex.youtube"]),
    ])
  func storedFilterRoundTrips(filter: SearchResultFilter) {
    #expect(SearchResultFilter(rawValue: filter.rawValue) == filter)
  }

  @Test(
    "stored text that isn't a filter is ignored, so Search shows all words",
    arguments: ["maybe", "known|x", "in:"])
  func unreadableStoredFilterIsIgnored(rawValue: String) {
    #expect(SearchResultFilter(rawValue: rawValue) == nil)
  }

  private func filtered(_ filter: SearchResultFilter) -> [LanguageReferenceID] {
    SearchResultFiltering.filtered(
      entries, by: filter, ranks: ranks, isKnown: { known.contains($0) }
    ).map(\.id)
  }
}

extension SearchResultFilter {
  fileprivate init(
    known: Bool = false, unknown: Bool = false, families: [FrequencyPackDisclosure] = []
  ) {
    self.init(known: known, unknown: unknown, families: Set(families.map(\.id.family)))
  }

  fileprivate init(known: Bool = false, unknown: Bool = false, families: Set<String>) {
    self.init()
    knownWords = known
    unknownWords = unknown
    dictionaryFamilies = families
  }
}
