import SwiftUI

public struct ZenbuJapaneseScenes: Scene {
  @State private var readingAids = ReadingAidPreferences()
  @State private var profile = UserProfile()
  @Environment(\.scenePhase) private var scenePhase

  public init() {}

  public var body: some Scene {
    WindowGroup {
      SearchExperienceRootView()
        .appEnvironment(readingAids: readingAids, profile: profile)
    }
    .appWindowDefaults()
    .onChange(of: scenePhase, initial: true) { _, phase in
      AppLifecycle.sceneChanged(to: phase)
    }
  }
}

extension Scene {
  fileprivate func appWindowDefaults() -> some Scene {
    #if os(macOS)
      self
    #else
      backgroundTask(.appRefresh(AccountBackgroundSync.taskIdentifier)) {
        await AccountBackgroundSync.run()
      }
    #endif
  }
}
