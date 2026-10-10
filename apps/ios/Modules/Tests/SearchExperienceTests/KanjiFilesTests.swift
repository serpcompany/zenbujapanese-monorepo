import Foundation
import Testing

@testable import SearchExperience

@Suite("The kanji records the core reads")
struct KanjiFilesTests {
  private func parsed(_ name: String) throws -> [String: Any] {
    let database = try #require(Bundle.languageReferenceDataURL)
    let resources = try #require(Bundle(url: database.deletingLastPathComponent()))
    let url = try #require(resources.url(forResource: name, withExtension: "json"))
    return try #require(
      try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
  }

  private func records(_ file: [String: Any], _ list: String) throws -> [[String: Any]] {
    try #require(file[list] as? [[String: Any]])
  }

  private func object(_ record: [UInt8]?) throws -> NSDictionary? {
    guard let record else { return nil }
    #expect(record.last == 0)
    return try JSONSerialization.jsonObject(with: Data(record.dropLast())) as? NSDictionary
  }

  @Test("each record is the file's own, found under its character and never under a twin's")
  func everyRecordIsItsOwn() throws {
    let files = try #require(KanjiFiles.bundled)
    let reference = try parsed("KanjiReferenceData")
    let elements = try parsed("KanjiElementReferenceData")
    var twins = 0
    var compared = 0
    for entry in try records(reference, "entries") {
      let character = try #require(entry["character"] as? String)
      #expect(try object(files.entry(character)) == entry as NSDictionary)
      compared += 1
      if character.precomposedStringWithCanonicalMapping.unicodeScalars.first
        != character.unicodeScalars.first
      {
        twins += 1
      }
    }
    for kanji in try records(elements, "kanji") {
      let character = try #require(kanji["character"] as? String)
      #expect(try object(files.structure(character)) == kanji as NSDictionary)
      compared += 1
    }
    for element in try records(elements, "elements") {
      let glyph = try #require(element["glyph"] as? String)
      #expect(try object(files.element(glyph)) == element as NSDictionary)
      compared += 1
    }
    #expect(twins > 50)
    #expect(compared > 20_000)
  }

  @Test("the files' sources are read from their own fields")
  func sources() throws {
    let files = try #require(KanjiFiles.bundled)
    let reference = try parsed("KanjiReferenceData")
    let elements = try parsed("KanjiElementReferenceData")
    let sources = try #require(try object(files.sources))
    #expect(sources["metadataSourceIdentity"] as? String == reference["metadataSourceIdentity"] as? String)
    #expect(sources["componentSourceIdentity"] as? String == reference["componentSourceIdentity"] as? String)
    #expect(sources["schema"] as? String == elements["schema"] as? String)
    let fromElements = try #require(sources["elements"] as? [String: String])
    for field in [
      "snapshot", "structureSourceIdentity", "metadataSourceIdentity", "metadataSourceSnapshot",
    ] {
      #expect(fromElements[field] == elements[field] as? String)
      #expect(fromElements[field]?.isEmpty == false)
    }
  }

  @Test("a file that isn't the JSON it should be is refused, not half read")
  func refusesBrokenFiles() throws {
    let folder = FileManager.default.temporaryDirectory.appending(
      path: "KanjiFilesTests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    func files(_ reference: String, _ elements: String) throws -> KanjiFiles? {
      let referenceURL = folder.appending(path: "reference.json")
      let elementsURL = folder.appending(path: "elements.json")
      try Data(reference.utf8).write(to: referenceURL)
      try Data(elements.utf8).write(to: elementsURL)
      return KanjiFiles(reference: referenceURL, elements: elementsURL)
    }
    let reference = #"""
      { "snapshot" : "s", "entries" : [ {"character":"日","meanings":["a \"day\"","[sun]"],"n":{"x":[1,2]}} , {"character":"\u6708"}, {"other":1}, {} ], "after": [1, {"a": "]"}] }
      """#
    let elements = #"{"schema":"v1","kanji":[],"elements":[{"glyph":"日","alternatives":[]}]}"#
    let read = try #require(try files(reference, elements))
    let day = try #require(try object(read.entry("日")))
    #expect(day["meanings"] as? [String] == ["a \"day\"", "[sun]"])
    #expect(try object(read.entry("月"))?["character"] as? String == "月")
    #expect(read.entry("火") == nil)
    #expect(read.element("日") != nil)
    #expect(read.structure("日") == nil)
    #expect(try files(#"{"entries":[{"character":"日"}"#, elements) == nil)
    #expect(try files(#"{"entries":[{"character":"日}]}"#, elements) == nil)
    #expect(try files("[]", elements) == nil)
    #expect(try files(reference, "") == nil)
  }

  @Test("a compatibility kanji and the kanji it unifies with keep their own readings and stats")
  func twinsStayApart() throws {
    let client = KanjiLookupClient.live(lookupClient: .live)
    let unified = try client.page(try #require(KanjiCharacter("\u{4FAE}")), [], nil)
    let compatibility = try client.page(try #require(KanjiCharacter("\u{FA30}")), [], nil)
    #expect(unified.stats.map(\.kind) == ["strokes", "grade", "jlpt"])
    #expect(compatibility.stats.map(\.kind) == ["strokes", "grade"])
    #expect(unified.shareText.unicodeScalars.first?.value == 0x4FAE)
    #expect(compatibility.shareText.unicodeScalars.first?.value == 0xFA30)
    #expect(
      JapaneseRuby(surface: "\u{FA30}辱", reading: "ぶじょく").segments.first?.base.unicodeScalars
        .first?.value == 0xFA30)
    #expect(
      JapaneseRuby(surface: "\u{4FAE}辱", reading: "ぶじょく").segments.first?.base.unicodeScalars
        .first?.value == 0x4FAE)
  }

  @Test("answers nothing for what is not one character")
  func onlyOneCharacter() throws {
    let files = try #require(KanjiFiles.bundled)
    #expect(files.entry("日本") == nil)
    #expect(files.entry("") == nil)
    #expect(files.element("あ") == nil)
  }
}
