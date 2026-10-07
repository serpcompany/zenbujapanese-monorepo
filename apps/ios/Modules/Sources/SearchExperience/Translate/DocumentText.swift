import Foundation
import PDFKit
import UIKit
import UniformTypeIdentifiers

enum DocumentText {
  static let readableTypes: [UTType] = [.pdf, .image, .plainText]
  static let scannedPageLimit = 10

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
      text = try String(contentsOf: url, encoding: .utf8)
    }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw DocumentTextError.noText }
    return trimmed
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
    let scale = 2.0
    let renderer = UIGraphicsImageRenderer(
      size: CGSize(width: bounds.width * scale, height: bounds.height * scale))
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
