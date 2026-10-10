import Foundation
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

  @Test("prints how long linking the words of 200 example sentences takes, first and again")
  func measureLinking() async throws {
    let clock = ContinuousClock()
    var sentences: [ExampleSentence] = []
    for word in ["食べる", "行く", "学校", "水", "見る"] {
      sentences += try await ExampleSentenceClient.live.retrieve(.directJapanese(SearchQuery(word)))
        .sentences.prefix(40)
    }
    var analyzed: [Double] = []
    var first: [Double] = []
    var again: [Double] = []
    for _ in 0...Self.passes {
      analyzed.append(
        Self.value(
          await clock.measure {
            for sentence in sentences {
              _ = try? await JapaneseMorphologyClient.kuromoji.analyze(sentence.japanese)
            }
          }))
      let analysis = JapaneseTextAnalysisClient.resolving(
        morphologyClient: .kuromoji, lookupClient: .live)
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
      ("Kuromoji alone", analyzed), ("linked for the first time", first), ("linked again", again),
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
