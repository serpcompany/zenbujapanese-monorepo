import Foundation
import Testing

@testable import SearchExperience

@Suite("Shortcuts and Siri links")
struct AppLinkTests {
  private let scheme = "com.zenbujapanese.dictionary.uitests"

  private func link(_ action: AppAction) throws -> URL {
    try #require(action.url(scheme: scheme))
  }

  @Test("each action's text comes back from its link as it went in")
  func roundTrips() throws {
    let actions: [AppAction] = [
      .lookUp("見る"),
      .lookUp(" to eat & drink + 100% = ?#/"),
      .translate("Where can I buy a Suica card?\nThank you."),
    ]
    for action in actions {
      #expect(AppAction(try link(action), scheme: scheme) == action)
    }
  }

  @Test("a link is an action only in this build's own scheme, and only one it knows")
  func notActions() throws {
    let lookUp = try link(.lookUp("見る"))
    #expect(AppAction(lookUp, scheme: "com.zenbujapanese.dictionary") == nil)
    #expect(AppAction(lookUp, scheme: scheme.uppercased()) == .lookUp("見る"))
    for other in [
      "\(scheme)://look-up", "\(scheme)://translate?image=a", "\(scheme)://image-search?text=a",
      "\(scheme)://settings?text=a", "https://look-up?text=a",
    ] {
      #expect(AppAction(try #require(URL(string: other)), scheme: scheme) == nil, "\(other)")
    }
  }

  @Test("each build's scheme is its own bundle ID, so Zenbu Dev and a test build open only themselves")
  func schemes() {
    for suffix in ["", ".dev", ".uitests"] {
      let app = "com.zenbujapanese.dictionary\(suffix)"
      #expect(AppAction.scheme(ofApp: app) == app)
    }
  }

  @Test("a link opens the dictionary or Translate's typed text, and any other a website route")
  func destinations() throws {
    let open = { (url: URL) in AppLink(url, scheme: scheme) }
    #expect(open(try link(.lookUp("見る"))) == .dictionary(.lookUp("見る")))
    #expect(open(try link(.translate("Hello"))) == .translate("Hello"))
    for website in [
      "https://zenbujapanese.com/dictionary/見る-1259290/",
      "\(scheme)://zenbujapanese.com/dictionary/見る-1259290/",
      "\(scheme)://settings",
    ] {
      let url = try #require(URL(string: website))
      #expect(open(url) == .dictionary(.website(url)), "\(website)")
    }
  }

  @Test("Look Up opens the word written so, a form of only one word, or else the search results")
  func lookUpRoutes() async throws {
    let route = { (text: String) in await LookupClient.live.route(.lookUp(text)) }
    for (text, headword) in [("見る", "見る"), (" 食べた\n", "食べる")] {
      guard case .open(.word(let entry, nil)) = await route(text) else {
        Issue.record("\(text) doesn't open a word")
        continue
      }
      #expect(entry.headword == headword, "\(text)")
    }
    for (text, query) in [
      ("かみ", "かみ"), ("見", "見"), ("eat", "eat"), ("日本語を勉強しています", "日本語を勉強しています"),
    ] {
      #expect(await route(text) == .search(query), "\(text)")
    }
    #expect(await route(" ") == .home)
  }

  @Test("a website link in the app's own scheme opens the word, as the universal link does")
  func websiteLinkInTheAppsScheme() async throws {
    let url = try #require(URL(string: "\(scheme)://zenbujapanese.com/dictionary/見る-1259290/"))
    guard case .open(.word(let entry, nil)) = await LookupClient.live.route(.website(url)) else {
      Issue.record("the link doesn't open Word Detail")
      return
    }
    #expect(entry.headword == "見る")
  }

  @MainActor
  @Test("Shortcuts and Siri hand the window their action as a link in the app's scheme, once")
  func inbox() {
    let inbox = AppLinkInbox()
    inbox.lookUp("見る")
    #expect(inbox.take().flatMap { AppAction($0, scheme: AppLink.scheme) } == .lookUp("見る"))
    #expect(inbox.take() == nil)
    inbox.translate("Where is the station?")
    #expect(
      inbox.take().flatMap { AppAction($0, scheme: AppLink.scheme) }
        == .translate("Where is the station?"))
  }
}
