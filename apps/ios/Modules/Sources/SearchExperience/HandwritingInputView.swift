import SwiftUI

struct HandwritingInputView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  let selectMode: (SearchInputMode) -> Void
  let submit: (SearchQuery) -> Void
  @State private var model: HandwritingInputModel

  init(
    query: Binding<String>,
    recognitionClient: HandwritingRecognitionClient,
    selectMode: @escaping (SearchInputMode) -> Void,
    submit: @escaping (SearchQuery) -> Void
  ) {
    _query = query
    self.selectMode = selectMode
    self.submit = submit
    _model = State(initialValue: HandwritingInputModel(recognitionClient: recognitionClient))
  }

  var body: some View {
    VStack(spacing: 0) {
      candidateStrip
      SearchInputModePicker(selectedMode: .handwriting, selectMode: selectMode)

      HandwritingCanvas(strokes: $model.strokes, completedStroke: model.recognize)
        .aspectRatio(1, contentMode: .fit)
        .frame(
          minWidth: dynamicTypeSize.isAccessibilitySize ? nil : 240,
          maxWidth: .infinity,
          minHeight: dynamicTypeSize.isAccessibilitySize ? nil : 240,
          maxHeight: .infinity
        )
        .padding(8)

      HStack {
        Button {
          model.eraseDrawing()
        } label: {
          Image(systemName: "eraser")
        }
        .buttonStyle(.bordered)
        .disabled(model.strokes.isEmpty)
        .accessibilityLabel("Erase drawing")
        .accessibilityIdentifier("handwriting.erase")

        Spacer()
      }
      .controlSize(.large)
      .padding(.horizontal)
      .padding(.bottom, 10)
    }
    .onDisappear { model.cancelRecognition() }
  }

  @ViewBuilder
  private var candidateStrip: some View {
    if model.candidates.isEmpty {
      HStack {
        switch model.recognitionState {
        case .idle: Text("Draw one Japanese character")
        case .recognizing:
          ProgressView().controlSize(.small)
          Text("Recognizing…")
        case .noCandidates:
          Text("No candidates yet. Add a stroke or erase and try again.")
            .accessibilityIdentifier("handwriting.no-candidates")
        case .failed:
          Text("Recognition unavailable. Erase and try again.")
            .foregroundStyle(.red)
            .accessibilityIdentifier("handwriting.failure")
        }
        Spacer()
      }
      .font(.body)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
      .padding(.horizontal, 14)
      .padding(.vertical, 6)
      .frame(minHeight: 46)
    } else {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 0) {
          ForEach(Array(model.candidates.enumerated()), id: \.element.id) { index, candidate in
            Button(candidate.value) {
              let submittedQuery = SearchQuery(query + candidate.value)
              query = submittedQuery.value
              model.acceptCandidate()
              submit(submittedQuery)
            }
            .font(.title)
            .frame(minWidth: 54, minHeight: 46)
            .accessibilityLabel("Use handwriting candidate \(candidate.value)")
            .accessibilityValue("Candidate rank \(index + 1)")
            .accessibilityIdentifier("handwriting.candidate.\(candidate.value)")
          }
        }
      }
      .frame(minHeight: 46)
    }
  }
}
