import SwiftUI

struct ExampleSentencesView: View {
  @State private var examples: [ExampleSentence] = []
  @State private var isLoading = true
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @State private var lastSpeechRequest: String?
  #if DEBUG
    @State private var analysisRequestCount = 0
  #endif

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
      #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-RecordJapaneseAnalysisRequests") {
          Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityLabel("Japanese analysis requests \(analysisRequestCount)")
            .accessibilityIdentifier("examples.analysis-request-count")
        }
      #endif
    }
    .onReceive(NotificationCenter.default.publisher(for: .speechSynthesisRequested)) {
      notification in
      lastSpeechRequest = notification.object as? String
    }
    #if DEBUG
      .onReceive(NotificationCenter.default.publisher(for: .linkedJapaneseTextAnalysisRequested)) {
        notification in
        guard ProcessInfo.processInfo.arguments.contains("-RecordJapaneseAnalysisRequests"),
          (notification.object as? String)?.hasPrefix("example.token.") == true
        else { return }
        analysisRequestCount += 1
      }
    #endif
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
/// Dedicated Examples expose one native word-selection menu, while Word Detail retains its
/// evidence-backed inline current-word treatment.
struct JapaneseExampleRowContent: View {
  enum Presentation {
    case dedicated(index: Int)
    case wordDetail(index: Int)

    struct WordSelectorConfiguration {
      let label: String
      let identifier: String
    }

    struct Configuration {
      let tokenPresentation: LinkedJapaneseText.Presentation
      let tokenIdentifierPrefix: String
      let japaneseIdentifier: String?
      let wordSelector: WordSelectorConfiguration?
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
          japaneseIdentifier: "example.japanese.\(index)",
          wordSelector: WordSelectorConfiguration(
            label: "Choose a word from example \(index + 1)",
            identifier: "example.words.\(index)"
          ),
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
          japaneseIdentifier: nil,
          wordSelector: nil,
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
  @State private var wordSelectionTokens: [JapaneseTextToken] = []

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
      if configuration.wordSelector != nil {
        if dynamicTypeSize.isAccessibilitySize {
          VStack(alignment: .leading, spacing: contentSpacing) {
            japanese
            HStack(spacing: contentSpacing) {
              Spacer()
              if hasWordSelection {
                wordSelector
              }
              speaker
            }
          }
        } else {
          HStack(alignment: .center, spacing: contentSpacing) {
            japanese
            if hasWordSelection {
              wordSelector
            }
            speaker
          }
        }
      } else if dynamicTypeSize.isAccessibilitySize {
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
      japaneseIdentifier: configuration.japaneseIdentifier,
      highlightsCurrentEntry: configuration.highlightsCurrentEntry,
      tokensChanged: updateWordSelectionTokens,
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

  @ViewBuilder
  private var wordSelector: some View {
    if let configuration = configuration.wordSelector {
      Menu {
        wordSelectionActions(configuration: configuration)
      } label: {
        Text("Words")
          .font(.headline)
          .frame(minWidth: 48)
          .frame(minHeight: 48)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(configuration.label)
      .accessibilityHint("Shows the dictionary words in sentence order")
      .accessibilityIdentifier(configuration.identifier)
    }
  }

  private var hasWordSelection: Bool { !wordSelectionTokens.isEmpty }

  private func updateWordSelectionTokens(_ tokens: [JapaneseTextToken]) {
    let selectable = tokens.filter { $0.entry != nil || !$0.candidateEntries.isEmpty }
    guard selectable.map(\.id) != wordSelectionTokens.map(\.id) else { return }
    wordSelectionTokens = selectable
  }

  @ViewBuilder
  private func wordSelectionActions(
    configuration: Presentation.WordSelectorConfiguration
  ) -> some View {
    ForEach(wordSelectionTokens) { token in
      if let entry = token.entry {
        wordSelectionAction(token: token, entry: entry, identifierPrefix: configuration.identifier)
      } else if !token.candidateEntries.isEmpty {
        Section("\(token.surface), \(token.candidateEntries.count) possible entries") {
          ForEach(token.candidateEntries) { candidate in
            wordSelectionAction(
              token: token,
              entry: candidate,
              identifierPrefix: configuration.identifier
            )
          }
        }
      }
    }
  }

  private func wordSelectionAction(
    token: JapaneseTextToken,
    entry: DictionaryEntry,
    identifierPrefix: String
  ) -> some View {
    Button {
      openWord(entry)
    } label: {
      Text("\(token.surface) (\(entry.reading)) — \(entry.summary)")
    }
    .accessibilityIdentifier("\(identifierPrefix).\(token.id).\(entry.id.rawValue)")
  }

  private var configuration: Presentation.Configuration { presentation.configuration }
}
