import Foundation
import Testing
import os

@testable import SearchExperience

@Suite("Known-word count")
struct KnownWordCountTests {
  static let playerStandInCaptions = ["駅の近くに本屋があります", "毎朝コーヒーを飲みます", "東京駅は三つ目の駅です"]

  static let captions =
    playerStandInCaptions + [
      "「ペンを持っていますか」",
      "昨日は映画を見なかった。",
      "えっ、本当に？",
      "毎朝コーヒーを飲みます",
      "OK、じゃあ行こう！",
      "",
      "猫\u{0}犬",
      "それは静かな町だった",
      "本をしまった",
      "彼女は日本語を三年間勉強しています。",
      "ありがとうございました",
      "エンマ",
    ]

  static let station = "d49b2f3c5cbf3002ebf317043cbebdad"
  static let everyMorning = "4581bc0429e4bc5fc6862e4659688412"
  static let smallerIDOfTheWordListedTwice = "176f4e451cc248ec386ac35f98801f36"

  static let countedInOrder = """
  d49b2f3c5cbf3002ebf317043cbebdad 1bb013302d54ca1c366e9bdef21599b8 08515d10063b95db54494b41fef26b4e
  45eefee1383a89cb3c6287032622e6fa 4581bc0429e4bc5fc6862e4659688412 0345e1c1134ffd5d3616da4973deb562
  262ea7b4342d41837de1d4302b25b5a2 700295bbd9adcb6d441d5b325ab67854 d49b2f3c5cbf3002ebf317043cbebdad
  36bd30a2fea17569d8ddd8aca5c81ac4 70ac68cb314b451e454bae957074c6a1 d49b2f3c5cbf3002ebf317043cbebdad
  8733544dc988feb1ec23f180ed1110c8 92193288617652476df21b92364504bd edacc0395a3ac1b6909fb76a3c9d0717
  7f490a9c9c0da94f4e9474f4efe74be1 440fd0a4097be4f107e4cdffd1b28d56 a2a2736c2dfe49a15044574d1da50eeb
  4581bc0429e4bc5fc6862e4659688412 0345e1c1134ffd5d3616da4973deb562 262ea7b4342d41837de1d4302b25b5a2
  818c411c7720a83ee142ddfa37edc898 02b555a06b217e79bca2d442a5a03d86 1dd06ede325b321de11e918788c2896c
  657d72cf95a8d0510ef6464fc032bae0 962f785b5d4f4a578aa9e6d64e15e907 6245b12a543fe049cb5c9e623e12fb75
  6fdf78cead4b3fce9675fb6adcbf2a7e edaa373c8957b703565ae24d79c4021d c81e1608bebbf039176be3e23f1c03bb
  5d11afaa7d4029ae137398655c6b9103 20e297f26e0313fde18f808727adbd42 aead518e84274687eaf56db5618ffd7f
  176f4e451cc248ec386ac35f98801f36
  """
    .split(whereSeparator: \.isWhitespace).map { LanguageReferenceID(rawValue: String($0)) }

  @Test("fixed caption lines count the same 34 words, each by its ID and in the captions' order")
  func fixedCaptions() async throws {
    let words = try #require(
      await Comprehension.countedWords(in: Self.captions, analysis: .live()))
    #expect(words.count == 34)
    #expect(Set(words).count == 29)
    #expect(words == Self.countedInOrder)
    #expect(words.last?.rawValue == Self.smallerIDOfTheWordListedTwice)
  }

  @Test("a learner who knows two of the captions' words sees 15%, 5 of 34 words known")
  func whatALearnerSees() async throws {
    let words = try #require(
      await Comprehension.countedWords(in: Self.captions, analysis: .live()))
    let known: Set = [Self.station, Self.everyMorning]
    let comprehension = Comprehension(words: words) { known.contains($0.rawValue) }
    #expect(comprehension == Comprehension(knownCount: 5, totalCount: 34))
    #expect(comprehension.percentText == "15%")
  }

  @Test("the Player stand-in's three captions count twelve words, as the UI test reads on screen")
  func playerStandIn() async throws {
    let words = try #require(
      await Comprehension.countedWords(in: Self.playerStandInCaptions, analysis: .live()))
    #expect(words == Array(Self.countedInOrder.prefix(12)))
  }

  @Test("one call counts the words the captions' cards link to one entry, function words aside")
  func sameWordsAsTheCards() async {
    let analysis = JapaneseTextAnalysisClient.live(text: DictionaryTextData())
    let counted = await analysis.countedWords(Self.captions)
    #expect(await analysis.countedALineAtATime(Self.captions) == counted)
    #expect(counted == Self.countedInOrder)
  }

  @Test("a long video's lines are asked for twenty at a time, in order")
  func twentyLinesACall() async {
    let asked = OSAllocatedUnfairLock(initialState: [Int]())
    let analysis = Self.counting { lines in asked.withLock { $0.append(lines.count) } }
    let lines = (0..<47).map(String.init)
    let words = await Comprehension.countedWords(in: lines, analysis: analysis)
    #expect(words?.map(\.rawValue) == lines)
    #expect(asked.withLock { $0 } == [20, 20, 7])
  }

  @Test("a count cancelled between calls asks for no more lines and answers nothing")
  func cancelledBetweenCalls() async {
    let asked = OSAllocatedUnfairLock(initialState: 0)
    let analysis = Self.counting { _ in
      asked.withLock { $0 += 1 }
      withUnsafeCurrentTask { $0?.cancel() }
    }
    let lines = (0..<47).map(String.init)
    let words = await Task { await Comprehension.countedWords(in: lines, analysis: analysis) }.value
    #expect(words == nil)
    #expect(asked.withLock { $0 } == 1)
  }

  @Test("a count cancelled before the core's call answers nothing, and the next count starts again")
  func cancelledInsideTheCore() async {
    let analysis = JapaneseTextAnalysisClient.live(text: DictionaryTextData())
    #expect(await analysis.availability() == .full)
    let words = await Task {
      withUnsafeCurrentTask { $0?.cancel() }
      return await Comprehension.countedWords(in: Self.captions, analysis: analysis)
    }.value
    #expect(words == nil)
    let counted = await Comprehension.countedWords(in: Self.captions, analysis: analysis)
    #expect(counted == Self.countedInOrder)
  }

  private static func counting(
    _ asked: @escaping @Sendable ([String]) -> Void
  ) -> JapaneseTextAnalysisClient {
    JapaneseTextAnalysisClient(
      availability: { .full },
      linkedTokens: { _, _, _ in [] },
      countedWords: { lines in
        asked(lines)
        return lines.map(LanguageReferenceID.init(rawValue:))
      })
  }
}

extension JapaneseTextAnalysisClient {
  func countedALineAtATime(_ lines: [String]) async -> [LanguageReferenceID] {
    var words: [LanguageReferenceID] = []
    for line in lines {
      let tokens = await linkedTokens(line, SearchQuery(""), nil)
      words += tokens.compactMap { $0.isFunctionWord ? nil : $0.entry?.id }
    }
    return words
  }
}
