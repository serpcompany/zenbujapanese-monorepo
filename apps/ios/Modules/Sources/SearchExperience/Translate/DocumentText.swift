import Foundation
import PDFKit
import UIKit
import UniformTypeIdentifiers

enum DocumentText {
  static let readableTypes: [UTType] = [.pdf, .image, .plainText]
  static let scannedPageLimit = 10
  static let characterLimit = 5_000
  static let scannedPageLongestSide = 3_000.0

  static func read(_ url: URL) async throws -> String {
    let isScoped = url.startAccessingSecurityScopedResource()
    defer { if isScoped { url.stopAccessingSecurityScopedResource() } }
    let type = UTType(filenameExtension: url.pathExtension) ?? .data
    let text: String
    if type.conforms(to: .pdf) {
      text = try await readPDF(url)
    } else if type.conforms(to: .image) {
      text = try await recognize(try await ImageTextAsset.loadCopy(from: url))
    } else {
      text = try decode(Data(contentsOf: url))
    }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw DocumentTextError.noText }
    return String(trimmed.prefix(characterLimit))
  }

  static func decode(_ data: Data) throws -> String {
    let hasByteOrderMark = data.starts(with: [0xFF, 0xFE]) || data.starts(with: [0xFE, 0xFF])
    let encodings: [String.Encoding] =
      hasByteOrderMark ? [.utf16] : [.utf8, .shiftJIS, .japaneseEUC]
    for encoding in encodings {
      if let text = String(data: data, encoding: encoding) { return text }
    }
    throw DocumentTextError.noText
  }
}

extension DocumentText {
  private static func readPDF(_ url: URL) async throws -> String {
    guard let document = PDFDocument(url: url) else { throw DocumentTextError.noText }
    let embedded = document.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard embedded.isEmpty else { return embedded }
    var pages: [String] = []
    for index in 0..<min(document.pageCount, scannedPageLimit) {
      guard let page = document.page(at: index), let image = render(page) else { continue }
      pages.append(try await recognize(ImageTextAsset(name: "page \(index + 1)", data: image)))
    }
    return pages.joined(separator: "\n\n")
  }

  private static func render(_ page: PDFPage) -> Data? {
    let bounds = page.bounds(for: .mediaBox)
    guard bounds.width > 0, bounds.height > 0 else { return nil }
    let scale = min(4, scannedPageLongestSide / max(bounds.width, bounds.height))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(
      size: CGSize(width: bounds.width * scale, height: bounds.height * scale), format: format)
    return renderer.pngData { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: context.format.bounds.size))
      context.cgContext.translateBy(x: 0, y: bounds.height * scale)
      context.cgContext.scaleBy(x: scale, y: -scale)
      page.draw(with: .mediaBox, to: context.cgContext)
    }
  }

  private static func recognize(_ asset: ImageTextAsset) async throws -> String {
    try await ImageTextRecognitionClient.live.recognize(asset).map(\.text).joined(separator: "\n")
  }
}

enum DocumentTextError: Error {
  case noText
}
