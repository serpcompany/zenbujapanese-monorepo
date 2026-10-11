import Foundation

struct SearchQuery: Hashable, Sendable {
  let value: String

  init(_ rawValue: String) {
    value = rawValue.isEmpty ? "" : PresentationCore.shared.normalizedQuery(rawValue)
  }

  var isEmpty: Bool { value.isEmpty }
}
