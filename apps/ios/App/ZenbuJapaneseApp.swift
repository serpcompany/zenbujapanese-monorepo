import SearchExperience
import SwiftUI

@main
struct ZenbuJapaneseApp: App {
  init() {
    SiriWordList.shared.changed = { ZenbuShortcuts.updateAppShortcutParameters() }
    SiriWordList.shared.start()
    ZenbuShortcuts.updateAppShortcutParameters()
  }

  var body: some Scene {
    ZenbuJapaneseScenes()
  }
}
