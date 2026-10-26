import SwiftUI

@MainActor
protocol TypedDraft: AnyObject {
  func keepDraft() async
}

@MainActor
final class TypedDrafts {
  private struct Held {
    weak var draft: (any TypedDraft)?
  }

  static let shared = TypedDrafts()
  private var held: [Held] = []

  func hold(_ draft: some TypedDraft) {
    held = held.filter { $0.draft != nil } + [Held(draft: draft)]
  }

  func keep() async {
    held = held.filter { $0.draft != nil }
    for draft in held.compactMap(\.draft) {
      await draft.keepDraft()
    }
  }

  func sceneChanged(to phase: ScenePhase) async {
    guard phase != .active else { return }
    await keep()
  }
}
