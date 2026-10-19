import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers

@testable import SearchExperience

@MainActor
@Suite("What the share sheet was handed")
struct SharedItemTests {
  private static let png = ImageCoding.drawing(width: 4, height: 4) { _ in }.flatMap(ImageCoding.pngData)

  private static func image() throws -> NSItemProvider {
    NSItemProvider(item: try #require(png) as NSData, typeIdentifier: UTType.png.identifier)
  }

  enum HandedOver: CaseIterable, Sendable {
    case object
    case item
    case data

    @MainActor var attachment: NSItemProvider {
      switch self {
      case .object: NSItemProvider(object: "食べた" as NSString)
      case .item: NSItemProvider(item: "食べた" as NSString, typeIdentifier: UTType.plainText.identifier)
      case .data:
        NSItemProvider(item: Data("食べた".utf8) as NSData, typeIdentifier: UTType.utf8PlainText.identifier)
      }
    }
  }

  @Test("selected text is looked up, however the sharing app hands it over", arguments: HandedOver.allCases)
  func text(handedOver: HandedOver) async {
    #expect(await SharedItemReading.first(in: [handedOver.attachment]) == .text("食べた"))
  }

  @Test("a photo is read, made no larger than the card reads it, before any text shared with it")
  func photo() async throws {
    let item = await SharedItemReading.first(
      in: [NSItemProvider(object: "a caption" as NSString), try Self.image()])
    guard case .image(let data) = item else {
      Issue.record("Expected a photo, got \(item)")
      return
    }
    let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
    let size = try #require(ImageCoding.pixelSize(of: source))
    #expect(size.width == 4 && size.height == 4)
  }

  @Test("an image that can't be read is handed on as an unreadable photo")
  func unreadablePhoto() async {
    let broken = NSItemProvider(item: Data("not an image".utf8) as NSData, typeIdentifier: UTType.png.identifier)
    #expect(await SharedItemReading.first(in: [broken]) == .image(Data()))
  }

  @Test("anything else is nothing to look up")
  func nothing() async {
    let link = NSItemProvider(object: URL(string: "https://zenbujapanese.com")! as NSURL)
    #expect(await SharedItemReading.first(in: [link]) == .text(""))
    #expect(await SharedItemReading.first(in: []) == .text(""))
  }
}

@Suite("The share sheet's translation")
struct ShareCardTranslationTests {
  private static func client(
    _ availability: NaturalTranslationAvailability, translating: String? = "I ate."
  ) -> NaturalTranslationClient {
    NaturalTranslationClient(availability: { availability }) { sources in
      guard let translating else { throw NaturalTranslationError.languageAssetsUnavailable }
      return Dictionary(uniqueKeysWithValues: sources.map { ($0, translating) })
    }
  }

  @Test("translates with Apple Translation's installed languages")
  func translated() async {
    #expect(await ShareCardTranslation.of("食べた。", by: Self.client(.installed)) == .translated("I ate."))
  }

  @Test("asks for the languages when Japanese and English aren't downloaded")
  func needsLanguages() async {
    #expect(await ShareCardTranslation.of("食べた。", by: Self.client(.downloadable)) == .needsLanguages)
  }

  @Test("says a translation isn't available when the device can't translate it")
  func unavailable() async {
    #expect(await ShareCardTranslation.of("食べた。", by: Self.client(.unsupported)) == .unavailable)
    #expect(
      await ShareCardTranslation.of("食べた。", by: Self.client(.installed, translating: nil))
        == .unavailable)
  }
}
