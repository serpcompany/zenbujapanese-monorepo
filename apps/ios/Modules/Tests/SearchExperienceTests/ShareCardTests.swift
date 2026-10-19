import Foundation
import ImageIO
import Testing

@testable import SearchExperience

@Suite("Share sheet card", .serialized)
struct ShareCardTests {
  static let reader = ShareCardReader.onDevice(
    unpackingTokenizerInto: URL.temporaryDirectory.appending(
      path: "share-card-tests-\(UUID().uuidString)", directoryHint: .isDirectory))

  static func card(_ item: SharedItem) async -> ShareCard {
    await reader.card(for: item)
  }

  static func shownWord(_ item: SharedItem) async throws -> DictionaryEntry {
    let card = await card(item)
    guard case .word(let entry) = card else {
      Issue.record("Expected a word card, got \(card)")
      throw CancellationError()
    }
    return entry
  }

  static func shownText(_ item: SharedItem) async throws -> ShareCardText {
    let card = await card(item)
    guard case .text(let text) = card else {
      Issue.record("Expected a text card, got \(card)")
      throw CancellationError()
    }
    return text
  }

  static func photo(_ name: String) throws -> Data {
    try Data(
      contentsOf: try #require(
        Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures/ImageText")
      ))
  }

  @Test("a conjugated word shows the card of the word it is a form of")
  func conjugatedWord() async throws {
    let entry = try await Self.shownWord(.text("  食べた\n"))
    #expect(entry.headword == "食べる")
    #expect(entry.reading == "たべる")
  }

  @Test("a word written alone, such as one kanji, shows that word's card")
  func wordWrittenAlone() async throws {
    let entry = try await Self.shownWord(.text("駅"))
    #expect(entry.headword == "駅")
    #expect(entry.reading == "えき")
  }

  @Test("a sentence lists its words with their meanings, leaving out particles")
  func sentence() async throws {
    let text = try await Self.shownText(.text("猫が魚を食べました"))
    #expect(text.source == .shared)
    #expect(text.isJapanese)
    #expect(text.text == "猫が魚を食べました")
    #expect(text.words.map(\.entry.headword) == ["猫", "魚", "食べる"])
    #expect(text.words.map(\.surface) == ["猫", "魚", "食べました"])
    #expect(text.words.allSatisfy { !$0.entry.summary.isEmpty })
  }

  @Test("a reading several words share lists each of them, each once")
  func sharedReading() async throws {
    let text = try await Self.shownText(.text("かみ"))
    #expect(text.words.count > 1)
    #expect(text.words.count <= ShareCardReader.candidatesShown)
    #expect(text.words.allSatisfy { $0.entry.reading == "かみ" })
    #expect(Set(text.words.map(\.id)).count == text.words.count)
  }

  @Test("English lists the dictionary's words for it, untranslated")
  func english() async throws {
    let text = try await Self.shownText(.text("cat"))
    #expect(!text.isJapanese)
    #expect(text.words.contains { $0.entry.headword == "猫" })
    #expect(text.words.count <= ShareCardReader.searchResultsShown)
  }

  @Test("blank text asks for something to look up")
  func blank() async {
    #expect(await Self.card(.text(" \n ")) == .missing(.noText))
  }

  @Test("a photo shows the Japanese found in it, line by line, and its words")
  func photo() async throws {
    let text = try await Self.shownText(.image(try Self.photo("horizontal-japanese.png")))
    #expect(text.source == .photo)
    #expect(text.text == "駅の近くに本屋があります\n毎朝コーヒーを飲みます")
    let headwords = text.words.map(\.entry.headword)
    for word in ["駅", "本屋", "毎朝", "飲む"] {
      #expect(headwords.contains(word), "\(word) in \(headwords)")
    }
  }

  @Test("a photo with no Japanese in it says so")
  func photoWithoutJapanese() async throws {
    let blank = try #require(
      ImageCoding.drawing(width: 600, height: 400) { context in
        context.setFillColor(gray: 1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: 600, height: 400))
      }.flatMap(ImageCoding.pngData))
    #expect(await Self.card(.image(blank)) == .missing(.noJapaneseInPhoto))
  }

  @Test("a file that isn't an image says it couldn't be opened")
  func notAnImage() async {
    #expect(
      await Self.card(.image(Data("not an image".utf8))) == .missing(.unreadablePhoto))
  }

  @Test("a large photo is made smaller before its text is read")
  func largePhotoIsDownscaled() throws {
    let large = try #require(
      ImageCoding.drawing(width: 4_000, height: 3_000) { _ in }.flatMap(ImageCoding.pngData))
    let smaller = try #require(ShareCardReader.downscaled(large))
    let source = try #require(CGImageSourceCreateWithData(smaller as CFData, nil))
    let size = try #require(ImageCoding.pixelSize(of: source))
    #expect(size.width == ShareCardReader.longestPhotoSide)
    #expect(size.height == 1_536)
  }
}
