import Foundation
import Testing
@testable import SearchExperience

@MainActor
@Suite("Handwriting undo")
struct HandwritingUndoTests {
  private let horizontal = [HandwritingPoint(x: 0.2, y: 0.5), HandwritingPoint(x: 0.8, y: 0.5)]
  private let vertical = [HandwritingPoint(x: 0.5, y: 0.2), HandwritingPoint(x: 0.5, y: 0.8)]

  private func model(recorder: StrokeCountRecorder) -> HandwritingInputModel {
    HandwritingInputModel(
      recognitionClient: HandwritingRecognitionClient { sample in
        await recorder.record(sample.strokes.count)
        return sample.strokes.count == 1
          ? [HandwritingCandidate(value: "一")] : [HandwritingCandidate(value: "十")]
      })
  }

  private func settle(_ model: HandwritingInputModel) async {
    for _ in 0..<200 where model.recognitionState == .recognizing {
      try? await Task.sleep(for: .milliseconds(5))
    }
  }

  @Test("undo removes the last stroke and recognizes the rest again")
  func undoRecognizesRemainingStrokes() async {
    let recorder = StrokeCountRecorder()
    let model = model(recorder: recorder)
    model.strokes = [horizontal, vertical]
    model.recognize(HandwritingSample(strokes: model.strokes))
    await settle(model)
    #expect(model.candidates.map(\.value) == ["十"])

    model.undoStroke()
    await settle(model)

    #expect(model.strokes == [horizontal])
    #expect(model.candidates.map(\.value) == ["一"])
    #expect(await recorder.counts == [2, 1])
  }

  @Test("undoing the last stroke empties the drawing without recognizing")
  func undoLastStrokeClears() async {
    let recorder = StrokeCountRecorder()
    let model = model(recorder: recorder)
    model.strokes = [horizontal]
    model.recognize(HandwritingSample(strokes: model.strokes))
    await settle(model)

    model.undoStroke()
    await settle(model)

    #expect(model.strokes.isEmpty)
    #expect(model.candidates.isEmpty)
    #expect(model.recognitionState == .idle)
    #expect(await recorder.counts == [1])
  }
}

private actor StrokeCountRecorder {
  private(set) var counts: [Int] = []

  func record(_ count: Int) {
    counts.append(count)
  }
}
