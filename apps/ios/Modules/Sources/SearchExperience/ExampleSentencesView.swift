import SwiftUI

struct ExampleSentencesView: View {
  @State private var examples = LoadedExamples()
  @State private var place = ExamplePlaceKeeper()
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @Environment(\.exampleRowsOnScreen) private var rowsOnScreen
  @Environment(ScreenReturns.self) private var returns: ScreenReturns?

  let query: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let usesHighlightedEntryExamples: Bool
  let exampleSentenceClient: ExampleSentenceClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let speechSynthesisClient: SpeechSynthesisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    ScrollViewReader { proxy in
      screen(proxy)
        .navigationTitle(query.value)
        .inlineNavigationTitle()
        .onChange(of: returns?.count) { comeBack(.closed, with: proxy) }
        .screenTask(id: query) {
          analysisAvailability = await japaneseTextAnalysisClient.availability()
          await examples.load(query.value, rowsOnScreen: rowsOnScreen, read: read)
        }
    }
  }

  @ViewBuilder
  private func screen(_ proxy: ScrollViewProxy) -> some View {
    Group {
      switch examples.state(of: query.value) {
      case .loading:
        ProgressView("Loading examples")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .accessibilityIdentifier("examples.loading")
      case .failed:
        List {
          UnreadExamplesRow(more: false) {
            await examples.load(query.value, rowsOnScreen: rowsOnScreen, read: read)
          }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("example-list.screen")
      case .empty, .listed:
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
              speak: { speechSynthesisClient.speak(example.sentence.japanese, .japanese) },
              openWord: { entry in
                place.leave(from: example.id)
                openWord(entry)
              }
            )
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
              if place.note(example.id, at: frame) { check(with: proxy) }
            }
          }
          if examples.hasMore {
            MoreExamplesRow { await examples.loadMore(read: read) }
              .id(examples.examples.count)
          } else if examples.laterReadFailed {
            UnreadExamplesRow(more: true) { await examples.readMoreAgain(read: read) }
          }
        }
        .listStyle(.plain)
        .scrollIndicators(.visible)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
          place.noteList(frame)
        }
        .onScrollPhaseChange { _, phase in
          if phase != .idle { place.userScrolled() }
        }
        .onAppear { comeBack(.appeared, with: proxy) }
        .accessibilityIdentifier("example-list.screen")
      }
    }
  }

  private func comeBack(_ way: ExamplePlaceKeeper.Return, with proxy: ScrollViewProxy) {
    if place.comeBack(way) { check(with: proxy) }
  }

  private func check(with proxy: ScrollViewProxy) {
    Task { @MainActor in
      await Task.yield()
      guard let correction = place.check() else { return }
      proxy.scrollTo(correction.row, anchor: correction.anchor)
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

struct UnreadExamplesRow: View {
  let more: Bool
  let readAgain: () async -> Void

  var body: some View {
    HStack {
      Text(more ? "More examples couldn’t be loaded." : "Examples couldn’t be loaded.")
        .foregroundStyle(.secondary)
        .accessibilityIdentifier(more ? "examples.more-failed" : "examples.failed")
      Spacer()
      Button("Retry") { Task { await readAgain() } }
        .buttonStyle(.borderless)
        .accessibilityIdentifier(more ? "examples.more-retry" : "examples.retry")
    }
  }
}

struct ExampleSentenceSections: View {
  let title: String
  let examples: LoadedExamples
  let source: String
  let emptyMessage: String
  let presentation: (Int) -> JapaneseExampleRowContent.Presentation
  let speechSynthesisClient: SpeechSynthesisClient
  let read: LoadedExamples.Read
  let readAgain: () async -> Void
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    switch examples.state(of: source) {
    case .loading:
      Section(title) {
        ProgressView("Loading examples")
          .accessibilityIdentifier("examples.loading")
      }
    case .failed:
      Section(title) { UnreadExamplesRow(more: false, readAgain: readAgain) }
    case .empty:
      Section(title) {
        Text(emptyMessage)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("examples.empty")
      }
    case .listed:
      ForEach(Array(examples.examples.enumerated()), id: \.element.id) { index, example in
        Section {
          JapaneseExampleRowContent(
            example: example,
            presentation: presentation(index),
            speak: { speechSynthesisClient.speak(example.sentence.japanese, .japanese) },
            openWord: openWord
          )
        } header: {
          if index == 0 { Text(title) }
        }
        .compactSectionSpacing()
      }
      if examples.hasMore {
        Section {
          MoreExamplesRow { await examples.loadMore(read: read) }
            .id(examples.examples.count)
        }
        .compactSectionSpacing()
      } else if examples.laterReadFailed {
        Section {
          UnreadExamplesRow(more: true) { await examples.readMoreAgain(read: read) }
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
    case meaning(number: Int)
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
      case .meaning(let number):
        Configuration(
          tokenPresentation: .standard,
          tokenIdentifierPrefix: "word-detail.meaning-example-token.\(number)",
          japaneseIdentifier: nil,
          wordSelector: nil,
          speakerLabel: "Speak the example of meaning \(number)",
          speakerIdentifier: "word-detail.meaning-example-speaker.\(number)",
          englishIdentifier: "word-detail.meaning-example-english.\(number)",
          rowIdentifier: "word-detail.meaning-example.\(number)",
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
