import XCTest

final class AppLinkUITests: ZenbuUITestCase {
  private let miru = "ruby.見る.見=み|る"

  private func link(_ action: String, _ items: KeyValuePairs<String, String>) throws -> URL {
    var components = URLComponents()
    components.scheme = "com.zenbujapanese.dictionary.uitests"
    components.host = action
    components.queryItems = items.map { URLQueryItem(name: $0.key, value: $0.value) }
    return try XCTUnwrap(components.url)
  }

  private func launch(opening link: URL, _ environment: [String: String] = [:]) -> XCUIApplication {
    let app = launch(TestDevice.linkEnvironment(link).merging(environment) { $1 })
    TestDevice.open(link, in: app)
    return app
  }

  private func assertWordPage(of headword: String, in app: XCUIApplication) {
    assertOnScreen(find("word-detail.screen", in: app), in: app)
    waitFor(find(headword, in: app))
  }

  func testLookUpOpensTheWordsPageFromAnotherTab() throws {
    let lookUp = try link("look-up", ["text": "見る"])
    let app = launch(TestDevice.linkEnvironment(lookUp))
    open(.translate, in: app)
    TestDevice.open(lookUp, in: app)
    assertWordPage(of: miru, in: app)
  }

  func testLookUpOfAWordWithSeveralEntriesShowsItsSearchResults() throws {
    let app = launch(opening: try link("look-up", ["text": "かみ"]))
    assertOnScreen(find("search.results", in: app), in: app)
    waitUntil(searchField(in: app), "value == %@", "かみ")
  }

  func testTranslateWithZenbuOpensTypedTranslationWithTheText() throws {
    let text = "Where can I buy a Suica card?"
    let app = launch(opening: try link("translate", ["text": text]), TranslateUITests.script)
    waitUntil(waitFor(find("translate.typed.input", in: app)), "value == %@", text)
    waitUntil(waitFor(find("translate.typed.direction", in: app)), mentions: "English → Japanese")
  }

  func testAWebsiteLinkOpensItsWordInTheApp() throws {
    let word = "com.zenbujapanese.dictionary.uitests://zenbujapanese.com/dictionary/見る-1259290/"
    let app = launch(opening: try XCTUnwrap(URL(string: word)))
    assertWordPage(of: miru, in: app)
  }
}
