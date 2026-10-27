import SearchExperience
import SwiftUI

@main
struct ZenbuJapaneseApp: App {
  @ApplicationDelegateAdaptor private var delegate: ApplicationDelegate

  init() {
    CrashReporter.startAtLaunch()
  }

  var body: some Scene {
    ZenbuJapaneseScenes()
  }
}
