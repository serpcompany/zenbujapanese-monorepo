import SwiftUI

struct HandwritingInputView: View {
  @Binding var query: String
  @Binding var mode: SearchInputMode
  let kanjiLookupClient: KanjiLookupClient
  let submit: (SearchQuery) -> Void
  @State private var model: HandwritingInputModel

  init(
    query: Binding<String>,
    mode: Binding<SearchInputMode>,
    recognitionClient: HandwritingRecognitionClient,
    kanjiLookupClient: KanjiLookupClient,
    submit: @escaping (SearchQuery) -> Void
  ) {
    _query = query
    _mode = mode
    self.kanjiLookupClient = kanjiLookupClient
    self.submit = submit
    _model = State(initialValue: HandwritingInputModel(recognitionClient: recognitionClient))
  }

  var body: some View {
    SearchInputPanel(mode: $mode) {
      VStack(spacing: 10) {
        HandwritingCanvas(strokes: $model.strokes, completedStroke: model.recognize)
          .aspectRatio(1, contentMode: .fit)
        SearchCandidateGrid(
          candidates: model.candidates.map(\.value),
          kanjiLookupClient: kanjiLookupClient,
          identifierPrefix: "handwriting",
          select: accept
        ) {
          recognitionMessage
        }
      }
    } actions: {
      SearchInputUndoButton(isEnabled: !model.strokes.isEmpty, undo: model.undoStroke)
        .accessibilityLabel("Undo stroke")
        .accessibilityIdentifier("handwriting.undo")
    }
    .onDisappear { model.cancelRecognition() }
  }

  private func accept(_ candidate: String) {
    let submittedQuery = SearchInputCandidate.query(query, adding: candidate)
    query = submittedQuery.value
    model.acceptCandidate()
    submit(submittedQuery)
  }

  private var recognitionMessage: some View {
    CandidateStripMessage {
      switch model.recognitionState {
      case .idle:
        EmptyView()
      case .recognizing:
        ProgressView().controlSize(.small)
        Text("Recognizing…")
      case .noCandidates:
        Text("No candidates yet. Add a stroke, or undo and try again.")
          .accessibilityIdentifier("handwriting.no-candidates")
      case .failed:
        Text("Recognition unavailable. Undo and try again.")
          .accessibilityIdentifier("handwriting.failure")
      }
    }
  }
}
