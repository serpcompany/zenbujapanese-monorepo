import SwiftUI

struct ExampleSentencesView: View {
  @Environment(\.dismiss) private var dismiss
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
    VStack(spacing: 0) {
      ExampleListToolbar(title: query.value, back: { dismiss() })

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
          .padding(.bottom, LookupLayout.bottomNavigationContentClearance)
        }
        .scrollIndicators(.visible)
        .accessibilityIdentifier("example-list.screen")
      }
    }
    .background(ZenbuTheme.background)
    .toolbar(.hidden, for: .navigationBar)
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
      if usesHighlightedEntryExamples, let highlightedEntry {
        examples = (try? await exampleSentenceClient.examples(highlightedEntry)) ?? []
      } else {
        examples = (try? await exampleSentenceClient.search(query)) ?? []
      }
      isLoading = false
    }
  }
}

private struct ExampleListToolbar: View {
  let title: String
  let back: () -> Void

  var body: some View {
    ZStack {
      Text(title)
        .font(.headline)
        .lineLimit(1)

      HStack {
        Button(action: back) {
          Label("Search", systemImage: "chevron.left")
        }
        .accessibilityIdentifier("example-list.back")
        Spacer()
      }
    }
    .padding(.horizontal, 12)
    .frame(height: 44)
    .background(ZenbuTheme.chrome)
  }
}

private struct ExampleSentenceRow: View {
  let index: Int
  let example: ExampleSentence
  let highlightedQuery: String
  let highlightedEntry: DictionaryEntry?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let speak: () -> Void
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .center, spacing: 10) {
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
            .font(.system(size: 18))
            .frame(width: 34, height: 34)
        }
        .accessibilityLabel("Speak example \(index + 1)")
        .accessibilityIdentifier("example.speaker.\(index)")
      }

      Text(example.english)
        .font(.system(size: 16))
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
