import SwiftUI

struct DrawRecorder<Value: Equatable>: ViewModifier {
  let value: Value
  let identifier: String
  let summary: (Value) -> String
  @State private var drawn: [String] = []

  init(_ value: Value, as identifier: String, summary: @escaping (Value) -> String) {
    self.value = value
    self.identifier = identifier
    self.summary = summary
  }

  func body(content: Content) -> some View {
    if LaunchHarness.countsDraws {
      content
        .onChange(of: value, initial: true) { _, value in
          drawn.append(summary(value))
        }
        .overlay(alignment: .topLeading) {
          DrawCountProbe(identifier: identifier, text: drawn.joined(separator: "; "))
        }
    } else {
      content
    }
  }
}

extension ResultsList {
  static func drawnSummary(_ list: ResultsList) -> String {
    "\(list.rows.count) rows, \(list.rows.count { !$0.chips.isEmpty }) with chips"
  }
}

extension KanjiPage {
  static func drawnSummary(_ page: KanjiPage?) -> String {
    let readingWords = page?.readings.reduce(0) { $0 + $1.words.count } ?? 0
    return "\(page?.stats.count ?? 0) stats, \(page?.readings.count ?? 0) readings, "
      + "\(page?.elements.count ?? 0) elements, \(readingWords) reading words, "
      + "\(page?.words.count ?? 0) words"
  }
}
