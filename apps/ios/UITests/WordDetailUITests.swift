import ImageIO
import XCTest

final class WordDetailUITests: ZenbuUITestCase {
  func testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    waitFor(menuChoice("Add to List…", in: app))
    waitFor(menuChoice("Add Note", in: app))
    waitFor(menuChoice("Choose Photo", in: app))
    XCTAssertEqual(menuChoice("Take Photo", in: app).exists, device != .mac, "Take Photo")
    tap(menuChoice("Mark as Known", in: app))
    open(.account, in: app)
    tap(find("account.known-words", in: app))
    waitFor(find("result.japan", in: app))
    tap(tabItem(.search, in: app))
    tap(find("word-detail.more-menu", in: app))
    waitFor(menuChoice("Mark as Unknown", in: app))
  }

  func testTheMenuTurnsReadingAidsOffForTheExamplesAndAccount() {
    let app = openJapan()
    let menu = find("word-detail.more-menu", in: app)
    let example = find("word-detail.example.0", in: app)
    let withTranslation = reveal(example, in: app).label
    for aid in ["Word Meanings", "Word Meanings", "Furigana", "Translations"] {
      let before = picture(of: reveal(example, in: app), in: app)
      flipShowSwitch(aid, from: menu, in: app)
      waitUntil("the example to redraw after \(aid) flipped") {
        Self.pixelsThatDiffer(picture(of: example, in: app), before) > 50
      }
    }
    waitUntil("the example to drop its translation") {
      withTranslation.hasPrefix(example.label + ", ")
    }
    assertReadingAidsAreOff(["show-furigana", "show-word-meanings", "show-translations"], in: app)
  }

  func testAShowSwitchLeavesTheMenuOpenAndAnotherChoiceClosesIt() throws {
    try XCTSkipIf(device == .mac, "the Mac's menus close on every choice")
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    let furigana = waitFor(menuChoice("Furigana", in: app))
    let onKnownWords = menuChoice("Furigana on Known Words", in: app)
    waitUntil(onKnownWords, "isEnabled == true")
    tap(furigana)
    waitUntil(furigana, "isSelected == false")
    waitUntil(onKnownWords, "isEnabled == false")
    tap(furigana)
    waitUntil(furigana, "isSelected == true")
    tap(menuChoice("Add to List…", in: app))
    waitForSheet("word-list-picker.screen", in: app)
    XCTAssertFalse(furigana.exists, "the menu stayed open after Add to List…")
  }

  func testAKanjisMenuHasTheShowSwitches() {
    let app = openJapan()
    let menu = find("kanji-detail.more-menu", in: app)
    tap(find("word-detail.kanji.日", in: app), toShow: menu)
    tap(menu)
    for aid in ["Furigana", "Furigana on Known Words", "Word Meanings", "Translations"] {
      waitFor(menuChoice(aid, in: app))
    }
  }

  func testEachRowIsListedOnceInItsOwnSection() {
    let app = launch(Self.showingOnlyTheWords(["meaning", "frequency", "related"]))
    openWord("犬", searching: "inu", in: app)
    assertListedOnceInThisOrder(Self.wordRows(meanings: 4, related: ["密告者"]), in: app)
  }

  func testAMeaningSpeaksInEnglishAndLooksUpAGloss() {
    let app = launch(["ZENBU_SPEECH_STAND_IN": "1"])
    openWord("犬", searching: "inu", in: app)
    let spoken = find("speech.spoken", in: app)
    tap(find("word-detail.pronounce", in: app))
    waitUntil(spoken, mentions: "ja-JP いぬ")
    let meaning = find("word-detail.meaning.1", in: app)
    tap(meaning)
    waitFor(menuChoice("Copy", in: app))
    tap(menuChoice("Speak", in: app))
    waitUntil(spoken, mentions: "en-US dog, canine")
    tap(meaning)
    if device == .mac {
      chooseFromSubmenu("Look Up", "canine", in: app)
    } else {
      tap(app.collectionViews.containing(.button, identifier: "speaker.wave.2").buttons["Look Up"])
      tap(menuChoice("canine", in: app))
    }
    waitUntil(searchField(in: app), "value == %@", "canine")
  }

  func testAMeaningShowsItsCheckedExample() {
    let app = launch(["ZENBU_SPEECH_STAND_IN": "1"])
    openWord("犬", searching: "inu", in: app)
    assertListedOnceInThisOrder(
      [
        "word-detail.meaning.1", "word-detail.meaning-example.1", "word-detail.meaning.2",
        "word-detail.meaning-example.2", "word-detail.meaning.3",
      ], in: app)
    XCTAssertFalse(
      find("word-detail.meaning-example.3", in: app).exists, "meaning 3 has no checked example")
    let example = find("word-detail.meaning-example.1", in: app)
    waitUntil(example, mentions: "彼女は吠える犬を怖がる。")
    waitUntil(example, mentions: "She is afraid of barking dogs.")
    tap(find("word-detail.meaning-example-speaker.1", in: app))
    waitUntil(find("speech.spoken", in: app), mentions: "ja-JP 彼女は吠える犬を怖がる。")
    let bark = NSPredicate(
      format: "identifier BEGINSWITH %@ AND identifier ENDSWITH %@",
      "word-detail.meaning-example-token.1.", ".吠える")
    tap(app.descendants(matching: .any).matching(bark).firstMatch)
    waitFor(find(Self.howling, in: app))
  }

  private static let howling = "ruby.吠える.吠=ほ|える"

  func testAWordWhoseExamplesFailToLoadStillShowsItsMeanings() {
    let app = launch(["ZENBU_FAIL_MEANING_EXAMPLES": "1"])
    openWord("犬", searching: "inu", in: app)
    assertListedOnceInThisOrder(
      ["word-detail.pronounce", "word-detail.meaning.1", "word-detail.meaning.2"], in: app)
    XCTAssertFalse(
      find("word-detail.meaning-example.1", in: app).exists, "no example shows under a meaning")
  }

  func testAddToListPutsTheWordInFavoritesAndANewList() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    tap(menuChoice("Add to List…", in: app))
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
    addNote("the country, not the language", in: app)
    tap(find("word-detail.more-menu", in: app))
    tap(menuChoice("Add Note", in: app))
    type("left by going back", into: waitFor(find("word-note.editor", in: app)))
    goBack(in: app)
    tap(find("result.japan", in: app))
    reveal(labeled("left by going back", in: app), in: app)
  }

  func testANoteBeingTypedIsKeptWhenZenbuIsClosed() {
    let app = openJapan()
    tap(find("word-detail.more-menu", in: app))
    tap(menuChoice("Add Note", in: app))
    type("typed, then Zenbu closed", into: waitFor(find("word-note.editor", in: app)))
    TestDevice.quit(app)
    waitUntil("Zenbu to leave the screen") { app.state != .runningForeground }
    app.terminate()
    app.launchEnvironment["ZENBU_UI_TEST_FRESH"] = "0"
    app.launch()
    search("japan", in: app)
    tap(find("result.japan", in: app))
    reveal(labeled("typed, then Zenbu closed", in: app), in: app)
  }

  func testANoteAnEarlierVersionSavedIsOnItsWord() throws {
    let app = openJapan(try earlierNotes([Self.japanNoteIdentity: ["earlier": "saved by 2.0.0"]]))
    reveal(labeled("saved by 2.0.0", in: app), in: app)
  }

  private static let japanNoteIdentity =
    "wn1:45a54eddcad276de58be8b74fa87cfcbdab181ee8a14a6ac910f337758519de2"

  func testTappingAKanjiInTheHeadwordHighlightsItsReading() {
    let app = launch()
    openWord("学校", searching: "school", in: app)
    if device == .mac {
      assertTheMacHighlightsTheHeadwordsFirstKanji(in: app)
      return
    }
    let kanji = waitFor(find("word-detail.screen", in: app)).buttons["学"].firstMatch
    tap(kanji)
    waitUntil(kanji, "isSelected == true")
    tap(kanji)
    waitUntil(kanji, "isSelected == false")
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

  func testAKanjiPageIsDrawnOnceWithItsFactsAndItsWords() {
    let app = openJapan(Self.countingDraws)
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.glyph", in: app))
    reveal(firstElement(identifiedBy: "kanji-detail.word.", in: app), in: app)
    let drawn = draws(
      recordedBy: "kanji-detail.drawn",
      labeled: ["stats", "readings", "elements", "reading words", "words"], in: app)
    let withFacts = drawn.filter { ($0["stats"] ?? 0) > 0 }
    guard withFacts.count == 1, let page = withFacts.first else {
      return XCTFail("the kanji page was drawn as \(drawn)")
    }
    for part in ["readings", "reading words", "words"] {
      XCTAssertGreaterThan(page[part] ?? 0, 0, "the kanji page was drawn as \(drawn)")
    }
  }

  func testAKanjisElementShowsWhatItContributesAndAKanjiItIsIn() {
    let app = openJapan()
    tap(find("word-detail.kanji.本", in: app), toShow: find("kanji-detail.glyph", in: app))
    let element = reveal(find("kanji-detail.element.木", in: app), in: app)
    waitUntil(element, mentions: "Element 木, meaning / structure, tree, wood")
    tap(element, toShow: find("kanji-element.screen", in: app))
    assertOnScreen(find("kanji-element.glyph", in: app), in: app)
    waitUntil(
      find("kanji-element.meaning-explanation", in: app),
      mentions: "This element contributes forms associated with tree, wood.")
    tap(reveal(find("kanji-element.contribution.東", in: app), in: app))
    waitUntil(find("kanji-detail.glyph", in: app), mentions: "東")
    goBack(in: app)
    waitFor(find("kanji-element.screen", in: app))
  }

  func testAFrequencyRowOpensItsDetails() {
    let app = openJapan()
    let row = reveal(
      find("word-detail.frequency.zenbu.tubelex.youtube.ja.unidic-3.1", in: app), in: app)
    waitUntil(row, mentions: "YouTube frequency rank ")
    tap(row)
    waitForSheet("frequency-detail.list", in: app)
    waitFor(labeled("Percentile", in: app))
    tap(app.buttons["Done"].firstMatch)
    waitFor(find("word-detail.screen", in: app))
  }

  func testShareOffersTheWordsWebLink() throws {
    try skipTheMacsSharingPicker()
    let app = openJapan()
    assertShareOffersAWebLink(titled: "日本", from: find("word-detail.share", in: app), in: app)
  }

  func testShareOffersTheKanjisWebLink() throws {
    try skipTheMacsSharingPicker()
    let app = openJapan()
    tap(find("word-detail.kanji.日", in: app), toShow: find("kanji-detail.glyph", in: app))
    waitFor(find("kanji-detail.strokes", in: app))
    assertShareOffersAWebLink(titled: "日", from: find("kanji-detail.share", in: app), in: app)
  }

  private func skipTheMacsSharingPicker() throws {
    try XCTSkipIf(
      device == .mac,
      "The Mac's sharing picker draws outside the app, where XCUITest can't see it "
        + "(docs/agents/ios-website-links.md)")
  }

  private func assertShareOffersAWebLink(
    titled title: String, from share: XCUIElement, in app: XCUIApplication
  ) {
    tap(share)
    waitFor(app.cells["Add to Reading List"])
    waitUntil(app.otherElements["LP.CaptionBar.TopCaption"], mentions: title)
  }

  private func openJapan(_ environment: [String: String] = [:]) -> XCUIApplication {
    let app = launch(environment)
    search("japan", in: app)
    tap(find("result.japan", in: app))
    waitFor(find("word-detail.screen", in: app))
    return app
  }
}
