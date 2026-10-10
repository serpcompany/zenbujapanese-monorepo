import XCTest

final class ListsUITests: ZenbuUITestCase {
  func testAListIsMadeRenamedAndDeleted() {
    let app = launch()
    let row = makeList("Anime", in: app)
    let id = row.identifier.replacingOccurrences(of: "word-lists.list.", with: "")
    revealRowActions(on: row)
    tap(find("word-lists.rename.\(id)", in: app))
    name("Anime S1", in: app, button: "Save")
    let renamed = waitFor(labeled("Anime S1", in: app))
    revealRowActions(on: renamed)
    tap(find("word-lists.delete.\(id)", in: app))
    waitUntilGone(find("word-lists.list.\(id)", in: app))
  }

  func testListsAreDraggedIntoOrder() {
    let app = launch()
    let anime = makeList("Anime", in: app)
    let favorites = waitFor(listRow("Favorites", in: app))
    let animeWasFirst = anime.frame.minY < favorites.frame.minY
    let (upper, lower) = animeWasFirst ? (anime, favorites) : (favorites, anime)
    if device != .mac { tap(find("word-lists.edit", in: app)) }
    let grip = device == .mac ? lower : reorderControl(beside: lower, in: app)
    grip.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(
      forDuration: 0.8, thenDragTo: upper.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)),
      withVelocity: .slow, thenHoldForDuration: 0.5)
    let flipped = NSPredicate { _, _ in (anime.frame.minY < favorites.frame.minY) != animeWasFirst }
    expectation(for: flipped, evaluatedWith: nil)
    waitForExpectations(timeout: Self.patience)
  }

  private func makeList(_ name: String, in app: XCUIApplication) -> XCUIElement {
    open(.account, in: app)
    tap(find("account.lists", in: app))
    tap(find("word-lists.new-list", in: app))
    self.name(name, in: app)
    return waitFor(listRow(name, in: app))
  }

  private func listRow(_ name: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'word-lists.list.' AND label CONTAINS %@", name))
      .firstMatch
  }

  private func reorderControl(beside row: XCUIElement, in app: XCUIApplication) -> XCUIElement {
    let controls = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Reorder'"))
    waitFor(controls.firstMatch)
    let midY = row.frame.midY
    return controls.allElementsBoundByIndex.min {
      abs($0.frame.midY - midY) < abs($1.frame.midY - midY)
    } ?? controls.firstMatch
  }
}
