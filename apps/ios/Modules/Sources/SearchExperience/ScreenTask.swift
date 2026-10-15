import Observation
import SwiftUI

@MainActor
@Observable
final class ScreenReturns {
  private(set) var count = 0

  func stackChanged(from screens: Int, to remaining: Int) {
    if remaining < screens { count += 1 }
  }
}

extension View {
  func screenTask<ID: Equatable>(
    id: ID, _ action: @escaping @MainActor () async -> Void
  ) -> some View {
    modifier(ScreenTask(id: id, action: action))
  }
}

private struct ScreenTask<ID: Equatable>: ViewModifier {
  private struct Run: Equatable {
    let id: ID
    let returns: Int
  }

  @Environment(ScreenReturns.self) private var returns: ScreenReturns?
  let id: ID
  let action: @MainActor () async -> Void

  func body(content: Content) -> some View {
    content.task(id: Run(id: id, returns: returns?.count ?? 0)) { await action() }
  }
}
