import Foundation
import Testing
import os

@testable import SearchExperience

extension SearchLatencyTests {
  private struct KnownWordCount: Sendable {
    let label: String
    let words: @Sendable ([String], JapaneseTextAnalysisClient) async -> Int

    static let aLineAtATime = KnownWordCount(
      label: "a line at a time, reading each linked word's entry"
    ) { lines, analysis in
      await analysis.countedALineAtATime(lines).count
    }

    static let aFewLinesACall = KnownWordCount(
      label: "\(Comprehension.linesPerCall) lines a call"
    ) { lines, analysis in
      await Comprehension.countedWords(in: lines, analysis: analysis)?.count ?? 0
    }

    static let everyLineInOneCall = KnownWordCount(label: "every line in one call") {
      lines, analysis in
      await analysis.countedWords(lines).count
    }
  }

  private struct FreshEngine: Sendable {
    let analysis: JapaneseTextAnalysisClient
    let calls: OSAllocatedUnfairLock<[Double]>

    init() async {
      let text = DictionaryTextData()
      _ = await text.availability()
      let live = JapaneseTextAnalysisClient.live(text: text)
      let calls = OSAllocatedUnfairLock(initialState: [Double]())
      self.calls = calls
      analysis = JapaneseTextAnalysisClient(
        availability: live.availability, linkedTokens: live.linkedTokens,
        countedWords: { lines in
          let clock = ContinuousClock()
          let began = clock.now
          let words = await live.countedWords(lines)
          calls.withLock { $0.append(SearchLatencyTests.value(clock.now - began)) }
          return words
        })
    }

    func linkingTime(of lines: some Sequence<String>) async -> Double {
      SearchLatencyTests.value(
        await ContinuousClock().measure {
          for line in lines { _ = await analysis.linkedTokens(line, SearchQuery(""), nil) }
        })
    }
  }

  @Test("prints how long a video's known-word count takes, and how long a caption card waits on it")
  func measureKnownWordCount() async throws {
    let clock = ContinuousClock()
    var listed: [String] = []
    for word in Self.exampleWords {
      listed += await Self.listed(word).map(\.sentence.japanese)
    }
    let lines = listed
    let ways = [KnownWordCount.aLineAtATime, .aFewLinesACall, .everyLineInOneCall]
    _ = await KnownWordCount.aLineAtATime.words(lines, await FreshEngine().analysis)

    var first = ways.map { _ in [Double]() }
    var calls = first
    var again = first
    var afterwards = first
    var words = ways.map { _ in 0 }
    for _ in 0..<Self.passes {
      for (index, way) in ways.enumerated() {
        let engine = await FreshEngine()
        let counted = await clock.measure { words[index] = await way.words(lines, engine.analysis) }
        first[index].append(Self.value(counted))
        calls[index] += engine.calls.withLock { $0 }
        let recounted = await clock.measure { _ = await way.words(lines, engine.analysis) }
        again[index].append(Self.value(recounted))
        afterwards[index].append(await engine.linkingTime(of: lines.prefix(20)))
      }
    }
    let jit = ProcessInfo.processInfo.environment["JSC_useJIT"] ?? "unset"
    print(
      "SEARCH-LATENCY the known words of \(lines.count) caption lines, counted \(Self.passes) "
        + "times each way in turn, on a fresh engine each time (JSC_useJIT is \(jit))")
    for (index, way) in ways.enumerated() {
      let perCount = calls[index].count / Self.passes
      let held =
        calls[index].isEmpty
        ? "" : "; each call, \(perCount) a count, \(Self.summary(calls[index]))"
      print(
        "SEARCH-LATENCY \(way.label): \(words[index]) words in \(Self.summary(first[index]))"
          + held
          + "; counted again, \(Self.summary(again[index]))"
          + "; then 20 of its captions link in \(Self.summary(afterwards[index]))")
    }

    let card = lines.suffix(1)
    var alone: [Double] = []
    for _ in 0..<3 { alone.append(await FreshEngine().linkingTime(of: card)) }
    print("SEARCH-LATENCY a caption card links alone on a fresh engine: " + Self.summary(alone))
    for (index, way) in ways.enumerated() {
      let whole = first[index].sorted()[Self.passes / 2]
      var waits: [Double] = []
      for tenths in stride(from: 1, through: 9, by: 2) {
        let engine = await FreshEngine()
        let counting = Task { await way.words(lines, engine.analysis) }
        try await Task.sleep(for: .milliseconds(Int(whole) * tenths / 10))
        waits.append(await engine.linkingTime(of: card))
        _ = await counting.value
      }
      print(
        "SEARCH-LATENCY a caption card that appears while the count runs \(way.label) links in "
          + Self.summary(waits))
    }
    print(
      "SEARCH-LATENCY memory after \(1 + ways.count * (Self.passes + 5) + 3) engines: "
        + "\(Self.footprint().current / 1_048_576) MB, "
        + "\(Self.footprint().peak / 1_048_576) MB at its highest")
  }
}
