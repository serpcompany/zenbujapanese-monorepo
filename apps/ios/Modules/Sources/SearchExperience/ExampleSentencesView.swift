import SwiftUI

struct ExampleSentencesView: View {
  @State private var examples: [ExampleSentence] = []
  @State private var isLoading = true
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
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
        List {
          if analysisAvailability == .reduced {
            Label(
              "Japanese text analysis is unavailable. Reinstall or update Zenbu to restore word links.",
              systemImage: "info.circle"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("examples.reduced-analysis")
          }
          ForEach(examples.enumerated(), id: \.element.id) { index, example in
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
        .listStyle(.plain)
        .scrollIndicators(.visible)
        .accessibilityIdentifier("example-list.screen")
      }
    }
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
      analysisAvailability = await japaneseTextAnalysisClient.availability()
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
  let index: Int
  let example: ExampleSentence
  let highlightedQuery: String
  let highlightedEntry: DictionaryEntry?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let speak: () -> Void
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    JapaneseExampleRowContent(
      example: example,
      highlightedQuery: SearchQuery(highlightedQuery),
      highlightedEntry: highlightedEntry,
      japaneseTextAnalysisClient: japaneseTextAnalysisClient,
      presentation: .dedicated(index: index),
      speak: speak,
      openWord: openWord
    )
  }
}

/// The shared learner-visible geometry for Japanese/translation rows with a speech action.
/// Token target policy remains a consumer choice because dedicated inline links and Word Detail
/// have different, evidence-backed hit-region contracts.
struct JapaneseExampleRowContent: View {
  enum Presentation {
    case dedicated(index: Int)
    case wordDetail(index: Int)

    struct Configuration {
      let tokenPresentation: LinkedJapaneseText.Presentation
      let tokenIdentifierPrefix: String
      let speakerLabel: String
      let speakerIdentifier: String
      let englishIdentifier: String
      let rowIdentifier: String
      let combinesRowAccessibility: Bool
      let highlightsCurrentEntry: Bool
    }

    var configuration: Configuration {
      switch self {
      case .dedicated(let index):
        Configuration(
          tokenPresentation: .compactNaturalFlow,
          tokenIdentifierPrefix: "example.token.\(index)",
          speakerLabel: "Speak example \(index + 1)",
          speakerIdentifier: "example.speaker.\(index)",
          englishIdentifier: "example.english.\(index)",
          rowIdentifier: "example.row.\(index)",
          combinesRowAccessibility: false,
          highlightsCurrentEntry: false
        )
      case .wordDetail(let index):
        Configuration(
          tokenPresentation: .standard,
          tokenIdentifierPrefix: "word-detail.example-token.\(index)",
          speakerLabel: "Speak Word Detail example \(index + 1)",
          speakerIdentifier: "word-detail.example-speaker.\(index)",
          englishIdentifier: "word-detail.example-english.\(index)",
          rowIdentifier: "word-detail.example.\(index)",
          combinesRowAccessibility: true,
          highlightsCurrentEntry: true
        )
      }
    }
  }

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .body) private var contentSpacing: CGFloat = 8

  let example: ExampleSentence
  let highlightedQuery: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let presentation: Presentation
  let speak: () -> Void
  let openWord: (DictionaryEntry) -> Void

  @ViewBuilder
  var body: some View {
    if configuration.combinesRowAccessibility {
      content
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(example.japanese), \(example.english)")
        .accessibilityIdentifier(configuration.rowIdentifier)
    } else {
      content
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(configuration.rowIdentifier)
    }
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: contentSpacing) {
      if dynamicTypeSize.isAccessibilitySize {
        VStack(alignment: .leading, spacing: contentSpacing) {
          japanese
          HStack {
            Spacer()
            speaker
          }
        }
      } else {
        HStack(alignment: .center, spacing: 10) {
          japanese
          speaker
        }
      }

      Text(example.english)
        .font(.body)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(configuration.combinesRowAccessibility)
        .accessibilityIdentifier(configuration.englishIdentifier)
    }
  }

  private var japanese: some View {
    LinkedJapaneseText(
      text: example.japanese,
      highlightedQuery: highlightedQuery,
      highlightedEntry: highlightedEntry,
      japaneseTextAnalysisClient: japaneseTextAnalysisClient,
      identifierPrefix: configuration.tokenIdentifierPrefix,
      presentation: configuration.tokenPresentation,
      highlightsCurrentEntry: configuration.highlightsCurrentEntry,
      openWord: openWord
    )
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var speaker: some View {
    Button(action: speak) {
      Image(systemName: "speaker.wave.2")
        .font(.headline)
        .frame(minWidth: 48, minHeight: 48)
        .contentShape(Rectangle())
    }
    .contentShape(Rectangle())
    .accessibilityLabel(configuration.speakerLabel)
    .accessibilityIdentifier(configuration.speakerIdentifier)
  }

  private var configuration: Presentation.Configuration { presentation.configuration }
}
