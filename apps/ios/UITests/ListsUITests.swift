import XCTest

final class ListsUITests: ZenbuUITestCase {
  func testAListIsMadeRenamedAndDeleted() {
    let app = launch()
    open(.account, in: app)
    tap(find("account.lists", in: app))
    tap(find("word-lists.new-list", in: app))
    name("Anime", in: app)
    let row = waitFor(
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'word-lists.list.' AND label CONTAINS 'Anime'"))
        .firstMatch)
    let id = row.identifier.replacingOccurrences(of: "word-lists.list.", with: "")
    revealRowActions(on: row)
    tap(find("word-lists.rename.\(id)", in: app))
    name("Anime S1", in: app, button: "Save")
    let renamed = waitFor(labeled("Anime S1", in: app))
    revealRowActions(on: renamed)
    tap(find("word-lists.delete.\(id)", in: app))
    waitUntilGone(find("word-lists.list.\(id)", in: app))
  }
}
