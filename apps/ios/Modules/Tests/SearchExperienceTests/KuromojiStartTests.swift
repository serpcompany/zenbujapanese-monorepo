import CryptoKit
import Foundation
import Testing

@testable import SearchExperience

@Suite("Kuromoji start")
struct KuromojiStartTests {
  static let emptyGzip = Data([
    0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0x03, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ])

  static func packed(_ filename: String) throws -> Data {
    try Data(contentsOf: try #require(KuromojiEngine.resourceURL(filename)))
  }

  @Test(
    "unpacks a dictionary file to the bytes gunzip writes",
    arguments: [
      ("unk_char.dat.gz", 65_536, "218e90b85ece7734cfd1d10a3d3153083ff7899693060755985095d365663793"),
      (
        "unk_compat.dat.gz", 262_144,
        "b9f3cb34710353434dfc623300bcad22b622895dca3195af49e85d3de2438214"
      ),
    ])
  func unpacksADictionaryFile(filename: String, count: Int, sha256: String) throws {
    let unpacked = try #require(Gunzip.inflated(try Self.packed(filename)))
    defer { free(unpacked.pointer) }
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

  @Test("hands kuromoji.js its files unpacked, and refuses a script it cannot hand them to")
  func readsUnpackedFiles() throws {
    let url = try #require(KuromojiEngine.resourceURL("kuromoji.js"))
    let script = try #require(
      KuromojiEngine.readingUnpackedFiles(try String(contentsOf: url, encoding: .utf8)))
    #expect(!script.contains("gz.decompress()"))
    #expect(KuromojiEngine.readingUnpackedFiles(script) == nil)
  }

  @Test("finds the words kuromoji.js finds when it unpacks the files itself")
  func analyzesSentences() async throws {
    let plain = try await JapaneseMorphologyClient.kuromoji.analyze("猫が魚を食べました")
    #expect(plain.candidates.map(\.surface) == ["猫", "が", "魚", "を", "食べ", "まし", "た"])
    #expect(plain.candidates.map(\.dictionaryForm) == ["猫", "が", "魚", "を", "食べる", "ます", "た"])
    #expect(plain.candidates.map(\.reading) == ["ネコ", "ガ", "サカナ", "ヲ", "タベ", "マシ", "タ"])

    let mixed = try await JapaneseMorphologyClient.kuromoji.analyze(
      "静かな図書館でﾊﾝｶｸとZenbuを勉強しなかった。")
    #expect(
      mixed.candidates.map(\.surface) == [
        "静か", "な", "図書館", "で", "ﾊﾝｶｸ", "と", "Zenbu", "を", "勉強", "し", "なかっ", "た", "。",
      ])
    #expect(
      mixed.candidates.map(\.dictionaryForm) == [
        "静か", "だ", "図書館", "で", "ﾊﾝｶｸ", "と", "Zenbu", "を", "勉強", "する", "ない", "た", "。",
      ])
    #expect(
      mixed.candidates.map(\.reading) == [
        "シズカ", "ナ", "トショカン", "デ", "ﾊﾝｶｸ", "ト", "Zenbu", "ヲ", "ベンキョウ", "シ", "ナカッ", "タ", "。",
      ])
    #expect(mixed.candidates.filter(\.isOutOfVocabulary).map(\.surface) == ["ﾊﾝｶｸ", "Zenbu"])
    #expect(mixed.candidates.map { $0.partOfSpeech.first } == [
      "名詞", "助動詞", "名詞", "助詞", "名詞", "助詞", "名詞", "助詞", "名詞", "動詞", "助動詞", "助動詞", "記号",
    ])
  }
}
