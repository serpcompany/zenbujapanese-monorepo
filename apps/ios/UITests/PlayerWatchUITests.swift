import XCTest

final class PlayerWatchUITests: ZenbuUITestCase {
  static let link = "https://youtu.be/AQdI1o2D32I"
  static let countingDraws = ["ZENBU_COUNT_DRAWS": "1"]
  static let drawCounts = [
    "the screen": "watch.draws", "the speed menu": "watch.speed.draws",
    "the captions": "watch.captions.draws",
  ]

  func testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown() {
    let app = openVideo()
    waitFor(firstElement(identifiedBy: "watch.cue.0.", in: app))
    assertOnScreen(find("watch.cue.0", in: app), in: app)
    for line in 1..<3 {
      let card = waitFor(find("watch.cue.\(line)", in: app))
      XCTAssertTrue(isReachable(card, in: app), "caption \(line + 1) is out of reach")
    }
    let known = waitFor(find("watch.comprehension", in: app))
    waitUntil(known, mentions: "0 of 12 words known")
    waitFor(labeled("There's a bookstore near the station.", in: app))
  }

  func testThePlayersOwnControlsPlayStepAndRepeat() throws {
    let app = openVideo(Self.standIn().merging(Self.countingDraws) { $1 })
    waitUntil(find("watch.comprehension", in: app), mentions: "words known")
    let playPause = find("watch.play-pause", in: app)
    waitUntil(playPause, "isEnabled == true")
    playPause.tap()
    waitUntil(playPause, "label == 'Pause'")
    tap(find("watch.next", in: app))
    tap(find("watch.previous", in: app))
    tap(find("watch.repeat", in: app))
    waitUntil(find("watch.repeat", in: app), "isSelected == true")
    waitUntil(playPause, "label == 'Pause'")
    let redrawn = try redraws(whileSecondsShown: 3, in: app)
    XCTAssertEqual(
      redrawn, Self.drawCounts.mapValues { _ in 0 },
      "the Player redrew while the time showed three seconds")
    tap(find("watch.speed", in: app))
    for rate in ["0.5×", "0.75×", "1×", "1.25×", "1.5×"] {
      waitFor(menuChoice(rate, in: app))
    }
    if device == .mac {
      tap(menuChoice("1.25×", in: app))
    } else {
      tapWhereReachable([menuChoices("1.25×", in: app)], in: app)
    }
    waitUntil(find("watch.speed", in: app), mentions: "1.25×")
    assertOnScreen(find("watch.scrubber", in: app), in: app)
  }

  private func redraws(whileSecondsShown seconds: Int, in app: XCUIApplication) throws -> [String: Int] {
    let before = try Self.drawCounts.mapValues { try draws(on: $0, in: app) }
    let time = find("watch.time", in: app)
    var shown = Set<String>()
    waitUntil("the time to show \(seconds) different seconds") {
      let now = text(of: time)
      if !now.isEmpty { shown.insert(now) }
      return shown.count >= seconds
    }
    var redrawn: [String: Int] = [:]
    for (part, probe) in Self.drawCounts {
      redrawn[part] = try draws(on: probe, in: app) - (before[part] ?? 0)
    }
    return redrawn
  }

  private func draws(on probe: String, in app: XCUIApplication) throws -> Int {
    let shown = text(of: waitFor(find(probe, in: app)))
    if Int(shown) == nil { attachWhatIsOnScreen() }
    return try XCTUnwrap(Int(shown), "\(probe) shows \"\(shown)\", not a count of draws")
  }

  func testAWordInACaptionOpensItsEntryInsidePlayer() {
    let app = openVideo()
    tap(firstElement(identifiedBy: "watch.cue.0.", in: app))
    tap(find("recognized-word-sheet.open-full-entry", in: app))
    assertOnScreen(find("word-detail.screen", in: app), in: app)
    goBack(in: app)
    waitFor(find("watch.captions", in: app))
  }

  func testAWordSheetsKanjiOpensItsPageInsidePlayer() {
    let app = openVideo()
    openKanji("本", fromWordIdentifiedBy: "watch.cue.0.", in: app)
    goBack(in: app)
    waitFor(find("watch.captions", in: app))
  }

  func testAWatchedVideoIsListedInRecentAndCanBeRemoved() {
    let app = openVideo()
    waitFor(find("watch.cue.0", in: app))
    goBack(in: app)
    let recent = waitFor(firstElement(identifiedBy: "watch.recent.", in: app))
    revealRowActions(on: recent)
    tap(menuChoice("Remove", in: app))
    assertOnScreen(find("watch.empty", in: app), in: app)
  }

  func testAVideoWithoutJapaneseCaptionsSaysSo() {
    let app = openVideo(Self.standIn(captionTracks: "[]"))
    assertOnScreen(find("watch.captions-unavailable", in: app), in: app)
    waitFor(labeled("No Japanese Captions", in: app))
  }

  func testAVideoItsOwnerWontShareSaysItsUnavailable() {
    let app = openVideo(Self.standIn(playerError: 150))
    waitFor(labeled("Video Unavailable", in: app))
  }

  func testASearchShowsYouTubesResultsWithoutYouTubesOwnBars() {
    let app = launch(Self.standIn())
    open(.player, in: app)
    type("golden eggs japanese\n", into: waitFor(app.searchFields.firstMatch))
    let page = waitFor(app.webViews.firstMatch)
    let first = waitFor(inPage("Stand-in result 1", of: page))
    let last = waitFor(inPage("Stand-in result 10", of: page))
    let bars = ["YouTube Home", "Search YouTube", "Search with your voice", "Home", "Shorts", "You"]
    for bar in bars {
      XCTAssertFalse(inPage(bar, of: page).exists, "YouTube's \(bar) is on screen")
    }
    XCTAssertLessThan(
      first.frame.minY - page.frame.minY, 24, "the space for YouTube's header is left empty")
    reveal(last, in: app, scrolling: page)
    if device == .mac {
      page.scroll(byDeltaX: 0, deltaY: -600)
    } else {
      page.swipeUp()
    }
    waitUntilStill(last)
    XCTAssertTrue(isReachable(last, in: app), "the last result can't be scrolled to")
    XCTAssertFalse(
      last.frame.intersects(tabItem(.player, in: app).frame),
      "the last result stays under the tab bar")
    tap(last)
    waitFor(find("watch.cue.0", in: app))
  }

  private func inPage(_ label: String, of page: XCUIElement) -> XCUIElement {
    page.descendants(matching: .any).matching(showing(label)).firstMatch
  }

  private func openVideo(_ standIn: [String: String] = standIn()) -> XCUIApplication {
    let app = launch(standIn)
    open(.player, in: app)
    let field = waitFor(app.searchFields.firstMatch)
    type(Self.link + "\n", into: field)
    return app
  }

  static func standIn(
    captionTracks: String = #"[{"baseUrl":"https://stand-in.test/ja","languageCode":"ja","isTranslatable":true}]"#,
    playerError: Int? = nil
  ) -> [String: String] {
    let response = """
      {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"Around the station","author":"Zenbu"},\
      "captions":{"playerCaptionsTracklistRenderer":{"captionTracks":\(captionTracks)}}}
      """
    var fixture: [String: Any] = [
      "playerResponse": response,
      "japanese": transcript(["駅の近くに本屋があります", "毎朝コーヒーを飲みます", "東京駅は三つ目の駅です"]),
      "english": transcript([
        "There's a bookstore near the station.", "I drink coffee every morning.",
        "Tokyo Station is the third stop.",
      ]),
      "duration": 12,
    ]
    if let playerError { fixture["playerError"] = playerError }
    let data = (try? JSONSerialization.data(withJSONObject: fixture)) ?? Data()
    return ["ZENBU_YOUTUBE_STAND_IN": String(decoding: data, as: UTF8.self)]
  }

  private static func transcript(_ lines: [String]) -> String {
    let texts = lines.enumerated().map { #"<text start="\#($0.offset * 4)" dur="3.5">\#($0.element)</text>"# }
    return "<transcript>" + texts.joined() + "</transcript>"
  }
}
