import Foundation
import JavaScriptCore
import Testing

@testable import SearchExperience

@Suite(
  "Search latency",
  .serialized,
  .enabled(if: ProcessInfo.processInfo.environment["ZENBU_MEASURE_SEARCH"] == "1"))
struct SearchLatencyTests {
  static let queries = [
    "taberu", "食べる", "食べました", "tabeta", "dog", "water", "to eat", "japan", "nihon", "日本",
    "い", "あ", "の", "a", "the", "go", "する", "行", "kono", "日本語", "猫", "cat", "love", "勉強した",
    "mondai", "school", "学校", "gakkou", "ありがとう", "run", "see", "見た", "です", "it", "man",
    "kaetta", "makasete", "よんだら", "prison", "静", "いる", "miru", "house", "ie", "家",
  ]
  static let forms = [
    "食べる", "行く", "見る", "日本", "猫", "する", "ある", "こと", "私", "学校", "先生", "が", "は", "を", "の", "に",
    "taberu", "inu", "kau", "kou",
  ]
  static let kanji = ["要", "日", "人", "食", "行", "生", "大", "一"]
  static let passes = 5

  @Test("prints each query's uncached search time and the memory the searches reach")
  func measure() async throws {
    let data = LanguageReferenceData(validatesBundledArtifact: false)
    let clock = ContinuousClock()
    let opening = try await clock.measure { _ = try await data.search(SearchQuery("zenbu")) }
    print("SEARCH-LATENCY first search, which opens the dictionary: \(Self.milliseconds(opening))")
    let settled = Self.footprint()

    var timings: [String: [Double]] = [:]
    var counts: [String: Int] = [:]
    for _ in 0..<Self.passes {
      for query in Self.queries {
        var found = 0
        let elapsed = try await clock.measure {
          found = try await data.search(SearchQuery(query)).entries.count
        }
        timings[query, default: []].append(Self.value(elapsed))
        counts[query] = found
      }
    }
    for query in Self.queries {
      let sorted = (timings[query] ?? []).sorted()
      print(
        "SEARCH-LATENCY \(query)\t\(counts[query] ?? 0) results\tmedian "
          + String(format: "%.1f", sorted[sorted.count / 2])
          + " ms\tfastest " + String(format: "%.1f", sorted[0]) + " ms")
    }
    let medians = Self.queries.compactMap { timings[$0]?.sorted()[Self.passes / 2] }
    print("SEARCH-LATENCY sum of medians: " + String(format: "%.0f", medians.reduce(0, +)) + " ms")

    let entry = try #require(try await data.entries(matchingForm: "食べる").first)
    let reads = try await clock.measure {
      for _ in 0..<1_000 { _ = try await data.entry(entry.id) }
    }
    print("SEARCH-LATENCY 1,000 entries read by ID in \(Self.milliseconds(reads))")
    for pass in ["first", "again"] {
      let forms = try await clock.measure {
        for form in Self.forms { _ = try await data.entries(matchingForm: form) }
      }
      let kanji = try await clock.measure {
        for character in Self.kanji { _ = try await data.entries(containingKanji: character) }
      }
      print(
        "SEARCH-LATENCY \(pass): \(Self.forms.count) exact forms in \(Self.milliseconds(forms)), "
          + "\(Self.kanji.count) kanji's words in \(Self.milliseconds(kanji))")
    }
    print(
      "SEARCH-LATENCY memory: \(settled.current / 1_048_576) MB after the first search, "
        + "\(Self.footprint().current / 1_048_576) MB after the last, "
        + "\(Self.footprint().peak / 1_048_576) MB at its highest")
  }

  @Test("prints how long the tokenizer takes to start")
  func measureTokenizerStart() async throws {
    let clock = ContinuousClock()
    var starts: [Double] = []
    for _ in 0..<Self.passes {
      let text = DictionaryTextData()
      _ = try await text.exampleCount("猿")
      starts.append(Self.value(await clock.measure { _ = await text.availability() }))
    }
    print(
      "SEARCH-LATENCY the tokenizer starts in "
        + String(format: "%.0f", starts.sorted()[Self.passes / 2]) + " ms at the median, "
        + String(format: "%.0f", starts.max() ?? 0) + " ms at worst")
  }

  @Test("prints how long linking the words of 200 example sentences takes, first and again")
  func measureLinking() async throws {
    let clock = ContinuousClock()
    var sentences: [ExampleSentence] = []
    for word in ["食べる", "行く", "学校", "水", "見る"] {
      sentences += await ExampleSentenceClient.live.listed(SearchQuery(word), nil, false)
        .sentences.prefix(40)
    }
    var first: [Double] = []
    var again: [Double] = []
    for _ in 0...Self.passes {
      let text = DictionaryTextData()
      _ = await text.availability()
      let analysis = JapaneseTextAnalysisClient.live(text: text)
      for pass in [true, false] {
        let elapsed = Self.value(
          await clock.measure {
            for sentence in sentences {
              _ = await analysis.linkedTokens(sentence.japanese, SearchQuery(""), nil)
            }
          })
        if pass { first.append(elapsed) } else { again.append(elapsed) }
      }
    }
    for (label, timings) in [
      ("linked for the first time", first), ("linked again", again),
    ] {
      let sorted = timings.dropFirst().sorted()
      print(
        "SEARCH-LATENCY \(sentences.count) sentences \(label): median "
          + String(format: "%.0f", sorted[sorted.count / 2])
          + " ms, fastest " + String(format: "%.0f", sorted[0]) + " ms")
    }
  }

  @Test("prints how long an abandoned search keeps the dictionary from the next one")
  func measureAbandonedSearches() async throws {
    let clock = ContinuousClock()
    for query in ["い", "a", "s", "k", "the", "の", "ta"] {
      let data = LanguageReferenceData(validatesBundledArtifact: false)
      _ = try await data.search(SearchQuery("zenbu"))
      _ = try await data.search(SearchQuery(query))
      var waits: [Double] = []
      for tenths in 1...9 {
        let fresh = LanguageReferenceData(validatesBundledArtifact: false)
        _ = try await fresh.search(SearchQuery("zenbu"))
        let whole = Self.value(
          try await clock.measure { _ = try await fresh.search(SearchQuery(query + " ")) })
        let abandoned = LanguageReferenceData(validatesBundledArtifact: false)
        _ = try await abandoned.search(SearchQuery("zenbu"))
        let search = Task { try await abandoned.search(SearchQuery(query)) }
        try await Task.sleep(for: .milliseconds(Int(whole) * tenths / 10))
        let cancelled = clock.now
        search.cancel()
        _ = try await abandoned.search(SearchQuery("zenbu japanese"))
        waits.append(Self.value(clock.now - cancelled))
      }
      print(
        "SEARCH-LATENCY \(query) abandoned at nine points: the next search waited "
          + String(format: "%.0f", waits.sorted()[4]) + " ms at the median, "
          + String(format: "%.0f", waits.max() ?? 0) + " ms at worst")
    }
  }

  @Test("prints how long the presentation engine takes to start and to build each screen")
  func measureScreens() async throws {
    let clock = ContinuousClock()
    let files = clock.measure { _ = KanjiFiles.bundled }
    var starts: [Double] = []
    for _ in 0..<Self.passes {
      let core = PresentationCore(kanji: { KanjiFiles.bundled })
      starts.append(
        Self.value(clock.measure { _ = core.rubySegments(surface: "日本", reading: "にほん") }))
    }
    print(
      "SEARCH-LATENCY the kanji files read in \(Self.milliseconds(files)); an engine starts "
        + "and draws its first furigana in " + Self.summary(starts))

    let frequency = try FrequencyPackManager.freshInstall(storagePrefix: "SearchLatency")
    let capability = FrequencyCapability { try await frequency.evidence(for: $0) }
    var byDefault: [Double] = []
    var sorted: [Double] = []
    var entries: [DictionaryEntry] = []
    for text in ["dog", "食べる", "い", "taberu", "日本", "water", "go", "する"] {
      let query = SearchQuery(text)
      let results = try await LookupClient.live.search(query)
      entries += results.entries.prefix(12)
      var request = ResultsScreenRequest(
        query: query, results: results.listed,
        exampleCount: await ExampleSentenceClient.live.count(query, results),
        learner: ResultsLearner())
      guard case .results(let loading) = try await request.screen() else { continue }
      try await request.loadFrequency(for: loading, using: capability)
      guard case .results(let list) = try await request.screen() else { continue }
      for _ in 0..<20 {
        byDefault.append(Self.value(try await clock.measure { _ = try await request.screen() }))
      }
      guard let dictionary = list.menu?.sort.options.dropFirst().first else { continue }
      request.learner.sort = dictionary.value
      for _ in 0..<20 {
        sorted.append(Self.value(try await clock.measure { _ = try await request.screen() }))
      }
    }
    print("SEARCH-LATENCY a results screen, by Default: " + Self.summary(byDefault))
    print("SEARCH-LATENCY a results screen, sorted by a dictionary: " + Self.summary(sorted))

    let words = Dictionary(entries.map { ($0.id, $0) }) { first, _ in first }.values
    let pages = words.map { entry in Self.value(clock.measure { _ = WordPage(entry) }) }
    print("SEARCH-LATENCY a word page, for \(pages.count) words: " + Self.summary(pages))

    let unused = PresentationCore(kanji: { KanjiFiles.bundled })
    _ = unused.rubySegments(surface: "日本", reading: "にほん")
    let furigana = words.map { entry in
      Self.value(
        clock.measure {
          _ = unused.rubySegments(surface: entry.headword, reading: entry.reading)
        })
    }
    print("SEARCH-LATENCY a word's furigana, uncached: " + Self.summary(furigana))
    let glosses = words.compactMap(\.meanings.first).map { meaning in
      Self.value(clock.measure { _ = unused.gloss(meaning) })
    }
    print("SEARCH-LATENCY a short meaning, uncached: " + Self.summary(glosses))
    let queries = (0..<200).map { index in
      Self.value(clock.measure { _ = SearchQuery("ＮＩＨＯＮ　go \(index)") })
    }
    print("SEARCH-LATENCY a query normalized: " + Self.summary(queries))

    let kanji = KanjiLookupClient.live(lookupClient: .live)
    var kanjiPages: [Double] = []
    var elementPages: [Double] = []
    for text in Self.kanji {
      let character = try #require(KanjiCharacter(text))
      let related = try await kanji.relatedWords(character)
      kanjiPages.append(
        Self.value(try clock.measure { _ = try kanji.page(character, related, nil) }))
      let element = try #require(KanjiElementID(text))
      elementPages.append(Self.value(try clock.measure { _ = try kanji.element(element) }))
    }
    print("SEARCH-LATENCY a kanji page: " + Self.summary(kanjiPages))
    print("SEARCH-LATENCY a kanji element page: " + Self.summary(elementPages))
  }

  @Test("prints the memory a session reaches, step by step; run it alone")
  func measureSession() async throws {
    func report(_ step: String) {
      let memory = Self.footprint()
      print(
        "SEARCH-LATENCY memory after \(step): \(memory.current / 1_048_576) MB, "
          + "\(memory.peak / 1_048_576) MB at its highest")
    }
    report("launch")
    _ = JapaneseRuby(surface: "日本", reading: "にほん")
    report("the kanji files and the presentation engine")
    var searched: [(SearchQuery, LookupSearchResults)] = []
    for text in ["dog", "食べる", "taberu", "日本", "water", "go", "する"] {
      let query = SearchQuery(text)
      searched.append((query, try await LookupClient.live.search(query)))
    }
    report("seven searches")
    let broad = SearchQuery("い")
    searched.append((broad, try await LookupClient.live.search(broad)))
    report("a broad search, い")
    for (query, results) in searched {
      _ = await ExampleSentenceClient.live.count(query, results)
    }
    report("each search's example count")
    let analysis = JapaneseTextAnalysisClient.live()
    let listed = await ExampleSentenceClient.live.listed(SearchQuery("食べる"), nil, false)
    var words = 0
    for sentence in listed.sentences.prefix(40) {
      words += await analysis.linkedTokens(sentence.japanese, SearchQuery(""), nil).count
    }
    report("the tokenizer's start and \(words) linked words")
    let kanji = KanjiLookupClient.live(lookupClient: .live)
    for text in Self.kanji {
      let character = try #require(KanjiCharacter(text))
      _ = try kanji.page(character, try await kanji.relatedWords(character), nil)
    }
    report("eight kanji pages")
  }

  @Test("prints how long romaji, the radical panel, a stroke diagram and the kanji check take")
  func measureReadingAids() async throws {
    let clock = ContinuousClock()
    let core = PresentationCore(
      kanji: { KanjiFiles.bundled }, radicals: { RadicalLookupClient.bundledFile() })
    var entries: [DictionaryEntry] = []
    for query in Self.queries {
      entries += try await LookupClient.live.search(SearchQuery(query)).entries
    }
    let readings = Array(Set(entries.map(\.reading)))
    _ = core.romaji("あ")
    let written = clock.measure { for reading in readings { _ = core.romaji(reading) } }
    let again = clock.measure { for reading in readings { _ = core.romaji(reading) } }
    let foundation = clock.measure {
      for reading in readings { _ = reading.applyingTransform(.toLatin, reverse: false) }
    }
    print(
      "SEARCH-LATENCY \(readings.count) readings in romaji: \(Self.milliseconds(written)) first, "
        + "\(Self.milliseconds(again)) again; Foundation's own took \(Self.milliseconds(foundation))")

    var sentences: [[JapaneseTextToken]] = []
    for word in ["食べる", "行く", "学校", "水", "見る"] {
      for sentence in await ExampleSentenceClient.live.listed(SearchQuery(word), nil, false)
        .sentences.prefix(40)
      {
        sentences.append(
          await JapaneseTextAnalysisClient.live().linkedTokens(
            sentence.japanese, SearchQuery(""), nil))
      }
    }
    let spoken = clock.measure {
      for tokens in sentences { _ = core.romaji(of: tokens.map { ($0.surface, $0.reading) }) }
    }
    let spokenAgain = clock.measure {
      for tokens in sentences { _ = core.romaji(of: tokens.map { ($0.surface, $0.reading) }) }
    }
    print(
      "SEARCH-LATENCY \(sentences.count) sentences in romaji: \(Self.milliseconds(spoken)) first, "
        + "\(Self.milliseconds(spokenAgain)) again")

    let opening = try clock.measure {
      let _: RadicalPanel = try core.answer("radicalPanel", [String]())
    }
    var picks: [Double] = []
    for selection in [["一"], ["汁"], ["汁", "母"], ["口", "木"], ["一", "｜", "口"], ["日"]] {
      picks.append(
        Self.value(
          try clock.measure { let _: RadicalPanel = try core.answer("radicalPanel", selection) }))
    }
    print(
      "SEARCH-LATENCY radical panel: opens in \(Self.milliseconds(opening)), a pick "
        + Self.summary(picks))

    var diagrams: [Double] = []
    for character in Self.kanji + ["鬱", "議", "驚"] {
      let kanji = try #require(KanjiCharacter(character))
      diagrams.append(
        Self.value(
          try await clock.measure { _ = try await KanjiStrokeOrderClient.live.diagram(kanji) }))
    }
    print("SEARCH-LATENCY a stroke diagram: " + Self.summary(diagrams))

    let scalars = (0x4E00..<0x5200).compactMap(Unicode.Scalar.init).map(String.init)
    let checked = clock.measure { for scalar in scalars { _ = core.isKanji(scalar) } }
    let checkedAgain = clock.measure { for scalar in scalars { _ = core.isKanji(scalar) } }
    print(
      "SEARCH-LATENCY \(scalars.count) kanji checks: \(Self.milliseconds(checked)) first, "
        + "\(Self.milliseconds(checkedAgain)) again")
  }

  private static func summary(_ timings: [Double]) -> String {
    let sorted = timings.sorted()
    guard let worst = sorted.last else { return "nothing measured" }
    return String(format: "median %.2f ms, worst %.2f ms", sorted[sorted.count / 2], worst)
  }

  private static func value(_ duration: Duration) -> Double {
    Double(duration.components.seconds) * 1_000
      + Double(duration.components.attoseconds) / 1_000_000_000_000_000
  }

  private static func milliseconds(_ duration: Duration) -> String {
    String(format: "%.1f ms", value(duration))
  }

  private static func footprint() -> (current: UInt64, peak: UInt64) {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    guard result == KERN_SUCCESS else { return (0, 0) }
    return (info.phys_footprint, UInt64(info.ledger_phys_footprint_peak))
  }
}
