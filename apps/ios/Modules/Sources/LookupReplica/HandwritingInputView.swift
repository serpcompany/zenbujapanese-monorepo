import SwiftUI

struct HandwritingInputView: View {
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
      SearchInputModeBar(selectedMode: .handwriting, selectMode: selectMode)

      HStack(spacing: 0) {
        HandwritingCanvas(strokes: $model.strokes, completedStroke: model.recognize)
          .frame(width: 180, height: 180)
          .frame(maxWidth: .infinity)
          .padding(8)

        VStack(spacing: 0) {
          Button {
            model.eraseDrawing()
          } label: {
            Image(systemName: "eraser")
              .font(.system(size: 24))
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
          .disabled(model.strokes.isEmpty)
          .accessibilityLabel("Erase drawing")
          .accessibilityIdentifier("handwriting.erase")

          Button("Search") {
            let normalized = model.submittedQuery(appendingTo: query)
            query = normalized.value
            submit(normalized)
          }
          .font(.system(size: 17, weight: .semibold))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(canSubmit ? ReplicaPalette.selectedTab : Color.white.opacity(0.08))
          .disabled(!canSubmit)
          .accessibilityIdentifier("handwriting.search")
        }
        .frame(width: 64)
      }
      .frame(height: 196)
    }
    .background(ReplicaPalette.row)
    .overlay(alignment: .top) {
      Rectangle().fill(.white.opacity(0.1)).frame(height: 0.5)
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
            .accessibilityIdentifier("handwriting.failure")
        }
        Spacer()
      }
      .font(.system(size: 14))
      .foregroundStyle(ReplicaPalette.secondaryText)
      .padding(.horizontal, 14)
      .frame(height: 46)
    } else {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 0) {
          ForEach(Array(model.candidates.enumerated()), id: \.element.id) { index, candidate in
            Button(candidate.value) {
              query.append(candidate.value)
              model.acceptCandidate()
            }
            .font(.system(size: 27))
            .foregroundStyle(.white)
            .frame(minWidth: 54, minHeight: 46)
            .accessibilityLabel("Use handwriting candidate \(candidate.value)")
            .accessibilityValue("Candidate rank \(index + 1)")
            .accessibilityIdentifier("handwriting.candidate.\(candidate.value)")
          }
        }
      }
      .frame(height: 46)
    }
  }

  private var canSubmit: Bool {
    !SearchQuery(query).isEmpty || (!model.strokes.isEmpty && model.candidates.first != nil)
  }
}
