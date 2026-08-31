import SwiftUI

struct ExampleSentencesView: View {
  @State private var examples: [ExampleSentence] = []
  @State private var isLoading = true
  @State private var lastSpeechRequest: String?

  let query: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let usesHighlightedEntryExamples: Bool
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let speechSynthesisClient: SpeechSynthesisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    Group {
      if isLoading {
        ProgressView("Loading examples")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ScrollView {
          LazyVStack(spacing: 0) {
            ForEach(Array(examples.enumerated()), id: \.element.id) { index, example in
              ExampleSentenceRow(
                index: index,
                example: example,
                highlightedQuery: query.value,
                highlightedEntry: highlightedEntry,
                japaneseTextAnalysisClient: japaneseTextAnalysisClient,
                speak: { speechSynthesisClient.speak(example.japanese) },
                openWord: openWord
              )
            }
          }
        }
        .scrollIndicators(.visible)
        .accessibilityIdentifier("example-list.screen")
      }
    }
    .background(ZenbuTheme.background)
    .navigationTitle(query.value)
    .navigationBarTitleDisplayMode(.inline)
    .overlay(alignment: .topLeading) {
      if let lastSpeechRequest {
        Color.clear
          .frame(width: 1, height: 1)
          .accessibilityElement()
          .accessibilityLabel("Speech requested \(lastSpeechRequest)")
          .accessibilityIdentifier("speech.request")
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .speechSynthesisRequested)) {
      notification in
      lastSpeechRequest = notification.object as? String
    }
    .task(id: query) {
      isLoading = true
      let loadedExamples: [ExampleSentence]
      if usesHighlightedEntryExamples, let highlightedEntry {
        loadedExamples = (try? await exampleSentenceClient.examples(highlightedEntry)) ?? []
      } else {
        loadedExamples = (try? await exampleSentenceClient.search(query)) ?? []
      }
      examples = accessibilityFixtureExamples(from: loadedExamples)
      isLoading = false
    }
  }

  private func accessibilityFixtureExamples(
    from loadedExamples: [ExampleSentence]
  ) -> [ExampleSentence] {
    #if DEBUG
      let arguments = ProcessInfo.processInfo.arguments
      guard
        let marker = arguments.firstIndex(of: "-ExampleSentenceAccessibilityFixtureLimit"),
        arguments.indices.contains(marker + 1),
        let limit = Int(arguments[marker + 1]),
        limit >= 0
      else { return loadedExamples }
      return Array(loadedExamples.prefix(limit))
    #else
      return loadedExamples
    #endif
  }
}

private struct ExampleSentenceRow: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let index: Int
  let example: ExampleSentence
  let highlightedQuery: String
  let highlightedEntry: DictionaryEntry?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let speak: () -> Void
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      let headerLayout =
        dynamicTypeSize.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
        : AnyLayout(HStackLayout(alignment: .center, spacing: 10))
      headerLayout {
        Group {
          LinkedJapaneseText(
            text: example.japanese,
            highlightedQuery: SearchQuery(highlightedQuery),
            highlightedEntry: highlightedEntry,
            japaneseTextAnalysisClient: japaneseTextAnalysisClient,
            identifierPrefix: "example.token.\(index)",
            openWord: openWord
          )
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        Button(action: speak) {
          Image(systemName: "speaker.wave.2")
            .font(.headline)
            .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel("Speak example \(index + 1)")
        .accessibilityIdentifier("example.speaker.\(index)")
      }

      Text(example.english)
        .font(.body)
        .foregroundStyle(ZenbuTheme.secondaryText)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
    .overlay(alignment: .bottom) {
      Rectangle().fill(ZenbuTheme.divider).frame(height: 0.5)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("example.row.\(index)")
  }
}
