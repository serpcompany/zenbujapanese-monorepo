import SwiftUI

struct ExampleSentencesView: View {
  @State private var examples: [ExampleSentence] = []
  @State private var isLoading = true
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full

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
    .task(id: query) {
      isLoading = true
      analysisAvailability = await japaneseTextAnalysisClient.availability()
      let loadedExamples: [ExampleSentence]
      if usesHighlightedEntryExamples, let highlightedEntry {
        loadedExamples = (try? await exampleSentenceClient.examples(highlightedEntry)) ?? []
      } else {
        loadedExamples = (try? await exampleSentenceClient.search(query)) ?? []
      }
      examples = loadedExamples
      isLoading = false
    }
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

/// Example Sentences as list sections, one card per sentence, with loading and empty states.
/// Word Detail and the conjugated form screen share it, so examples look and behave the same
/// wherever they appear. Place it directly in a `List`, not inside a `Section`.
struct ExampleSentenceSections: View {
  let title: String
  let examples: [ExampleSentence]
  let isLoading: Bool
  let emptyMessage: String
  let highlightedQuery: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let presentation: (Int) -> JapaneseExampleRowContent.Presentation
  let speechSynthesisClient: SpeechSynthesisClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    // Keep loaded rows during refresh so a native Back transition does not collapse the
    // List and discard its scroll position.
    if isLoading && examples.isEmpty {
      Section(title) { ProgressView("Loading examples") }
    } else if examples.isEmpty {
      Section(title) {
        Text(emptyMessage)
          .foregroundStyle(.secondary)
      }
    } else {
      ForEach(Array(examples.enumerated()), id: \.element.id) { index, example in
        Section {
          JapaneseExampleRowContent(
            example: example,
            highlightedQuery: highlightedQuery,
            highlightedEntry: highlightedEntry,
            japaneseTextAnalysisClient: japaneseTextAnalysisClient,
            presentation: presentation(index),
            speak: { speechSynthesisClient.speak(example.japanese) },
            openWord: openWord
          )
        } header: {
          // Only the first card carries the heading; the rest follow as their own cards.
          if index == 0 { Text(title) }
        }
        // Consecutive examples belong together, so they use the system's compact spacing
        // rather than the default gap between unrelated sections.
        .listSectionSpacing(.compact)
      }
    }
  }
}

/// The shared learner-visible geometry for Japanese/translation rows with a speech action.
/// Dedicated Examples expose one native word-selection menu, while Word Detail retains its
/// evidence-backed inline current-word treatment.
struct JapaneseExampleRowContent: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  enum Presentation {
    case dedicated(index: Int)
    case wordDetail(index: Int)
    /// An example on a conjugated form's screen, highlighting that form.
    case conjugatedForm(ConjugatedForm.Kind, index: Int)

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
      let highlightsQuery: Bool
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
          highlightsCurrentEntry: false,
          highlightsQuery: true
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
          highlightsCurrentEntry: true,
          highlightsQuery: false
        )
      case .conjugatedForm(let kind, let index):
        Configuration(
          tokenPresentation: .standard,
          tokenIdentifierPrefix: "conjugations.example-token.\(kind.rawValue).\(index)",
          japaneseIdentifier: nil,
          wordSelector: nil,
          speakerLabel: "Speak example \(index + 1)",
          speakerIdentifier: "conjugations.example-speaker.\(kind.rawValue).\(index)",
          englishIdentifier: "conjugations.example-english.\(kind.rawValue).\(index)",
          rowIdentifier: "conjugations.example.\(kind.rawValue).\(index)",
          combinesRowAccessibility: true,
          highlightsCurrentEntry: false,
          highlightsQuery: true
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

      if readingAidPreferences.showsTranslations {
        Text(example.english)
          .font(.body)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityHidden(configuration.combinesRowAccessibility)
          .accessibilityIdentifier(configuration.englishIdentifier)
      }
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
      highlightsQuery: configuration.highlightsQuery,
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
