import XCTest

final class PlayerWatchUITests: ZenbuUITestCase {
  static let link = "https://youtu.be/AQdI1o2D32I"

  func testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown() {
    let app = openVideo()
    for line in 0..<3 {
      assertOnScreen(find("watch.cue.\(line)", in: app), in: app)
    }
    let known = waitFor(find("watch.comprehension", in: app))
    waitUntil(known, mentions: "words known")
    waitFor(labeled("There's a bookstore near the station.", in: app))
  }

  func testThePlayersOwnControlsPlayStepAndRepeat() {
    let app = openVideo()
    let playPause = waitFor(find("watch.play-pause", in: app))
    playPause.tap()
    tap(find("watch.next", in: app))
    tap(find("watch.previous", in: app))
    tap(find("watch.repeat", in: app))
    XCTAssertTrue(find("watch.repeat", in: app).isSelected, "the line repeats")
    tap(find("watch.speed", in: app))
    for rate in ["0.5×", "0.75×", "1×", "1.25×", "1.5×"] {
      waitFor(menuChoice(rate, in: app))
    }
    if device == .mac {
      tap(menuChoice("1.25×", in: app))
    } else {
      tapWhereReachable([menuChoices("1.25×", in: app)], in: app)
    }
    assertOnScreen(find("watch.scrubber", in: app), in: app)
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
