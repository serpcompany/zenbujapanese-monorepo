import Foundation
import Testing

@testable import SearchExperience

@Suite("The results screen the core builds for the app")
struct ResultsScreenTests: SearchResultFixture {
  private func freshInstall(_ name: String) throws -> FrequencyCapability {
    let frequency = try FrequencyPackManager.freshInstall(storagePrefix: "ResultsScreen-\(name)")
    return FrequencyCapability { try await frequency.evidence(for: $0) }
  }

  private func evidence(
    _ searched: SearchedScreen, from dictionary: Int
  ) throws -> [Int?] {
    let entries = try #require(searched.frequency?.entries)
    return try searched.list.rows.map { entries[$0.id]?[dictionary].value }
  }

  @Test("Sort By offers Default, each enabled dictionary, and Known Words, stored as before")
  func sortChoices() async throws {
    let list = try await SearchedScreen.search("iru", frequency: freshInstall("choices")).list
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
    let searched = try await SearchedScreen.search(
      "iru", frequency: freshInstall("youtube"), sort: "frequency|zenbu.tubelex.youtube")
    let list = try searched.list
    #expect(list.menu?.status == "Sorted by YouTube")
    #expect(list.menu?.sort.summary == "YouTube")
    let ranks = try evidence(searched, from: 1)
    let ranked = ranks.compactMap { $0 }
    #expect(ranked.count > 3)
    #expect(ranked == ranked.sorted())
    #expect(ranks.dropFirst(ranked.count).allSatisfy { $0 == nil })
    #expect(list.rows.allSatisfy { $0.chips.first?.source == "YouTube" })
    #expect(list.rows.last?.chips.first?.value == "—")

    let byLevel = try await SearchedScreen.search(
      "iru", frequency: freshInstall("jlpt"), sort: "frequency|zenbu.jlpt.waller")
    let levels = try evidence(byLevel, from: 0).compactMap { $0 }
    #expect(levels.count > 1)
    #expect(levels == levels.sorted(by: >))
  }

  @Test("Known Words puts the words the learner knows first; Filter shows only them")
  func knownWords() async throws {
    let unsorted = try await SearchedScreen.search("iru", frequency: freshInstall("known"))
    let ids = try unsorted.list.rows.map(\.id)
    let known = [ids[ids.count - 1], ids[2]].map(LanguageReferenceID.init(rawValue:))

    let sorted = try await SearchedScreen.search(
      "iru", frequency: freshInstall("known-sort"), sort: "known-words", known: known)
    #expect(try sorted.list.rows.map(\.id) == [ids[2], ids[ids.count - 1]] + ids.filter {
      $0 != ids[2] && $0 != ids[ids.count - 1]
    })
    #expect(try sorted.list.rows[0].spoken.hasPrefix("Known, Result 1 of \(ids.count), "))
    #expect(try sorted.list.rows[2].spoken.hasPrefix("Result 3 of \(ids.count), "))
    #expect(try sorted.list.menu?.status == "Sorted by Known Words")

    let filtered = try await SearchedScreen.search(
      "iru", frequency: freshInstall("known-filter"), filter: "known", known: known)
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

  @Test("while the dictionaries load, words keep their order, show no chips, and keep the sort")
  func loading() async throws {
    let searched = try await SearchedScreen.search("iru", sort: "frequency|zenbu.jiten.anime")
    let list = try searched.list
    #expect(list.rows.map(\.id) == searched.results.entries.map(\.id.rawValue))
    #expect(list.rows.allSatisfy { $0.chips.isEmpty })
    #expect(list.rows.first?.spoken == "Result 1 of \(list.rows.count), Frequency rank loading")
    #expect(list.menu?.sort.chosen == "default")
    #expect(!list.forgetsSort)
    #expect(list.frequencyEntries == searched.results.entries.map(\.id.rawValue))
  }

  @Test("a sort by a dictionary that is no longer enabled is forgotten")
  func forgetsADisabledDictionary() async throws {
    let list = try await SearchedScreen.search(
      "iru", frequency: freshInstall("forgets"), sort: "frequency|zenbu.jiten.anime"
    ).list
    #expect(list.forgetsSort)
    #expect(list.menu?.status == "Sorted by Default")
  }

  @Test("a dictionary that can't be read is named, and the others still order the list")
  func unavailableDictionary() async throws {
    let installed = try freshInstall("unavailable")
    let jlpt = jlpt
    let searched = try await SearchedScreen.search(
      "iru",
      frequency: FrequencyCapability { ids in
        try await installed.evidence(for: ids).mapValues { ranks in
          [.unavailable(FrequencyPackUnavailable(pack: jlpt, reason: "Pack unavailable"))]
            + ranks.dropFirst()
        }
      })
    let list = try searched.list
    #expect(
      list.frequencyNotice
        == "JLPT unavailable. Search is ordered by the other enabled dictionaries.")
    #expect(list.rows.allSatisfy { $0.chips.first?.source == "JLPT" })
    #expect(list.rows.allSatisfy { $0.chips.first?.value == "—" })
    #expect(list.rows.allSatisfy { $0.spoken.contains("JLPT rank unavailable") })
    #expect(list.rows.contains { $0.chips.map(\.source) == ["JLPT", "YouTube"] })
  }

  @Test("the radical panel's one-character query lists only its leading words")
  func leadingOnly() async throws {
    let all = try await SearchedScreen.search("日")
    let leading = try await SearchedScreen.search("日", leadingOnly: true)
    #expect(try leading.list.rows.count < all.list.rows.count)
    #expect(try leading.list.rows.map(\.id) == Array(all.list.rows.map(\.id).prefix(leading.list.rows.count)))
    #expect(try leading.list.frequencyEntries == leading.list.rows.map(\.id))
    #expect(try leading.list.kanji?.spoken == "Result 1 of \(leading.list.rows.count + 1), Kanji primary")
  }

  @Test("a query nothing matches has no results screen")
  func noResults() async throws {
    #expect(try await SearchedScreen.search("qzxvkj").screen == .noResults)
  }

  @Test("what the dictionaries answer is handed to the core as it is")
  func evidenceIsEncodedAsAnswered() throws {
    let ranks: [LanguageReferenceID: FrequencyRanks] = [
      first.id: [result(3, from: jlpt, for: first), result(1_234, from: youTube, for: first)],
      second.id: [
        result(nil, from: jlpt, for: second),
        .unavailable(FrequencyPackUnavailable(pack: youTube, reason: "Pack unavailable")),
      ],
      third.id: [.unavailable(FrequencyPackUnavailable(pack: nil, reason: "Unreadable"))],
    ]
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let frequency = LearnerFrequency(ranks, for: [first.id, second.id, third.id, fourth.id])
    let json = try #require(
      try JSONSerialization.jsonObject(with: encoder.encode(frequency)) as? [String: Any])
    let dictionaries = try #require(json["dictionaries"] as? [[String: Any]])
    #expect(
      dictionaries.map { $0["id"] as? String }
        == ["zenbu.jlpt.waller.levels", "zenbu.tubelex.youtube.ja.unidic-3.1"])
    #expect(dictionaries.map { $0["kind"] as? String } == ["level", "rank"])
    #expect(dictionaries[0]["name"] as? String == "JLPT Levels")
    #expect(dictionaries[1]["coveredSourceRows"] as? Int == 100_000)
    let encoded = String(decoding: try encoder.encode(frequency.entries), as: UTF8.self)
    #expect(
      encoded
        == """
        {"\(first.id.rawValue)":[{"dictionary":0,"value":3},{"dictionary":1,"value":1234}],\
        "\(second.id.rawValue)":[{"dictionary":0,"value":null},\
        {"dictionary":1,"unavailable":"Pack unavailable"}],\
        "\(third.id.rawValue)":[{"dictionary":null,"unavailable":"Unreadable"}]}
        """)
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

  @Test("a word page's frequency rows name each dictionary, its value, and its details")
  func frequencyRows() async throws {
    let eat = try #require(try await LookupClient.live.entriesMatchingForm("食べる").first)
    let rows = await FrequencyRow.rows(for: eat.id, using: try freshInstall("rows"))
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
    let rows = await FrequencyRow.rows(
      for: first.id, using: FrequencyCapability { _ in throw FrequencyPackError.invalidArtifact })
    #expect(rows.count == 1)
    #expect(rows.first?.pack == nil)
    #expect(rows.first?.id == "frequency-unavailable")
    #expect(rows.first?.source == "Frequency")
    #expect(rows.first?.value == "Unavailable")
    #expect(rows.first?.label == "Frequency rank unavailable")
    #expect(rows.first?.details.explanation == "Frequency data unavailable")
    #expect(rows.first?.details.pack == nil)
  }

  @Test("a word sheet's candidates are rows in the order given, with their chips")
  func candidateRows() throws {
    let ranks: [LanguageReferenceID: FrequencyRanks] = [
      first.id: [result(20, from: youTube, for: first)],
      second.id: [result(nil, from: youTube, for: second)],
    ]
    var request = WordRowsRequest(
      entries: [first, second].map { WordRowsRequest.Entry(id: $0.id.rawValue, summary: $0.summary) },
      frequency: nil,
      known: [second.id.rawValue])
    let loading = request.rowsByEntry()
    #expect(loading[first.id.rawValue]?.spoken == "Result 1 of 2, Frequency rank loading")
    #expect(loading[first.id.rawValue]?.summary == first.summary)
    request.frequency = LearnerFrequency(ranks, for: [first.id, second.id])
    let rows = request.rowsByEntry()
    #expect(rows[first.id.rawValue]?.chips == [
      FrequencyChip(
        pack: youTube.id.rawValue, source: "YouTube", value: "20", tier: .veryCommon)
    ])
    #expect(
      rows[second.id.rawValue]?.spoken
        == "Known, Result 2 of 2, YouTube has no rank for this entry")
  }
}
