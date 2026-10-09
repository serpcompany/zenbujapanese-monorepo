import SwiftUI

struct HandwritingInputView: View {
  @Binding var query: String
  let kanjiLookupClient: KanjiLookupClient
  let submit: (SearchQuery) -> Void
  @State private var model: HandwritingInputModel

  init(
    query: Binding<String>,
    recognitionClient: HandwritingRecognitionClient,
    kanjiLookupClient: KanjiLookupClient,
    submit: @escaping (SearchQuery) -> Void
  ) {
    _query = query
    self.kanjiLookupClient = kanjiLookupClient
    self.submit = submit
    _model = State(initialValue: HandwritingInputModel(recognitionClient: recognitionClient))
  }

  var body: some View {
    SearchInputPanel {
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
      Button {
        model.undoStroke()
      } label: {
        Image(systemName: "arrow.uturn.backward")
          .font(.title3)
          .padding(12)
          .frame(minWidth: 48, minHeight: 48)
          .searchInputGlass(in: .circle)
      }
      .disabled(model.strokes.isEmpty)
      .accessibilityLabel("Undo stroke")
      .accessibilityIdentifier("handwriting.undo")

      Spacer()

      SearchInputClearButton(isEnabled: !model.strokes.isEmpty, clear: model.eraseDrawing)
        .accessibilityIdentifier("handwriting.erase")
    }
    .onDisappear { model.cancelRecognition() }
  }

  private func accept(_ candidate: String) {
    let submittedQuery = SearchQuery(query + candidate)
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
        Text("No candidates yet. Add a stroke or clear and try again.")
          .accessibilityIdentifier("handwriting.no-candidates")
      case .failed:
        Text("Recognition unavailable. Clear and try again.")
          .accessibilityIdentifier("handwriting.failure")
      }
    }
  }
}
