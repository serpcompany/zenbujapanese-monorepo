import CoreGraphics
import CoreText
import Foundation
import Testing

@testable import SearchExperience

@Suite("Document text")
struct DocumentTextTests {
  private let folder = FileManager.default.temporaryDirectory
    .appending(path: "document-text-\(UUID().uuidString)", directoryHint: .isDirectory)

  init() throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
  }

  @Test("a text file is read as it is")
  func textFile() async throws {
    let url = folder.appending(path: "questions.txt")
    try "東京駅はどこですか？\nWhere is Tokyo Station?\n".write(to: url, atomically: true, encoding: .utf8)
    #expect(try await DocumentText.read(url) == "東京駅はどこですか？\nWhere is Tokyo Station?")
  }

  @Test("a Japanese text file is read in UTF-16, Shift-JIS, or EUC-JP too", arguments: [
    "東京駅はどこですか？", "ありがとうございます", "すみません、駅はどこですか",
  ])
  func japaneseEncodings(text: String) throws {
    for encoding: String.Encoding in [.utf16, .shiftJIS, .japaneseEUC] {
      #expect(try DocumentText.decode(try #require(text.data(using: encoding))) == text)
    }
  }

  @Test("a Shift-JIS file of half-width katakana isn't misread as EUC-JP kanji")
  func halfWidthKatakana() throws {
    let text = "ｶﾌﾞｼｷｶﾞｲｼｬ ﾔﾏﾀﾞ"
    #expect(try DocumentText.decode(try #require(text.data(using: .shiftJIS))) == text)
  }

  @Test("a long document is cut to the character limit")
  func longDocument() async throws {
    let url = folder.appending(path: "long.txt")
    try String(repeating: "駅", count: DocumentText.characterLimit + 100)
      .write(to: url, atomically: true, encoding: .utf8)
    #expect(try await DocumentText.read(url).count == DocumentText.characterLimit)
  }

  @Test("a PDF's own text is used when it has some")
  func pdfWithText() async throws {
    let url = folder.appending(path: "notice.pdf")
    try pdf { context in
      draw("Please meet me at Shibuya Station.", size: 24, at: CGPoint(x: 40, y: 728), in: context)
    }.write(to: url)
    #expect(try await DocumentText.read(url).contains("Please meet me at Shibuya Station."))
  }

  @Test("a scanned PDF is read by text recognition")
  func scannedPDF() async throws {
    let sign = try #require(signImage())
    let scanned = folder.appending(path: "scan.pdf")
    try pdf { $0.draw(sign, in: CGRect(x: 0, y: 562, width: 612, height: 230)) }.write(to: scanned)

    #expect(try await DocumentText.read(scanned).contains("改札は右側にあります"))
  }

  @Test("a document without any text can't be read")
  func emptyDocument() async throws {
    let url = folder.appending(path: "empty.txt")
    try " \n".write(to: url, atomically: true, encoding: .utf8)
    await #expect(throws: DocumentTextError.self) { try await DocumentText.read(url) }
  }

  private func pdf(_ draw: (CGContext) -> Void) -> Data {
    let data = NSMutableData()
    var page = CGRect(x: 0, y: 0, width: 612, height: 792)
    guard let consumer = CGDataConsumer(data: data as CFMutableData),
      let context = CGContext(consumer: consumer, mediaBox: &page, nil)
    else { return Data() }
    context.beginPDFPage(nil)
    draw(context)
    context.endPDFPage()
    context.closePDF()
    return data as Data
  }

  private func signImage() -> CGImage? {
    ImageCoding.drawing(width: 800, height: 300) { context in
      context.setFillColor(CGColor(gray: 1, alpha: 1))
      context.fill(CGRect(x: 0, y: 0, width: 800, height: 300))
      draw("この先の階段を下りてください。", size: 44, at: CGPoint(x: 30, y: 196), in: context)
      draw("改札は右側にあります。", size: 44, at: CGPoint(x: 30, y: 96), in: context)
    }
  }

  private func draw(_ text: String, size: CGFloat, at point: CGPoint, in context: CGContext) {
    let font = CTFontCreateUIFontForLanguage(.system, size, "ja" as CFString)
    let attributes: [NSAttributedString.Key: Any] = [
      NSAttributedString.Key(kCTFontAttributeName as String): font as Any,
      NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(
        gray: 0, alpha: 1),
    ]
    let line = CTLineCreateWithAttributedString(
      NSAttributedString(string: text, attributes: attributes))
    context.textPosition = point
    CTLineDraw(line, context)
  }
}
