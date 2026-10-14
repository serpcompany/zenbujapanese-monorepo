import SwiftUI

struct ExampleSentencesView: View {
  @State private var examples = LoadedExamples()
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @Environment(\.exampleRowsOnScreen) private var rowsOnScreen

  let query: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let usesHighlightedEntryExamples: Bool
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let speechSynthesisClient: SpeechSynthesisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    Group {
      if !examples.answers(query.value) {
        ProgressView("Loading examples")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        List {
          if let countText = examples.countText {
            Text(countText)
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .listRowSeparator(.hidden)
              .accessibilityIdentifier("example-list.count")
          }
          if analysisAvailability == .reduced {
            Label(
              "Japanese text analysis is unavailable. Reinstall or update Zenbu to restore word links.",
              systemImage: "info.circle"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("examples.reduced-analysis")
          }
          ForEach(examples.examples.enumerated(), id: \.element.id) { index, example in
            JapaneseExampleRowContent(
              example: example,
              presentation: .dedicated(index: index),
              speak: { speechSynthesisClient.speak(example.sentence.japanese) },
              openWord: openWord
            )
          }
          if examples.hasMore {
            MoreExamplesRow { await examples.loadMore(read: read) }
              .id(examples.examples.count)
          }
        }
        .listStyle(.plain)
        .scrollIndicators(.visible)
        .accessibilityIdentifier("example-list.screen")
      }
    }
    .navigationTitle(query.value)
    .inlineNavigationTitle()
    .screenTask(id: query) {
      analysisAvailability = await japaneseTextAnalysisClient.availability()
      await examples.load(query.value, rowsOnScreen: rowsOnScreen, read: read)
    }
  }

  private func read(_ batch: ExampleBatch) async -> ExamplePage? {
    await exampleSentenceClient.listed(query, highlightedEntry, usesHighlightedEntryExamples, batch)
  }
}

struct MoreExamplesRow: View {
  let load: () async -> Void

  var body: some View {
    ProgressView()
      .frame(maxWidth: .infinity)
      .task { await load() }
      .accessibilityIdentifier("examples.more")
  }
}

struct ExampleSentenceSections: View {
  let title: String
  let examples: [LinkedExample]
  let isLoading: Bool
  let emptyMessage: String
  let hasMore: Bool
  let presentation: (Int) -> JapaneseExampleRowContent.Presentation
  let speechSynthesisClient: SpeechSynthesisClient
  let loadMore: () async -> Void
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
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
            presentation: presentation(index),
            speak: { speechSynthesisClient.speak(example.sentence.japanese) },
            openWord: openWord
          )
        } header: {
          if index == 0 { Text(title) }
        }
        .compactSectionSpacing()
      }
      if hasMore {
        Section {
          MoreExamplesRow(load: loadMore)
            .id(examples.count)
        }
        .compactSectionSpacing()
      }
    }
  }
}

struct JapaneseExampleRowContent: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  enum Presentation {
    case dedicated(index: Int)
    case wordDetail(index: Int)
    case conjugatedForm(String, index: Int)

    struct WordSelectorConfiguration {
      let label: String
      let identifier: String
    }

    struct Configuration {
      let tokenPresentation: LinkedJapaneseWords.Presentation
      let tokenIdentifierPrefix: String
      let japaneseIdentifier: String?
      let wordSelector: WordSelectorConfiguration?
      let speakerLabel: String
      let speakerIdentifier: String
      let englishIdentifier: String
      let rowIdentifier: String
      let combinesRowAccessibility: Bool
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
          combinesRowAccessibility: false
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
          combinesRowAccessibility: true
        )
      case .conjugatedForm(let kind, let index):
        Configuration(
          tokenPresentation: .standard,
          tokenIdentifierPrefix: "conjugations.example-token.\(kind).\(index)",
          japaneseIdentifier: nil,
          wordSelector: nil,
          speakerLabel: "Speak example \(index + 1)",
          speakerIdentifier: "conjugations.example-speaker.\(kind).\(index)",
          englishIdentifier: "conjugations.example-english.\(kind).\(index)",
          rowIdentifier: "conjugations.example.\(kind).\(index)",
          combinesRowAccessibility: true
        )
      }
    }
  }

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .body) private var contentSpacing: CGFloat = 8

  let example: LinkedExample
  let presentation: Presentation
  let speak: () -> Void
  let openWord: (DictionaryEntry) -> Void

  @ViewBuilder
  var body: some View {
    if configuration.combinesRowAccessibility {
      content
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(example.sentence.japanese), \(example.sentence.english)")
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
        Text(example.sentence.english)
          .font(.body)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityHidden(configuration.combinesRowAccessibility)
          .accessibilityIdentifier(configuration.englishIdentifier)
      }
    }
  }

  private var japanese: some View {
    LinkedJapaneseWords(
      text: example.sentence.japanese,
      tokens: example.words,
      isAnalyzed: true,
      identifierPrefix: configuration.tokenIdentifierPrefix,
      presentation: configuration.tokenPresentation,
      japaneseIdentifier: configuration.japaneseIdentifier,
      openCandidates: nil,
      openWord: openWord
    )
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var speaker: some View {
    Button(action: speak) {
      Image(systemName: "speaker.wave.2")
        .font(.headline)
        .frame(minWidth: Self.controlSide, minHeight: Self.controlSide)
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
          .frame(minWidth: Self.controlSide)
          .frame(minHeight: Self.controlSide)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(configuration.label)
      .accessibilityHint("Shows the dictionary words in sentence order")
      .accessibilityIdentifier(configuration.identifier)
    }
  }

  private var wordSelectionTokens: [JapaneseTextToken] {
    example.words.filter { $0.entry != nil || !$0.candidateEntries.isEmpty }
  }

  private var hasWordSelection: Bool { !wordSelectionTokens.isEmpty }

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
