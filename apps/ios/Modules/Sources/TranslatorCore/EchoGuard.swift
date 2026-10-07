import Foundation

struct EchoGuard: Sendable {
  static let lingering: TimeInterval = 1.5
  static let resemblance = 0.6

  private struct Spoken: Sendable {
    var pairs: Set<String>
    var until: Date?
  }

  private var spoken: [Spoken] = []

  mutating func startSpeaking(_ text: String) {
    spoken.append(Spoken(pairs: Self.letterPairs(of: text), until: nil))
  }

  mutating func finishSpeaking(at now: Date) {
    for index in spoken.indices where spoken[index].until == nil {
      spoken[index].until = now.addingTimeInterval(Self.lingering)
    }
  }

  mutating func reset() {
    spoken = []
  }

  mutating func isEcho(_ text: String, at now: Date) -> Bool {
    spoken.removeAll { $0.until.map { $0 < now } ?? false }
    let heard = Self.letterPairs(of: text)
    guard !heard.isEmpty else { return false }
    return spoken.contains {
      Double(heard.intersection($0.pairs).count) / Double(heard.count) >= Self.resemblance
    }
  }

  static func letterPairs(of text: String) -> Set<String> {
    let letters = Array(text.lowercased().filter { $0.isLetter || $0.isNumber })
    guard letters.count > 1 else { return Set(letters.map(String.init)) }
    return Set((1..<letters.count).map { String(letters[$0 - 1]) + String(letters[$0]) })
  }
}
