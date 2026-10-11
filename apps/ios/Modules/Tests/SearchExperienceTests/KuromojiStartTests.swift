import CryptoKit
import Foundation
import JavaScriptCore
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
  func tokenizesSentences() throws {
    let context = try #require(JSContext())
    try KuromojiEngine.install(in: context)
    func tokens(_ text: String) throws -> [[String]] {
      context.setObject(text, forKeyedSubscript: "text" as NSString)
      let json = try #require(
        context.evaluateScript(
          """
          JSON.stringify(__zenbuKuromojiTokenizer.tokenize(text).map(token =>
            [token.surface_form, token.basic_form, token.reading ?? '', token.pos, token.word_type]))
          """
        )?.toString())
      return try JSONDecoder().decode([[String]].self, from: Data(json.utf8))
    }
    #expect(
      try tokens("猫が魚を食べました") == [
        ["猫", "猫", "ネコ", "名詞", "KNOWN"], ["が", "が", "ガ", "助詞", "KNOWN"],
        ["魚", "魚", "サカナ", "名詞", "KNOWN"], ["を", "を", "ヲ", "助詞", "KNOWN"],
        ["食べ", "食べる", "タベ", "動詞", "KNOWN"], ["まし", "ます", "マシ", "助動詞", "KNOWN"],
        ["た", "た", "タ", "助動詞", "KNOWN"],
      ])
    #expect(
      try tokens("静かな図書館でﾊﾝｶｸとZenbuを勉強しなかった。") == [
        ["静か", "静か", "シズカ", "名詞", "KNOWN"], ["な", "だ", "ナ", "助動詞", "KNOWN"],
        ["図書館", "図書館", "トショカン", "名詞", "KNOWN"], ["で", "で", "デ", "助詞", "KNOWN"],
        ["ﾊﾝｶｸ", "*", "", "名詞", "UNKNOWN"], ["と", "と", "ト", "助詞", "KNOWN"],
        ["Zenbu", "*", "", "名詞", "UNKNOWN"], ["を", "を", "ヲ", "助詞", "KNOWN"],
        ["勉強", "勉強", "ベンキョウ", "名詞", "KNOWN"], ["し", "する", "シ", "動詞", "KNOWN"],
        ["なかっ", "ない", "ナカッ", "助動詞", "KNOWN"], ["た", "た", "タ", "助動詞", "KNOWN"],
        ["。", "。", "。", "記号", "KNOWN"],
      ])
  }
}
