import AppActions
import CoreGraphics
import Foundation
import Testing
import UniformTypeIdentifiers

@testable import SearchExperience

@MainActor
@Suite("Share-sheet actions")
struct ShareActionTests {
  private func item(_ providers: [NSItemProvider], text: String? = nil) -> NSExtensionItem {
    let item = NSExtensionItem()
    item.attachments = providers
    item.attributedContentText = text.map(NSAttributedString.init(string:))
    return item
  }

  private func shared(_ text: String) -> NSItemProvider {
    NSItemProvider(object: text as NSString)
  }

  @Test("shared text is looked up or translated as it was selected, and blank text opens nothing")
  func sharedText() async {
    let selection = [item([shared(" 見る\n")])]
    #expect(await ShareAction.lookUp.appAction(for: selection, sharedImages: nil) == .lookUp(" 見る\n"))
    #expect(
      await ShareAction.translate.appAction(for: selection, sharedImages: nil) == .translate(" 見る\n"))
    let fromItsText = [item([shared("  ")]), item([], text: "猫")]
    #expect(await ShareAction.lookUp.appAction(for: fromItsText, sharedImages: nil) == .lookUp("猫"))
    #expect(await ShareAction.lookUp.appAction(for: [item([shared(" \n")])], sharedImages: nil) == nil)
  }

  @Test("text an app shares as data, as SwiftUI's ShareLink does, is read in UTF-8 or UTF-16")
  func sharedTextAsData() async throws {
    for (type, encoding) in [(UTType.plainText, String.Encoding.utf8), (.utf16PlainText, .utf16)] {
      let data = try #require("見る【みる】".data(using: encoding))
      let provider = NSItemProvider()
      provider.registerDataRepresentation(forTypeIdentifier: type.identifier, visibility: .all) {
        load in
        load(data, nil)
        return nil
      }
      #expect(
        await ShareAction.translate.appAction(for: [item([provider])], sharedImages: nil)
          == .translate("見る【みる】"), "\(type)")
    }
  }

  @Test("a word's Share text, through each text action's own handling, opens what the app opens")
  func wordShareThroughTheExtensions() async throws {
    let results = try await LookupClient.live.search(SearchQuery("japan"))
    let japan = try #require(results.entries.first { $0.headword == "日本" })
    let text = try #require(WordPage(japan)?.shareText)
    let app = "com.zenbujapanese.dictionary.uitests"
    let opened = { (action: ShareAction, suffix: String) async throws -> AppLink in
      let url = try #require(
        await action.appURL(for: [self.item([self.shared(text)])], extensionBundleID: app + suffix))
      return AppLink(url, scheme: app, sharedImages: nil)
    }
    #expect(try await opened(.translate, ".translate") == .translate(text))
    #expect(try await opened(.lookUp, ".look-up") == .dictionary(.lookUp(text)))
  }

  @Test("shared images are copied for the app, named apart, and replace the share before them")
  func sharedImages() async throws {
    let images = SharedImages(folder: try ImageFixture.folder("shared"))
    let picked = try ImageFixture.folder("picked")
    defer {
      try? FileManager.default.removeItem(at: images.folder)
      try? FileManager.default.removeItem(at: picked)
    }
    var providers: [NSItemProvider] = []
    for (suggestedName, width) in [("sign.png", 30), ("sign", 40)] {
      let file = picked.appending(path: "\(width).png")
      try ImageFixture.png(width: width, height: 20).write(to: file)
      let provider = try #require(NSItemProvider(contentsOf: file))
      provider.suggestedName = suggestedName
      providers.append(provider)
    }
    let earlier = try images.newShare()

    let action = await ShareAction.imageSearch.appAction(
      for: [item(providers + [shared("not an image")])], sharedImages: images)
    guard case .imageSearch(let id, let names) = action else {
      Issue.record("the images open no Image Search")
      return
    }
    #expect(names == ["sign.png", "sign 2.png"])
    let files = images.share(id).files(named: names)
    let widths = try files.map { try #require(ImageCoding.image(from: Data(contentsOf: $0))).width }
    #expect(widths == [30, 40])
    #expect(!FileManager.default.fileExists(atPath: earlier.folder.path))
    images.share(id).discard()
    #expect(!FileManager.default.fileExists(atPath: images.share(id).folder.path))
    #expect(await ShareAction.imageSearch.appAction(for: [item([])], sharedImages: images) == nil)
    #expect(await ShareAction.imageSearch.appAction(for: [item(providers)], sharedImages: nil) == nil)
  }

  @Test("shared images keep Image Search's limits: 8 at most, 12 MB, 12,000 pixels a side, 40 MP")
  func sharedImageLimits() async throws {
    let folder = try ImageFixture.folder("limits")
    defer { try? FileManager.default.removeItem(at: folder) }
    let write = { (name: String, data: Data) throws -> URL in
      let file = folder.appending(path: name)
      try data.write(to: file)
      return file
    }
    let small = try ImageFixture.png(width: 30, height: 20)
    let nine = try (1...9).map { try write("sign \($0).png", small) }
    #expect(await ImageTextAsset.loadCopies(of: nine).count == 8)

    let large = try write("large.png", small + Data(count: 12 * 1_024 * 1_024))
    let wide = try write("wide.png", try ImageFixture.grayPNG(width: 12_001, height: 1))
    let dense = try write("dense.png", try ImageFixture.grayPNG(width: 6_400, height: 6_400))
    let fits = try write("fits.png", try ImageFixture.grayPNG(width: 6_000, height: 6_000))
    let opened = await ImageTextAsset.loadCopies(of: [large, wide, dense, fits])
    #expect(opened.map(\.name) == ["fits.png"])
  }
}
