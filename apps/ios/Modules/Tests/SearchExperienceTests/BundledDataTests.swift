import Foundation
import DictionaryData
import Testing

@testable import SearchExperience

@Suite("Where the dictionary's files are found")
struct BundledDataTests {
  @Test(
    "the share sheet reads the files of the app it is part of",
    arguments: [
      ("/A/Zenbu Japanese.app/PlugIns/ZenbuShare.appex", "/A/Zenbu Japanese.app"),
      ("/A/Zenbu Japanese.app/Contents/PlugIns/ZenbuShare.appex", "/A/Zenbu Japanese.app"),
    ])
  func containingApp(extensionPath: String, appPath: String) {
    let app = BundledData.containingApp(of: URL(filePath: extensionPath, directoryHint: .isDirectory))
    #expect(app?.path(percentEncoded: false).trimmingSuffix("/") == appPath)
  }

  @Test("the app reads its own files")
  func theAppItself() {
    #expect(BundledData.containingApp(of: URL(filePath: "/A/Zenbu Japanese.app")) == nil)
    #expect(BundledData.containingApp(of: URL(filePath: "/A/ZenbuShare.appex")) == nil)
  }

  @Test("the files are the dictionary data the app embeds")
  func theEmbeddedData() {
    #expect(BundledData.bundle.bundleURL == DictionaryData.bundle.bundleURL)
    #expect(Bundle.languageReferenceDataURL != nil)
  }
}

extension String {
  fileprivate func trimmingSuffix(_ suffix: String) -> String {
    hasSuffix(suffix) ? String(dropLast(suffix.count)) : self
  }
}
