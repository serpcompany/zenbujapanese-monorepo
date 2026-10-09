import SwiftUI

public struct ZenbuJapaneseScenes: Scene {
  @State private var readingAids = ReadingAidPreferences()
  @State private var profile = UserProfile()
  @State private var commands = AppCommandRouter()
  @State private var translate = TranslateExperience.live()
  @Environment(\.scenePhase) private var scenePhase

  public init() {}

  public var body: some Scene {
    WindowGroup {
      SearchExperienceRootView()
        .appEnvironment(readingAids: readingAids, profile: profile)
        .environment(commands)
        .environment(translate)
        .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
        .appWindowMinimumSize()
    }
    .commands { AppCommands(router: commands) }
    .appWindowDefaults()
    .onChange(of: scenePhase, initial: true) { _, phase in
      AppLifecycle.sceneChanged(to: phase, translate: translate)
    }
    #if os(macOS)
      Settings {
        AppSettingsView()
          .appEnvironment(readingAids: readingAids, profile: profile)
      }
    #endif
  }
}

extension Scene {
  fileprivate func appWindowDefaults() -> some Scene {
    #if os(macOS)
      defaultSize(width: AppWindow.defaultSize.width, height: AppWindow.defaultSize.height)
        .windowResizability(.contentMinSize)
        .commands { ImportFromDevicesCommands() }
    #else
      backgroundTask(.appRefresh(AccountBackgroundSync.taskIdentifier)) {
        await AccountBackgroundSync.run()
      }
    #endif
  }
}

extension View {
  fileprivate func appWindowMinimumSize() -> some View {
    #if os(macOS)
      frame(minWidth: AppWindow.minimumSize.width, minHeight: AppWindow.minimumSize.height)
    #else
      self
    #endif
  }
}
