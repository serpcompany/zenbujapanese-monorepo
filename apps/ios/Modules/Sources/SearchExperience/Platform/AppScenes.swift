import SwiftUI

public struct ZenbuJapaneseScenes: Scene {
  @State private var readingAids: ReadingAidPreferences
  @State private var profile: UserProfile
  @State private var commands = AppCommandRouter()
  @State private var translate: TranslateExperience
  @Environment(\.scenePhase) private var scenePhase

  public init() {
    LaunchHarness.prepare()
    AppLifecycle.applySharedChangesWhenPosted()
    ProgressLog.shared.listen(to: .shared)
    _readingAids = State(initialValue: ReadingAidPreferences())
    _profile = State(initialValue: UserProfile.shared)
    _translate = State(initialValue: TranslateExperience.live())
  }

  public var body: some Scene {
    WindowGroup {
      SearchExperienceRootView()
        .appEnvironment(readingAids: readingAids, profile: profile)
        .environment(commands)
        .environment(translate)
        .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
        .appWindowMinimumSize()
        .preferredColorScheme(LaunchHarness.colorScheme)
        .task { ShareSheetHarness.open() }
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
          .preferredColorScheme(LaunchHarness.colorScheme)
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
