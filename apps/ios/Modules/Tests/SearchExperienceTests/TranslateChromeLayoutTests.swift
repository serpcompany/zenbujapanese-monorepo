import SwiftUI
import Testing

@testable import SearchExperience

@Suite("Translate chrome layout")
struct TranslateChromeLayoutTests {
  @Test("the conversation on screen hides the tab bar and the session bar")
  func conversationOnScreen() {
    let layout = TranslateChromeLayout(isSessionLive: true, isConversationOnScreen: true)
    #expect(layout.tabBar == .hidden)
    #expect(!layout.showsSessionBar)
  }

  @Test("a screen over a live conversation shows the tab bar under the session bar")
  func screenOverConversation() {
    let layout = TranslateChromeLayout(isSessionLive: true, isConversationOnScreen: false)
    #expect(layout.tabBar == .visible)
    #expect(layout.showsSessionBar)
  }

  @Test("without a session there's no session bar")
  func noSession() {
    let layout = TranslateChromeLayout(isSessionLive: false, isConversationOnScreen: false)
    #expect(layout.tabBar == .visible)
    #expect(!layout.showsSessionBar)
  }
}
