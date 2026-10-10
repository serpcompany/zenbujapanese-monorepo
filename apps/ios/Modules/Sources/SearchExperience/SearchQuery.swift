import Foundation

struct SearchQuery: Hashable, Sendable {
  let value: String

  init(_ rawValue: String) {
    value = rawValue.isEmpty ? "" : PresentationCore.shared.normalizedQuery(rawValue)
  }

  var isEmpty: Bool { value.isEmpty }
  var isJapaneseOnly: Bool { !isEmpty && value.unicodeScalars.allSatisfy(Self.isJapanese) }

  private static func isJapanese(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x3005, 0x3040...0x30FF, 0x3400...0x4DBF, 0x4E00...0x9FFF:
      true
    default:
      false
    }
  }
}
