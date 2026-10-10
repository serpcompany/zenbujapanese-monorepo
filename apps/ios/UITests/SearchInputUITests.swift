import XCTest

final class SearchInputUITests: ZenbuUITestCase {
  func testThePencilAndGridOpenOnePanelThatSwitchesBetweenThem() {
    let app = launch()
    open(.search, in: app)
    tap(find("search.input.handwriting", in: app))
    let canvas = waitFor(find("handwriting.canvas", in: app))
    XCTAssertFalse(find("handwriting.undo", in: app).isEnabled, "there's no stroke to undo yet")
    switchInputPanel(to: "radicals", showing: "radical.grid", in: app)
    waitFor(labeled("Select one or more radicals", in: app))
    switchInputPanel(to: "handwriting", showing: "handwriting.canvas", in: app)
    closeInputPanel(in: app)
    waitUntilGone(canvas)
    assertOnScreen(find("search.input.handwriting", in: app), in: app)
  }

  func testThePanelOpensAndStaysWhileTheFieldHasTheCaret() {
    let app = launch()
    open(.search, in: app)
    tap(searchField(in: app))
    tap(find("search.input.handwriting", in: app))
    let canvas = waitFor(find("handwriting.canvas", in: app))
    RunLoop.current.run(until: Date.now.addingTimeInterval(3))
    XCTAssertTrue(canvas.exists, "the panel stays open once the field gives up the caret")
  }

  func testARadicalsKanjiJoinsTheQueryAndSearches() {
    let app = launch()
    open(.search, in: app)
    tap(find("search.input.radicals", in: app))
    let undo = waitFor(find("radical.undo", in: app))
    XCTAssertFalse(undo.isEnabled, "no radical is selected yet")
    tap(find("radical.one", in: app))
    let candidate = firstElement(identifiedBy: "radical.candidate.", in: app)
    waitFor(candidate)
    undo.tap()
    waitUntilGone(candidate)
    tap(find("radical.one", in: app))
    let first = waitFor(candidate).label
    candidate.tap()
    waitFor(find("search.results", in: app))
    waitUntilGone(find("radical.grid", in: app))
    XCTAssertEqual(searchField(in: app).value as? String, first, "the kanji is the query")
    tap(find("search.input.radicals", in: app))
    tap(find("radical.one", in: app))
    let second = waitFor(candidate).label
    candidate.tap()
    waitUntilGone(find("radical.grid", in: app))
    waitUntil(searchField(in: app), "value == %@", first + second)
  }

  func testADrawnStrokeOffersKanjiUntilItsUndone() {
    let app = launch()
    open(.search, in: app)
    tap(find("search.input.handwriting", in: app))
    let canvas = waitFor(find("handwriting.canvas", in: app))
    let undo = find("handwriting.undo", in: app)
    let candidate = firstElement(identifiedBy: "handwriting.candidate.", in: app)
    draw(on: canvas, from: CGVector(dx: 0.5, dy: 0.15), to: CGVector(dx: 0.5, dy: 0.85))
    waitUntil(undo, "isEnabled == true")
    XCTAssertTrue(canvas.exists, "a stroke drawn downward doesn't drag the sheet away")
    undo.tap()
    draw(on: canvas, from: Self.strokeStart, to: Self.strokeEnd)
    waitFor(candidate)
    undo.tap()
    waitUntilGone(candidate)
    draw(on: canvas, from: Self.strokeStart, to: Self.strokeEnd)
    waitFor(candidate).tap()
    waitFor(find("search.results", in: app))
    waitUntilGone(canvas)
  }

  private static let strokeStart = CGVector(dx: 0.2, dy: 0.5)
  private static let strokeEnd = CGVector(dx: 0.8, dy: 0.5)

  private func draw(on canvas: XCUIElement, from start: CGVector, to end: CGVector) {
    canvas.coordinate(withNormalizedOffset: start)
      .press(forDuration: 0.2, thenDragTo: canvas.coordinate(withNormalizedOffset: end))
  }
}
