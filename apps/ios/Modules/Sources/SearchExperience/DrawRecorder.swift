import SwiftUI

struct DrawRecorder<Value: Equatable>: ViewModifier {
  private let value: () -> Value
  private let identifier: String
  private let summary: (Value) -> String
  @State private var drawn: [String] = []

  init(
    _ value: @autoclosure @escaping () -> Value, as identifier: String,
    summary: @escaping (Value) -> String
  ) {
    self.value = value
    self.identifier = identifier
    self.summary = summary
  }

  func body(content: Content) -> some View {
    if LaunchHarness.recordsDraws {
      content
        .onChange(of: value(), initial: true) { _, value in
          drawn.append(summary(value))
        }
        .overlay(alignment: .topLeading) {
          Text(verbatim: drawn.joined(separator: "; "))
            .font(.system(size: 1))
            .foregroundStyle(.clear)
            .lineLimit(1)
            .frame(width: 1, height: 1)
            .allowsHitTesting(false)
            .accessibilityIdentifier(identifier)
        }
    } else {
      content
    }
  }
}

extension ResultsList {
  var drawnSummary: String {
    "\(rows.count { !$0.chips.isEmpty }) of \(rows.count) with chips"
  }
}

extension KanjiPage {
  var drawnSummary: String {
    let readingWords = readings.reduce(0) { $0 + $1.words.count }
    return "\(stats.count) stats, \(readings.count) readings, \(elements.count) elements, "
      + "\(readingWords) reading words, \(words.count) words"
  }
}
