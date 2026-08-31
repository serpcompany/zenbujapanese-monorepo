import Observation

@MainActor
@Observable
final class HandwritingInputModel {
  enum RecognitionState {
    case idle
    case recognizing
    case noCandidates
    case failed
  }

  var strokes: [[HandwritingPoint]] = []
  private(set) var candidates: [HandwritingCandidate] = []
  private(set) var recognitionState = RecognitionState.idle
  private var recognitionRevision = 0
  private var recognitionTask: Task<Void, Never>?
  private let recognitionClient: HandwritingRecognitionClient

  init(recognitionClient: HandwritingRecognitionClient) {
    self.recognitionClient = recognitionClient
  }

  func recognize(_ sample: HandwritingSample) {
    recognitionTask?.cancel()
    recognitionRevision += 1
    let revision = recognitionRevision
    recognitionState = .recognizing
    recognitionTask = Task { [weak self] in
      guard let self else { return }
      do {
        let recognized = try await recognitionClient.recognize(sample)
        try Task.checkCancellation()
        guard revision == recognitionRevision else { return }
        candidates = recognized
        recognitionState = recognized.isEmpty ? .noCandidates : .idle
        recognitionTask = nil
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled, revision == recognitionRevision else { return }
        candidates = []
        recognitionState = .failed
        recognitionTask = nil
      }
    }
  }

  func eraseDrawing() {
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRevision += 1
    strokes = []
    candidates = []
    recognitionState = .idle
  }

  func acceptCandidate() {
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRevision += 1
    strokes = []
    candidates = []
    recognitionState = .idle
  }

  func cancelRecognition() {
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRevision += 1
    if recognitionState == .recognizing { recognitionState = .idle }
  }

  func submittedQuery(appendingTo existingQuery: String) -> SearchQuery {
    var submitted = existingQuery
    if !strokes.isEmpty, let pendingCandidate = candidates.first {
      submitted.append(pendingCandidate.value)
    }
    return SearchQuery(submitted)
  }
}
