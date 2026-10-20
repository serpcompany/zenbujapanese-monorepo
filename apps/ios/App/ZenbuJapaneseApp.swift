import SearchExperience
import SwiftUI

@main
struct ZenbuJapaneseApp: App {
  init() {
    CrashReporter.startAtLaunch()
  }

  var body: some Scene {
    ZenbuJapaneseScenes()
  }
}
