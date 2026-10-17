import Foundation
import Testing

@testable import SearchExperience

@Suite("The results screen the core builds for the app")
struct ResultsScreenTests: SearchResultFixture {
  @Test("the first screen a search shows is finished: its words in order, with their chips")
  func firstScreenIsFinished() async throws {
    let searched = try await SearchedScreen.search("食べる")
    let list = try searched.list
    let first = try #require(list.rows.first)
    #expect(try searched.entry(first.id).headword == "食べる")
    #expect(first.chips.map(\.source) == ["JLPT", "YouTube"])
    #expect(first.chips.first?.value == "N5")
    #expect(first.spoken.hasPrefix("Result 1 of \(list.rows.count), JLPT level N5, YouTube frequency rank "))
    #expect(list.rows.allSatisfy { !$0.spoken.contains("Frequency rank loading") })
    #expect(list.frequencyNotice == nil)
  }

  @Test("a search waits for the learner's lists before it asks for its screen, so it is drawn once")
  func waitsForTheLists() async throws {
    let lists = FrequencyLists()
    let core = PresentationCore(listing: lists)
    let results = try await LookupClient.live.search(SearchQuery("食べる"))
    let request = ResultsScreenRequest(
      query: SearchQuery("食べる"), results: results.listed, exampleCount: 0,
      learner: ResultsLearner())
    let asked = Task { try await request.screen(using: core) }
    try await Task.sleep(for: .milliseconds(200))
    #expect(lists.version == 0)
    lists.publish(
      [try FrequencyListFixture(youTube, [try #require(results.entries.first).id: 20]).enabled()])
    guard case .results(let list) = try await asked.value else {
      Issue.record("食べる has no results screen")
      return
    }
    #expect(list.rows.first?.chips.map(\.value) == ["20"])
    #expect(list.rows.allSatisfy { !$0.spoken.contains("Frequency rank loading") })
  }

  @Test("Sort By offers Default, each enabled dictionary, and Known Words, stored as before")
  func sortChoices() async throws {
    let list = try await SearchedScreen.search("iru").list
    let menu = try #require(list.menu)
    #expect(
      menu.sort.options.map(\.value)
        == ["default", "frequency|zenbu.jlpt.waller", "frequency|zenbu.tubelex.youtube", "known-words"])
    #expect(menu.sort.options.map(\.title) == ["Default", "JLPT", "YouTube", "Known Words"])
    #expect(menu.sort.chosen == "default")
    #expect(menu.status == "Sorted by Default")
    #expect(menu.filter.options.map(\.value) == ["all", "known", "unknown"])
    #expect(menu.filter.options.map(\.title) == ["All", "Known", "Unknown"])
    #expect(!list.forgetsSort)
  }

  @Test("sorting by a dictionary orders every word by it and leads each row with its chip")
  func sortsByADictionary() async throws {
    let searched = try await SearchedScreen.search("iru", sort: "frequency|zenbu.tubelex.youtube")
    let list = try searched.list
    #expect(list.menu?.status == "Sorted by YouTube")
    #expect(list.menu?.sort.summary == "YouTube")
    let ranks = try searched.values(from: "YouTube")
    let ranked = ranks.compactMap { $0 }
    #expect(ranked.count > 3)
    #expect(ranked == ranked.sorted())
    #expect(ranks.dropFirst(ranked.count).allSatisfy { $0 == nil })
    #expect(list.rows.allSatisfy { $0.chips.first?.source == "YouTube" })
    #expect(list.rows.last?.chips.first?.value == "—")

    let byLevel = try await SearchedScreen.search("iru", sort: "frequency|zenbu.jlpt.waller")
    let levels = try byLevel.values(from: "JLPT").compactMap { $0 }
    #expect(levels.count > 1)
    #expect(levels == levels.sorted(by: >))
  }

  @Test("Known Words puts the words the learner knows first; Filter shows only them")
  func knownWords() async throws {
    let unsorted = try await SearchedScreen.search("iru")
    let ids = try unsorted.list.rows.map(\.id)
    let known = [ids[ids.count - 1], ids[2]].map(LanguageReferenceID.init(rawValue:))

    let sorted = try await SearchedScreen.search("iru", sort: "known-words", known: known)
    #expect(try sorted.list.rows.map(\.id) == [ids[2], ids[ids.count - 1]] + ids.filter {
      $0 != ids[2] && $0 != ids[ids.count - 1]
    })
    #expect(try sorted.list.rows[0].spoken.hasPrefix("Known, Result 1 of \(ids.count), "))
    #expect(try sorted.list.rows[2].spoken.hasPrefix("Result 3 of \(ids.count), "))
    #expect(try sorted.list.menu?.status == "Sorted by Known Words")

    let filtered = try await SearchedScreen.search("iru", filter: "known", known: known)
    #expect(try filtered.list.rows.map(\.id) == [ids[2], ids[ids.count - 1]])
    #expect(try filtered.list.menu?.status == "Sorted by Default · 1 filter")
    #expect(try filtered.list.menu?.filter.title == "Known")
    #expect(
      try filtered.list.menu?.filter.options.map(\.announcement)
        == ["\(ids.count) words shown", "2 words shown", "\(ids.count - 2) words shown"])
    #expect(try filtered.list.hiddenByFilter == nil)
  }

  @Test("a filter that hides every word says how many it hides")
  func filterHidesEveryWord() async throws {
    let searched = try await SearchedScreen.search("iru", filter: "known")
    let list = try searched.list
    #expect(list.rows.isEmpty)
    #expect(list.hiddenByFilter == "\(searched.results.entries.count) words hidden by filter")
    #expect(list.menu?.filter.options.first?.value == "all")
  }

  @Test("with no dictionary enabled, words keep their order and say so, and a dictionary's sort is forgotten")
  func noDictionaryEnabled() async throws {
    let searched = try await SearchedScreen.search(
      "iru", using: PresentationCore(listing: try .listing()),
      sort: "frequency|zenbu.jiten.anime")
    let list = try searched.list
    #expect(list.rows.map(\.id) == searched.results.entries.map(\.id.rawValue))
    #expect(list.rows.allSatisfy { $0.chips.isEmpty })
    #expect(
      list.rows.first?.spoken == "Result 1 of \(list.rows.count), No frequency dictionary enabled")
    #expect(list.menu?.sort.options.map(\.title) == ["Default", "Known Words"])
    #expect(list.forgetsSort)
  }

  @Test("a sort by a dictionary that is no longer enabled is forgotten")
  func forgetsADisabledDictionary() async throws {
    let list = try await SearchedScreen.search("iru", sort: "frequency|zenbu.jiten.anime").list
    #expect(list.forgetsSort)
    #expect(list.menu?.status == "Sorted by Default")
  }

  @Test("a dictionary whose file can't be opened is named, and the others still order the list")
  func unavailableDictionary() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let files = try catalog.bundledArtifactURLs()
    let lists = FrequencyLists()
    lists.publish(
      try catalog.packs.filter(\.bundled).map { pack in
        EnabledFrequencyList(
          dictionary: pack.disclosure,
          file: .verified(
            pack.packKind == .level
              ? URL(filePath: "/missing/\(pack.packID.rawValue).sqlite3")
              : try #require(files[pack.packID])))
      })
    let searched = try await SearchedScreen.search("iru", using: PresentationCore(listing: lists))
    let list = try searched.list
    #expect(
      list.frequencyNotice
        == "JLPT unavailable. Search is ordered by the other enabled dictionaries.")
    #expect(list.rows.allSatisfy { $0.chips.first?.source == "JLPT" })
    #expect(list.rows.allSatisfy { $0.chips.first?.value == "—" })
    #expect(list.rows.allSatisfy { $0.spoken.contains("JLPT rank unavailable") })
    #expect(list.rows.contains { $0.chips.map(\.source) == ["JLPT", "YouTube"] })
    let ranked = try searched.values(from: "YouTube").compactMap { $0 }
    #expect(ranked.count > 3)
  }

  @Test("the radical panel's one-character query lists only its leading words")
  func leadingOnly() async throws {
    let all = try await SearchedScreen.search("日")
    let leading = try await SearchedScreen.search("日", fromRadicals: true)
    let longer = try await SearchedScreen.search("日本", fromRadicals: true)
    let typed = try await SearchedScreen.search("日本")
    #expect(try longer.list.rows.map(\.id) == typed.list.rows.map(\.id))
    #expect(try leading.list.rows.count < all.list.rows.count)
    #expect(
      try Set(leading.list.rows.map(\.id))
        == Set(leading.results.entries.prefix(leading.list.rows.count).map(\.id.rawValue)))
    #expect(try leading.list.kanji?.spoken == "Result 1 of \(leading.list.rows.count + 1), Kanji primary")
  }

  @Test("a query nothing matches has no results screen, and says so in the core's words")
  func noResults() async throws {
    #expect(
      try await SearchedScreen.search("qzxvkj").screen
        == .noResults(
          NoMatches(
            title: "No Dictionary Matches",
            message: "Try another Japanese or English Search query.")))
  }

  @Test("at the largest text sizes a row shows its first chip and counts the rest")
  func collapsedChips() {
    let chips = ["a", "b", "c"].map {
      FrequencyChip(pack: $0, source: $0, value: "1", tier: .veryCommon)
    }
    let row = ListedWord(id: "word", summary: "", chips: chips, spoken: "")
    let collapsed = row.chips(onlyFirst: true)
    #expect(collapsed.shown.map(\.source) == ["a"])
    #expect(collapsed.hidden == 2)
    let all = row.chips(onlyFirst: false)
    #expect(Array(all.shown) == chips)
    #expect(all.hidden == 0)
    let none = ListedWord(id: "word", summary: "", chips: [], spoken: "").chips(onlyFirst: true)
    #expect(none.shown.isEmpty)
    #expect(none.hidden == 0)
  }

  @Test("a tier draws five stars for very common, down to one for rare")
  func tierStars() {
    let tiers: [FrequencyTier] = [.veryCommon, .common, .moderate, .uncommon, .rare]
    #expect(tiers.map(\.stars) == [5, 4, 3, 2, 1])
  }

  @Test("a word page holds its frequency rows: each dictionary, its value, and its details")
  func frequencyRows() async throws {
    let eat = try #require(try await LookupClient.live.entriesMatchingForm("食べる").first)
    let rows = try #require(WordPage(eat, using: try .freshInstall())?.frequency)
    #expect(rows.map(\.source) == ["JLPT", "YouTube"])
    #expect(rows.map(\.pack) == ["zenbu.jlpt.waller.levels", "zenbu.tubelex.youtube.ja.unidic-3.1"])
    #expect(rows[0].value == "N5")
    #expect(rows[0].label == "JLPT level N5")
    #expect(rows[0].tier == .veryCommon)
    #expect(rows[0].details.section == "Level")
    #expect(rows[0].details.rows.map(\.label) == ["JLPT Level"])
    #expect(rows[0].details.pack?.name == "JLPT Levels")
    #expect(rows[1].label.hasPrefix("YouTube frequency rank "))
    #expect(rows[1].details.rows.map(\.label) == ["Rank", "Percentile"])
    #expect(rows[1].details.rows[1].value.hasPrefix("Top "))
    #expect(rows.map(\.id) == rows.compactMap(\.pack))
  }

  @Test("frequency that can't be read at all shows one row that says so")
  func unreadableFrequency() async throws {
    let lists = FrequencyLists()
    lists.publish(unavailable: "Bundled frequency data unavailable")
    let rows = try #require(WordPage(first, using: PresentationCore(listing: lists))?.frequency)
    #expect(rows.count == 1)
    #expect(rows.first?.pack == nil)
    #expect(rows.first?.id == "frequency-unavailable")
    #expect(rows.first?.source == "Frequency")
    #expect(rows.first?.value == "Unavailable")
    #expect(rows.first?.label == "Frequency rank unavailable")
    #expect(rows.first?.details.explanation == "Bundled frequency data unavailable")
    #expect(rows.first?.details.pack == nil)
  }

  @Test("a word page asked before the lists are ready has no rows, and has them once they are")
  func pageBeforeTheListsAreReady() throws {
    let lists = FrequencyLists()
    let core = PresentationCore(listing: lists)
    #expect(WordPage(first, using: core)?.frequency == [])
    lists.publish([try FrequencyListFixture(youTube, [first.id: 20]).enabled()])
    #expect(WordPage(first, using: core)?.frequency.map(\.value) == ["20"])
    lists.publish([try FrequencyListFixture(youTube, [first.id: 30]).enabled()])
    #expect(WordPage(first, using: core)?.frequency.map(\.value) == ["30"])
    lists.publish([])
    #expect(WordPage(first, using: core)?.frequency == [])
  }

  @Test("a word sheet's candidates are rows in the order given, drawn once with their chips")
  func candidateRows() throws {
    let request = WordRowsRequest(
      entries: [first, second].map { WordRowsRequest.Entry(id: $0.id.rawValue, summary: $0.summary) },
      known: [second.id.rawValue])
    let lists = FrequencyLists()
    let core = PresentationCore(listing: lists)
    let unready = request.rowsByEntry(using: core)
    #expect(unready[first.id.rawValue]?.spoken == "Result 1 of 2, Frequency rank loading")
    #expect(unready[first.id.rawValue]?.summary == first.summary)
    lists.publish([try FrequencyListFixture(youTube, [first.id: 20]).enabled()])
    let rows = request.rowsByEntry(using: core)
    #expect(rows[first.id.rawValue]?.chips == [
      FrequencyChip(
        pack: youTube.id.rawValue, source: "YouTube", value: "20", tier: .veryCommon)
    ])
    #expect(
      rows[second.id.rawValue]?.spoken
        == "Known, Result 2 of 2, YouTube has no rank for this entry")
  }
}
