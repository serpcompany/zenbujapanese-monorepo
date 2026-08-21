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
      SearchInputModeBar(selectedMode: .handwriting, selectMode: selectMode)

      HStack(spacing: 0) {
        HandwritingCanvas(strokes: $model.strokes, completedStroke: model.recognize)
          .aspectRatio(1, contentMode: .fit)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .padding(8)

        VStack(spacing: 0) {
          Button {
            model.eraseDrawing()
          } label: {
            Image(systemName: "eraser")
              .font(.title2)
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
          .font(.body.weight(.semibold))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(canSubmit ? ZenbuTheme.selectedTab : ZenbuTheme.mutedForeground.opacity(0.08))
          .foregroundStyle(canSubmit ? ZenbuTheme.primaryForeground : ZenbuTheme.foreground)
          .buttonStyle(UndimmedPlainButtonStyle())
          .disabled(!canSubmit)
          .accessibilityIdentifier("handwriting.search")
        }
        .frame(width: dynamicTypeSize >= .xxLarge ? 110 : 64)
      }
      .frame(minHeight: dynamicTypeSize >= .xxLarge ? 340 : 264)
    }
    .background(ZenbuTheme.row)
    .overlay(alignment: .top) {
      Rectangle().fill(ZenbuTheme.mutedForeground.opacity(0.1)).frame(height: 0.5)
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
      .font(.body)
      .foregroundStyle(ZenbuTheme.secondaryText)
      .fixedSize(horizontal: false, vertical: true)
      .padding(.horizontal, 14)
      .padding(.vertical, 6)
      .frame(minHeight: 46)
    } else {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 0) {
          ForEach(Array(model.candidates.enumerated()), id: \.element.id) { index, candidate in
            Button(candidate.value) {
              query.append(candidate.value)
              model.acceptCandidate()
            }
            .font(.title)
            .foregroundStyle(ZenbuTheme.foreground)
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

  private var canSubmit: Bool {
    !SearchQuery(query).isEmpty || (!model.strokes.isEmpty && model.candidates.first != nil)
  }
}
