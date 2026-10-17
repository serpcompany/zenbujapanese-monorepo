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
      ZStack(alignment: .topLeading) {
        self
        DrawCountProbe(identifier: identifier, text: "\(drawn)")
      }
    } else {
      self
    }
  }

  @ViewBuilder
  func showingUITests(_ text: String, as identifier: String) -> some View {
    if LaunchHarness.countsDraws {
      ZStack(alignment: .topLeading) {
        self
        DrawCountProbe(identifier: identifier, text: text)
      }
    } else {
      self
    }
  }
}

private struct DrawCountProbe: View {
  let identifier: String
  let text: String

  var body: some View {
    Text(verbatim: text)
      .font(.system(size: 1))
      .foregroundStyle(.clear)
      .lineLimit(1)
      .frame(width: 1, height: 1)
      .allowsHitTesting(false)
      .accessibilityIdentifier(identifier)
  }
}
