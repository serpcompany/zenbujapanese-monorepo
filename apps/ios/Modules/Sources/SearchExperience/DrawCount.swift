import SwiftUI

final class DrawCount {
  private var draws = 0

  func next() -> Int {
    draws += 1
    return draws
  }
}

extension View {
  @ViewBuilder
  func countingDraws(as identifier: String, in count: DrawCount) -> some View {
    if LaunchHarness.countsDraws {
      let drawn = count.next()
      overlay(alignment: .topLeading) {
        DrawCountProbe(identifier: identifier, draws: drawn)
      }
    } else {
      self
    }
  }
}

private struct DrawCountProbe: View {
  let identifier: String
  let draws: Int

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .allowsHitTesting(false)
      .accessibilityElement()
      .accessibilityIdentifier(identifier)
      .accessibilityValue("\(draws)")
  }
}
