import SwiftUI

extension View {
  func appEnvironment(readingAids: ReadingAidPreferences, profile: UserProfile) -> some View {
    environment(readingAids)
      .environment(profile)
      .environment(WordKnowledge.shared)
      .environment(WordLists.shared)
      .environment(ZenbuAccount.shared)
  }
}

enum AppLifecycle {
  @MainActor
  static func lastWindowClosed(translate: TranslateExperience) {
    translate.lastWindowClosed()
    ScreenAwake.keepAwake(false)
  }

  @MainActor
  static func sceneChanged(to phase: ScenePhase, translate: TranslateExperience) {
    switch phase {
    case .active:
      WordKnowledge.shared.saveIfNeeded()
      WordLists.shared.saveIfNeeded()
      ZenbuAccount.shared?.scheduler.appBecameActive()
    case .background:
      translate.sceneMovedToBackground()
      ZenbuAccount.shared?.scheduler.appEnteredBackground()
    default:
      break
    }
  }
}
