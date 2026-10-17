import Testing

@testable import SearchExperience

@Suite("Handwriting recognition")
struct HandwritingRecognitionTests {
  private static let across = line(from: (0.15, 0.5), to: (0.85, 0.5))
  private static let down = line(from: (0.5, 0.12), to: (0.5, 0.88))

  @Test("a drawn kanji is read by its shape, whatever the stroke direction")
  func strokeDirection() async throws {
    for stroke in [Self.across, Self.across.reversed()] {
      let candidates = try await read([Array(stroke)])
      #expect(candidates.contains("一"), "\(candidates)")
    }
  }

  @Test("the same strokes in either order read as the same kanji")
  func strokeOrder() async throws {
    for strokes in [[Self.across, Self.down], [Self.down, Self.across]] {
      let candidates = try await read(strokes)
      #expect(candidates.contains("十"), "\(candidates)")
    }
  }

  private func read(_ strokes: [[HandwritingPoint]]) async throws -> [String] {
    try await HandwritingRecognitionClient.live
      .recognize(HandwritingSample(strokes: strokes)).prefix(10).map(\.value)
  }

  private static func line(from start: (Double, Double), to end: (Double, Double))
    -> [HandwritingPoint]
  {
    (0...20).map { step in
      let t = Double(step) / 20
      return HandwritingPoint(
        x: start.0 + (end.0 - start.0) * t, y: start.1 + (end.1 - start.1) * t)
    }
  }
}
