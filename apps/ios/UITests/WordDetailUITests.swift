import ImageIO
import XCTest

final class WordDetailUITests: ZenbuUITestCase {
  func testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    waitFor(find("word-detail.add-to-list", in: app))
    waitFor(menuChoice("Add Note", in: app))
    waitFor(menuChoice("Choose Photo", in: app))
    XCTAssertEqual(menuChoice("Take Photo", in: app).exists, device != .mac, "Take Photo")
    tap(find("word-detail.mark-known", in: app))
    open(.account, in: app)
    tap(find("account.known-words", in: app))
    waitFor(firstElement(identifiedBy: "known-words.item.", in: app))
    tabItem(.search, in: app).tap()
    tap(find("word-detail.more-menu", in: app))
    waitFor(find("word-detail.mark-unknown", in: app))
  }

  func testAddToListPutsTheWordInFavoritesAndANewList() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    tap(find("word-detail.add-to-list", in: app))
    waitForSheet("word-list-picker.screen", in: app)
    tap(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'word-list-picker.list.' AND label CONTAINS 'Favorites'"))
        .firstMatch)
    tap(find("word-list-picker.new-list", in: app))
    name("Countries", in: app)
    tap(find("word-list-picker.done", in: app))
    let lists = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'word-detail.list.'"))
    reveal(lists.matching(NSPredicate(format: "label CONTAINS 'Countries'")).firstMatch, in: app)
    tap(lists.matching(NSPredicate(format: "label CONTAINS 'Favorites'")).firstMatch)
    waitFor(firstElement(identifiedBy: "word-list.item.", in: app))
  }

  func testAFrequencyRankOpensItsDetailsWhichLeadToTheDictionaries() {
    let app = openJapan()
    tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'JLPT level'")).firstMatch)
    waitForSheet("frequency-detail.list", in: app)
    tap(find("frequency-detail.manage", in: app))
    assertOnScreen(find("frequency-packs.list", in: app), in: app)
  }

  func testANoteIsKeptOnTheWord() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    tap(menuChoice("Add Note", in: app))
    type("the country, not the language", into: waitFor(find("word-note.editor", in: app)))
    tap(find("word-note.done", in: app))
    waitFor(labeled("the country, not the language", in: app))
  }

  func testTappingAKanjiInTheHeadwordHighlightsItsReading() {
    let app = launch()
    search("school", in: app)
    tap(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'result.' AND label BEGINSWITH '学校'"))
        .firstMatch)
    if device == .mac {
      assertTheMacHighlightsTheHeadwordsFirstKanji(in: app)
      return
    }
    let kanji = waitFor(find("word-detail.screen", in: app)).buttons["学"].firstMatch
    tap(kanji)
    XCTAssertTrue(kanji.isSelected, "学 and its がっ are highlighted")
    kanji.tap()
    XCTAssertFalse(kanji.isSelected, "tapping it again clears the highlight")
  }

  private func assertTheMacHighlightsTheHeadwordsFirstKanji(in app: XCUIApplication) {
    let headword = waitFor(firstElement(identifiedBy: "ruby.学校.", in: app))
    let kanji = headword.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.75))
    let plain = picture(of: headword, in: app)
    kanji.tap()
    let highlighted = Self.pixelsThatDiffer(picture(of: headword, in: app), plain)
    XCTAssertGreaterThan(highlighted, 50, "学 and its がっ are highlighted")
    kanji.tap()
    let cleared = Self.pixelsThatDiffer(picture(of: headword, in: app), plain)
    XCTAssertLessThan(cleared, 10, "clicking it again clears the highlight")
  }

  private static func pixelsThatDiffer(_ first: Data, _ second: Data) -> Int {
    guard let first = pixels(of: first), let second = pixels(of: second), first.count == second.count
    else { return .max }
    return stride(from: 0, to: first.count, by: 4).count { first[$0..<$0 + 4] != second[$0..<$0 + 4] }
  }

  private static func pixels(of png: Data) -> [UInt8]? {
    guard let source = CGImageSourceCreateWithData(png as CFData, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { return nil }
    var pixels = [UInt8](repeating: 0, count: image.width * image.height * 4)
    let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
      guard
        let context = CGContext(
          data: buffer.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
          bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
      return true
    }
    return drawn ? pixels : nil
  }

  private func picture(of element: XCUIElement, in app: XCUIApplication) -> Data {
    TestDevice.movePointerAway(in: app)
    RunLoop.current.run(until: Date.now.addingTimeInterval(1))
    return element.screenshot().pngRepresentation
  }

  func testAKanjiShowsItsStrokeOrderAndItsWords() {
    let app = openJapan()
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.glyph", in: app))
    assertOnScreen(find("kanji-detail.glyph", in: app), in: app)
    tap(find("kanji-detail.stroke-order", in: app))
    waitForSheet("stroke-order.screen", in: app)
    assertOnScreen(find("stroke-order.screen", in: app), in: app)
    tap(find("stroke-order.next", in: app))
    tap(find("stroke-order.close", in: app))
    waitFor(find("kanji-detail.screen", in: app))
    reveal(firstElement(identifiedBy: "kanji-detail.word.", in: app), in: app)
  }

  private func openJapan() -> XCUIApplication {
    let app = launch()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    waitFor(find("word-detail.screen", in: app))
    return app
  }
}
