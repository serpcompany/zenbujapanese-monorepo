import Testing
@testable import SearchExperience

@Suite("Search result Sort menu orders")
struct SearchResultSortTests: SearchResultFixture {
  private var defaultOrder: [DictionaryEntry] { [first, second, third, fourth, fifth] }

  @Test("each rank dictionary orders every result by its own rank, most common first")
  func rankDictionariesOrderMostCommonFirst() throws {
    let catalog = try FrequencyPackCatalog.bundled().packs.map(\.disclosure)
    let rankDictionaries = catalog.filter { $0.kind == .rank }
    #expect(rankDictionaries.count >= 7)
    for dictionary in rankDictionaries {
      let ranks = ranks(
        in: catalog, sorted: dictionary,
        values: [first.id: 500, third.id: 20, fourth.id: 500, fifth.id: 9_000])
      #expect(
        ordered(.frequency(family: dictionary.id.family), ranks)
          == ids(third, first, fourth, fifth, second),
        "\(dictionary.displayName)")
    }
  }

  @Test("JLPT orders N5 first and N1 last")
  func jlptOrdersByLevel() throws {
    let catalog = try FrequencyPackCatalog.bundled().packs.map(\.disclosure)
    let jlpt = try #require(catalog.first { $0.kind == .level })
    let ranks = ranks(
      in: catalog, sorted: jlpt,
      values: [
        first.id: JLPTLevel.n3.rawValue, third.id: JLPTLevel.n5.rawValue,
        fourth.id: JLPTLevel.n3.rawValue, fifth.id: JLPTLevel.n1.rawValue,
      ])
    #expect(
      ordered(.frequency(family: jlpt.id.family), ranks)
        == ids(third, first, fourth, fifth, second))
  }

  @Test("Known Words puts known words first and keeps the default order within each group")
  func knownWordsFirst() {
    #expect(
      ordered(.knownWords, [:], known: [first.id, fourth.id])
        == ids(first, fourth, second, third, fifth))
  }

  @Test("words the chosen dictionary doesn't rank go last, in default order")
  func wordsWithoutDataGoLast() {
    let ranks = ranks(in: [youTube], sorted: youTube, values: [third.id: 40, fifth.id: 10])
    #expect(
      ordered(.frequency(family: youTube.id.family), ranks)
        == ids(fifth, third, first, second, fourth))
  }

  @Test("ties keep their default order")
  func tiesKeepDefaultOrder() {
    let ranks = ranks(
      in: [youTube], sorted: youTube,
      values: Dictionary(uniqueKeysWithValues: defaultOrder.map { ($0.id, 7) }))
    #expect(ordered(.frequency(family: youTube.id.family), ranks) == defaultOrder.map(\.id))
  }

  @Test("Default keeps the order it is given")
  func defaultKeepsOrder() {
    #expect(ordered(.relevance, [:]) == defaultOrder.map(\.id))
  }

  @Test("a disabled or removed dictionary falls back to Default and the choice is forgotten")
  func disabledDictionaryFallsBack() {
    let byAnime = SearchResultSort.frequency(family: anime.id.family)
    #expect(SearchResultSortOrdering.applied(byAnime, dictionaries: [jlpt]) == .relevance)
    #expect(SearchResultSortOrdering.forgetsChoice(byAnime, dictionaries: [jlpt]))
    #expect(SearchResultSortOrdering.applied(byAnime, dictionaries: [jlpt, anime]) == byAnime)
    #expect(!SearchResultSortOrdering.forgetsChoice(byAnime, dictionaries: [jlpt, anime]))
    #expect(SearchResultSortOrdering.applied(.knownWords, dictionaries: []) == .knownWords)
    #expect(!SearchResultSortOrdering.forgetsChoice(.knownWords, dictionaries: []))
  }

  @Test("while ranks load or can't be read, a dictionary sort shows Default and is kept")
  func unknownDictionariesKeepChoice() {
    let byAnime = SearchResultSort.frequency(family: anime.id.family)
    #expect(SearchResultSortOrdering.applied(byAnime, dictionaries: nil) == .relevance)
    #expect(!SearchResultSortOrdering.forgetsChoice(byAnime, dictionaries: nil))
  }

  @Test("a rebuilt pack keeps the chosen sort, since the sort names the pack's family")
  func rebuiltPackKeepsSort() {
    let rebuilt = FrequencyPackDisclosure.fixture(
      id: "zenbu.jiten.anime.ja.ordered-v3", displayName: "Anime")
    let byAnime = SearchResultSort.frequency(family: "zenbu.jiten.anime")
    #expect(SearchResultSortOrdering.applied(byAnime, dictionaries: [rebuilt]) == byAnime)
  }

  @Test("the enabled dictionaries come from the loaded ranks, unknown while loading or unreadable")
  func enabledDictionariesFromRanks() {
    #expect(
      SearchResultSortOrdering.dictionaries(
        in: [first.id: [.noEvidence(pack: jlpt), .noEvidence(pack: youTube)]])
        == [jlpt, youTube])
    #expect(SearchResultSortOrdering.dictionaries(in: [:]) == nil)
    #expect(
      SearchResultSortOrdering.dictionaries(
        in: [first.id: [.unavailable(FrequencyPackUnavailable(pack: nil, reason: "Unreadable"))]])
        == nil)
  }

  @Test("the chosen dictionary's chip shows first")
  func chosenDictionaryChipFirst() {
    let entryRanks: FrequencyRanks = [
      .noEvidence(pack: jlpt), .noEvidence(pack: youTube), .noEvidence(pack: anime),
    ]
    #expect(
      SearchResultSortOrdering.chipRanks(
        entryRanks, for: .frequency(family: anime.id.family)
      )?.compactMap(\.pack) == [anime, jlpt, youTube])
    #expect(SearchResultSortOrdering.chipRanks(entryRanks, for: .knownWords) == entryRanks)
    #expect(SearchResultSortOrdering.chipRanks(entryRanks, for: .relevance) == entryRanks)
  }

  @Test(
    "the choice is stored as text that reads back as the same choice",
    arguments: [
      SearchResultSort.relevance,
      .frequency(family: "zenbu.tubelex.youtube"),
      .knownWords,
    ])
  func storedChoiceRoundTrips(sort: SearchResultSort) {
    #expect(SearchResultSort(rawValue: sort.rawValue) == sort)
  }

  @Test(
    "stored text that isn't a choice, including one with a direction, is ignored",
    arguments: [
      "", "frequency", "frequency|zenbu.jlpt.waller|least-common-first",
      "known-words|unknown-first", "x",
    ])
  func unreadableStoredChoiceIsIgnored(rawValue: String) {
    #expect(SearchResultSort(rawValue: rawValue) == nil)
  }

  @Test("the menu and the list name the order unless it's Default, and VoiceOver hears it")
  func summaryAndAnnouncement() {
    let byYouTube = SearchResultSort.frequency(family: youTube.id.family)
    #expect(SearchResultSort.relevance.summary(dictionaries: []) == "Default")
    #expect(byYouTube.summary(dictionaries: [youTube]) == "YouTube")
    #expect(SearchResultSort.knownWords.summary(dictionaries: []) == "Known Words")
    #expect(byYouTube.announcement(dictionaries: [youTube]) == "Sorted by YouTube")
    #expect(SearchResultSort.knownWords.announcement(dictionaries: []) == "Sorted by known words")
    #expect(SearchResultSort.relevance.status(dictionaries: [youTube]) == "Sorted by Default")
    #expect(byYouTube.status(dictionaries: [youTube]) == "Sorted by YouTube")
  }

  private func ordered(
    _ sort: SearchResultSort, _ ranks: [LanguageReferenceID: FrequencyRanks],
    known: Set<LanguageReferenceID> = []
  ) -> [LanguageReferenceID] {
    SearchResultSortOrdering.ordered(
      defaultOrder, by: sort, ranks: ranks, isKnown: { known.contains($0) }
    ).map(\.id)
  }

  private func ranks(
    in dictionaries: [FrequencyPackDisclosure],
    sorted: FrequencyPackDisclosure,
    values: [LanguageReferenceID: Int]
  ) -> [LanguageReferenceID: FrequencyRanks] {
    Dictionary(
      uniqueKeysWithValues: defaultOrder.enumerated().map { offset, entry in
        let entryRanks = dictionaries.map { dictionary in
          dictionary == sorted
            ? result(values[entry.id], from: dictionary, for: entry)
            : result(defaultOrder.count - offset, from: dictionary, for: entry)
        }
        return (entry.id, entryRanks)
      })
  }
}
