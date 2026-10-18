import Foundation
import Testing

@testable import SearchExperience

@Suite("Launch harness")
struct LaunchHarnessTests {
  @Test("a fresh start erases saved state only in a UI test build that asks for it")
  func freshStateOnlyInUITestBuilds() {
    let fresh = [LaunchHarness.freshStateKey: "1"]
    #expect(
      LaunchHarness.erasesSavedState(
        environment: fresh, bundleID: "com.zenbujapanese.dictionary.uitests"))
    #expect(
      !LaunchHarness.erasesSavedState(environment: fresh, bundleID: "com.zenbujapanese.dictionary"))
    #expect(
      !LaunchHarness.erasesSavedState(
        environment: fresh, bundleID: "com.zenbujapanese.dictionary.dev"))
    #expect(
      !LaunchHarness.erasesSavedState(
        environment: [:], bundleID: "com.zenbujapanese.dictionary.uitests"))
    #expect(!LaunchHarness.erasesSavedState(environment: fresh, bundleID: nil))
  }

  @Test("linking answers are held only in a launch that asks for it")
  func heldLinkingIsAskedFor() {
    #expect(LaunchHarness.holdsLinking([LaunchHarness.holdLinkingKey: "1"]))
    #expect(!LaunchHarness.holdsLinking([LaunchHarness.holdLinkingKey: "0"]))
    #expect(!LaunchHarness.holdsLinking([:]))
  }

  @Test("linking fails only for as many answers as a launch asks for")
  func failedLinkingCountsAnswers() {
    #expect(LaunchHarness.linkingFailures([LaunchHarness.failLinkingKey: "2"]) == 2)
    #expect(LaunchHarness.linkingFailures([LaunchHarness.failLinkingKey: "some"]) == 0)
    #expect(LaunchHarness.linkingFailures([:]) == 0)
  }

  @Test("Player, Search, and a kanji page count or record their draws only when a UI test asks")
  func countedDraws() {
    #expect(LaunchHarness.countsDraws([LaunchHarness.drawCountKey: "1"]))
    #expect(!LaunchHarness.countsDraws([:]))
  }

  @Test("each results list Search draws is recorded with how many of its rows have chips")
  func drawnResults() {
    let chip = FrequencyChip(pack: "list", source: "List", value: "1", tier: .veryCommon)
    let list = ResultsList(
      query: "q", sections: [.results], menu: nil, forgetsSort: false, examples: nil,
      readingRefinement: nil, heading: nil, kanji: nil,
      rows: [
        ListedWord(id: "a", summary: "", chips: [chip], spoken: ""),
        ListedWord(id: "b", summary: "", chips: [], spoken: ""),
      ], hiddenByFilter: nil, frequencyNotice: nil)
    #expect(ResultsList.drawnSummary(list) == "2 rows, 1 with chips")
  }

  @Test("each kanji page drawn is recorded with its own facts and how many of its words it has")
  func drawnKanjiPage() {
    let word = DictionaryEntry.fixture(id: "a", headword: "日本")
    let page = KanjiPage(
      sections: [],
      hasReference: true,
      stats: [KanjiPage.Stat(kind: "strokes", label: "Strokes", value: "4", spoken: "4 Strokes")],
      meanings: ["day"],
      readings: [
        KanjiPage.Reading(
          kind: "on", label: "On", value: "ニチ", words: [word], wordsText: "日本 · Japan",
          spoken: "On reading ニチ, 日本, Japan"),
        KanjiPage.Reading(
          kind: "kun", label: "Kun", value: "ひ", words: [], wordsText: "", spoken: nil),
      ],
      components: [], elements: [], words: [word, word], shareText: "日", savedReading: "ニチ")
    #expect(
      KanjiPage.drawnSummary(page) == "1 stats, 2 readings, 0 elements, 1 reading words, 2 words")
    #expect(
      KanjiPage.drawnSummary(nil) == "0 stats, 0 readings, 0 elements, 0 reading words, 0 words")
  }

  @Test("the sign-in stand-in offers Apple even in a build that otherwise can't sign in with it")
  func signInStandInOffersApple() {
    #expect(LaunchHarness.standsInForSignIn([LaunchHarness.signInStandInKey: "1"]))
    #expect(!LaunchHarness.standsInForSignIn([:]))
  }

  @Test("a Mac test names the link the app opens when the test posts its notice")
  func linkToOpen() {
    let link = "com.zenbujapanese.dictionary.uitests://look-up?text=%E8%A6%8B%E3%82%8B"
    #expect(LaunchHarness.linkToOpen([LaunchHarness.openLinkKey: link])?.absoluteString == link)
    #expect(LaunchHarness.linkToOpen([:]) == nil)
  }
}
