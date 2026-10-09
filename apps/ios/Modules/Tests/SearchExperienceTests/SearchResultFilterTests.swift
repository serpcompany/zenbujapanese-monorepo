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

  @Test("Show picks known words, unknown words, or all of them")
  func showsKnownOrUnknownWords() {
    #expect(filtered(SearchResultFilter(words: .known)) == ids(first, third))
    #expect(filtered(SearchResultFilter(words: .unknown)) == ids(second, fourth))
    #expect(filtered(.none) == entries.map(\.id))
  }

  @Test("a rank dictionary keeps the words it ranks")
  func rankDictionary() {
    #expect(filtered(SearchResultFilter(dictionary: youTube)) == ids(first, second))
  }

  @Test("JLPT keeps the words it lists at any level")
  func jlptAnyLevel() {
    #expect(filtered(SearchResultFilter(dictionary: jlpt)) == ids(first, fourth))
  }

  @Test("Show and Dictionary combine")
  func combined() {
    #expect(filtered(SearchResultFilter(words: .unknown, dictionary: jlpt)) == ids(fourth))
    #expect(filtered(SearchResultFilter(words: .known, dictionary: youTube)) == ids(first))
  }

  @Test("filtering keeps the order it is given")
  func keepsOrder() {
    let shown = SearchResultFiltering.filtered(
      entries.reversed(), by: SearchResultFilter(dictionary: jlpt), ranks: ranks,
      isKnown: { known.contains($0) })
    #expect(shown.map(\.id) == ids(fourth, first))
  }

  @Test("a filter can hide every word")
  func hidesEveryWord() {
    #expect(filtered(SearchResultFilter(words: .unknown, dictionary: anime)).isEmpty)
  }

  @Test("a disabled or removed dictionary drops out and Show stays")
  func disabledDictionaryDropsOut() {
    let filter = SearchResultFilter(words: .unknown, dictionary: anime)
    #expect(filter.keeping([jlpt, youTube]) == SearchResultFilter(words: .unknown))
    #expect(SearchResultFiltering.forgetsDictionary(filter, dictionaries: [jlpt, youTube]))
    #expect(!SearchResultFiltering.forgetsDictionary(filter, dictionaries: [jlpt, anime]))
  }

  @Test("while ranks load or can't be read, the dictionary waits and is kept")
  func unknownDictionariesKeepChoice() {
    let filter = SearchResultFilter(words: .unknown, dictionary: jlpt)
    #expect(
      SearchResultFiltering.applied(filter, dictionaries: nil, ranks: [:])
        == SearchResultFilter(words: .unknown))
    #expect(!SearchResultFiltering.forgetsDictionary(filter, dictionaries: nil))
  }

  @Test("changing Show while ranks load keeps the waiting dictionary")
  func changingShowWhileRanksLoadKeepsDictionary() {
    var stored = SearchResultFilter(dictionary: jlpt)
    stored.words = .unknown
    #expect(stored == SearchResultFilter(words: .unknown, dictionary: jlpt))
    #expect(
      SearchResultFiltering.applied(stored, dictionaries: nil, ranks: [:])
        == SearchResultFilter(words: .unknown))
  }

  @Test("a chosen dictionary whose data can't be read waits instead of hiding every word")
  func unreadableDictionaryWaits() {
    var unreadable = ranks
    for id in unreadable.keys {
      unreadable[id] = unreadable[id]?.map { result in
        guard result.pack?.id.family == jlpt.id.family else { return result }
        return .unavailable(FrequencyPackUnavailable(pack: jlpt, reason: "Pack unavailable"))
      }
    }
    let applied = SearchResultFiltering.applied(
      SearchResultFilter(words: .unknown, dictionary: jlpt),
      dictionaries: [jlpt, youTube, anime], ranks: unreadable)
    #expect(applied == SearchResultFilter(words: .unknown))
    #expect(
      SearchResultFiltering.filtered(
        entries, by: applied, ranks: unreadable, isKnown: { known.contains($0) }
      ).map(\.id) == ids(second, fourth))
  }

  @Test("the Sorted by row counts the filters, and the empty list's count reads naturally")
  func wording() {
    #expect(KnownWordFilter.allCases.map(\.title) == ["All", "Known", "Unknown"])
    #expect(SearchResultFilter.none.statusSuffix == nil)
    #expect(SearchResultFilter(words: .unknown).statusSuffix == "1 filter")
    #expect(SearchResultFilter(words: .known, dictionary: jlpt).statusSuffix == "2 filters")
    #expect(SearchResultFiltering.hiddenCountTitle(1) == "1 word hidden by filter")
    #expect(SearchResultFiltering.hiddenCountTitle(3) == "3 words hidden by filter")
    #expect(SearchResultFiltering.announcement(shownCount: 2) == "2 words shown")
  }

  @Test(
    "the filter is stored as text that reads back as the same filter",
    arguments: [
      SearchResultFilter.none,
      SearchResultFilter(words: .known),
      SearchResultFilter(words: .unknown, family: "zenbu.jlpt.waller"),
    ])
  func storedFilterRoundTrips(filter: SearchResultFilter) {
    #expect(SearchResultFilter(rawValue: filter.rawValue) == filter)
  }

  @Test(
    "stored text that isn't a filter is ignored, so Search shows all words",
    arguments: ["maybe", "all", "hide-known", "known|unknown", "in:a|in:b", "known|x", "in:"])
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
  fileprivate init(words: KnownWordFilter = .all, dictionary: FrequencyPackDisclosure) {
    self.init(words: words, family: dictionary.id.family)
  }

  fileprivate init(words: KnownWordFilter, family: String? = nil) {
    self.init()
    self.words = words
    dictionaryFamily = family
  }
}
