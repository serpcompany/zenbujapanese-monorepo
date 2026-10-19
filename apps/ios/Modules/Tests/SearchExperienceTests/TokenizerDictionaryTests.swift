import CryptoKit
import Foundation
import Testing

@testable import SearchExperience

@Suite("Tokenizer dictionary")
struct TokenizerDictionaryTests {
  static let emptyGzip = Data([
    0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0x03, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ])

  static func packed(_ filename: String) throws -> Data {
    try Data(contentsOf: try #require(TokenizerDictionary.resourceURL(filename)))
  }

  @Test(
    "unpacks a dictionary file to the bytes gunzip writes",
    arguments: [
      ("unk_char.dat.gz", 65_536, "218e90b85ece7734cfd1d10a3d3153083ff7899693060755985095d365663793"),
      (
        "unk_invoke.dat.gz", 1_048_576,
        "e9842ac062646d8da0e6728483eaeed58ee5518d2b6313d393c4fa4c16e84dbd"
      ),
    ])
  func unpacksADictionaryFile(filename: String, count: Int, sha256: String) throws {
    let unpacked = try #require(Gunzip.inflated(try Self.packed(filename)))
    defer { unpacked.release() }
    let bytes = UnsafeRawBufferPointer(start: unpacked.pointer, count: unpacked.count)
    #expect(unpacked.count == count)
    #expect(SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() == sha256)
  }

  @Test("refuses a file that is cut short, altered, empty, or not gzip")
  func refusesWhatIsNotAWholeGzipFile() throws {
    let whole = try Self.packed("unk_char.dat.gz")
    var wrongChecksum = whole
    wrongChecksum[whole.count - 6] ^= 0xff
    var wrongLength = whole
    wrongLength[whole.count - 3] ^= 0x01
    var wrongContents = whole
    wrongContents[whole.count / 2] ^= 0xff
    for refused in [
      whole.prefix(whole.count / 2), whole.dropLast(1), wrongChecksum, wrongLength, wrongContents,
      Self.emptyGzip, Data(), Data("a dictionary file that was never packed".utf8),
    ] {
      #expect(Gunzip.inflated(refused) == nil)
    }
  }

  @Test("hands the core each file it tokenizes with, unpacked, and no other file")
  func handsOverTheTokenizersFiles() throws {
    let unpacked = try #require(TokenizerDictionary.unpacked("unk_char"))
    defer { unpacked.release() }
    #expect(unpacked.count == 65_536)
    #expect(TokenizerDictionary.unpacked("kuromoji") == nil)
    #expect(TokenizerDictionary.unpacked("../LanguageReferenceData") == nil)
  }

  @Test("the bundled files tokenize a sentence into the words Kuromoji found in it")
  func tokenizesSentences() async throws {
    let text = DictionaryTextData()
    #expect(await text.availability() == .full)
    func words(_ japanese: String) async throws -> [[String]] {
      try await text.linkedWords(LinkedText(text: japanese, query: "", highlightedEntry: nil))
        .map { [$0.surface, $0.reading ?? ""] }
    }
    #expect(
      try await words("猫が魚を食べました") == [
        ["猫", "ネコ"], ["が", "ガ"], ["魚", "サカナ"], ["を", "ヲ"], ["食べました", "タベマシタ"],
      ])
    #expect(
      try await words("静かな図書館でﾊﾝｶｸとZenbuを勉強しなかった。") == [
        ["静かな", "シズカナ"], ["図書館", "トショカン"], ["で", "デ"], ["ﾊﾝｶｸ", "ﾊﾝｶｸ"], ["と", "ト"],
        ["Zenbu", "Zenbu"], ["を", "ヲ"], ["勉強", "ベンキョウ"], ["しなかった", "シナカッタ"],
        ["。", "。"],
      ])
  }
}
