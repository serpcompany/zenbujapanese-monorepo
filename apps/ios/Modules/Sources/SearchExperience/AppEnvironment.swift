import SwiftUI

extension View {
  func appEnvironment(readingAids: ReadingAidPreferences, profile: UserProfile) -> some View {
    environment(readingAids)
      .environment(profile)
      .environment(WordKnowledge.shared)
      .environment(ProgressLog.shared)
      .environment(WordLists.shared)
      .environment(NotesWithoutAWord.shared)
      .environment(LearnerNotes.shared)
      .environment(ZenbuAccount.shared)
      .modifier(ExampleRowsOnScreen(readingAids: readingAids))
  }
}

enum AppLifecycle {
  @MainActor
  static func applySharedChanges() {
    Task { await SharedChanges.inbox?.apply(to: .shared, .shared) }
  }

  static func applySharedChangesWhenPosted() {
    DarwinNotice.observe(SharedChanges.notice) { _ in
      Task { @MainActor in applySharedChanges() }
    }
  }

  @MainActor
  static func lastWindowClosed(translate: TranslateExperience) {
    translate.lastWindowClosed()
    ScreenAwake.keepAwake(false)
  }

  @MainActor
  static func finishSaving() async {
    await TypedDrafts.shared.keep()
    await WordKnowledge.shared.flush()
    await ProgressLog.shared.flush()
    await WordLists.shared.flush()
    await ZenbuAccount.shared?.sync.flush()
  }

  @MainActor
  static func sceneChanged(to phase: ScenePhase, translate: TranslateExperience) {
    Task { await TypedDrafts.shared.sceneChanged(to: phase) }
    switch phase {
    case .active:
      WordKnowledge.shared.saveIfNeeded()
      ProgressLog.shared.refreshDay()
      ProgressLog.shared.saveIfNeeded()
      WordLists.shared.saveIfNeeded()
      applySharedChanges()
      ZenbuAccount.shared?.appBecameActive()
      Task.detached(priority: .utility) { await EncounterMediaStore.live.deleteImagesDue() }
    case .background:
      translate.sceneMovedToBackground()
      ZenbuAccount.shared?.scheduler.appEnteredBackground()
    default:
      break
    }
  }
}
