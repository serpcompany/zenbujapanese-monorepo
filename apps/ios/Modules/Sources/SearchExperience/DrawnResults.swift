import SwiftUI

struct DrawnResults: ViewModifier {
  let list: ResultsList
  @State private var drawn: [String] = []

  func body(content: Content) -> some View {
    if LaunchHarness.recordsDrawnResults {
      content
        .onChange(of: list, initial: true) { _, list in
          drawn.append(Self.summary(of: list))
        }
        .overlay(alignment: .topLeading) {
          Color.clear
            .frame(width: 1, height: 1)
            .allowsHitTesting(false)
            .accessibilityElement()
            .accessibilityIdentifier("search.results.drawn")
            .accessibilityValue(drawn.joined(separator: ", "))
        }
    } else {
      content
    }
  }

  nonisolated static func summary(of list: ResultsList) -> String {
    "\(list.rows.count { !$0.chips.isEmpty }) of \(list.rows.count) with chips"
  }
}
