import Foundation

struct HandwritingPoint: Hashable, Sendable {
  let x: Double
  let y: Double
}

struct HandwritingSample: Sendable {
  let strokes: [[HandwritingPoint]]
}

struct HandwritingCandidate: Hashable, Identifiable, Sendable {
  let value: String

  var id: String { value }
}

struct HandwritingRecognitionClient: Sendable {
  var recognize: @Sendable (HandwritingSample) async throws -> [HandwritingCandidate]
}
