import Foundation
import Testing
import UIKit

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
      NSAttributedString(
        string: "Please meet me at Shibuya Station.",
        attributes: [.font: UIFont.systemFont(ofSize: 24)]
      ).draw(at: CGPoint(x: 40, y: 40))
    }.write(to: url)
    #expect(try await DocumentText.read(url).contains("Please meet me at Shibuya Station."))
  }

  @Test("a scanned PDF and a photo are read by text recognition")
  func scannedPDFAndPhoto() async throws {
    let sign = signImage()
    let scanned = folder.appending(path: "scan.pdf")
    try pdf { _ in sign.draw(in: CGRect(x: 0, y: 0, width: 612, height: 230)) }.write(to: scanned)
    let photo = folder.appending(path: "sign.png")
    try #require(sign.pngData()).write(to: photo)

    #expect(try await DocumentText.read(scanned).contains("改札は右側にあります"))
    #expect(try await DocumentText.read(photo).contains("改札は右側にあります"))
  }

  @Test("a document without any text can't be read")
  func emptyDocument() async throws {
    let url = folder.appending(path: "empty.txt")
    try " \n".write(to: url, atomically: true, encoding: .utf8)
    await #expect(throws: DocumentTextError.self) { try await DocumentText.read(url) }
  }

  private func pdf(_ draw: (UIGraphicsPDFRendererContext) -> Void) -> Data {
    UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792)).pdfData {
      context in
      context.beginPage()
      draw(context)
    }
  }

  private func signImage() -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: 800, height: 300)).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 800, height: 300))
      let attributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 44), .foregroundColor: UIColor.black,
      ]
      NSAttributedString(string: "この先の階段を下りてください。", attributes: attributes)
        .draw(at: CGPoint(x: 30, y: 60))
      NSAttributedString(string: "改札は右側にあります。", attributes: attributes)
        .draw(at: CGPoint(x: 30, y: 160))
    }
  }
}
