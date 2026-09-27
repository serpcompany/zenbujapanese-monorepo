import SwiftUI

struct ConjugationsView: View {
  @State private var mode = ConjugationMode.plain

  let entry: DictionaryEntry
  let table: ConjugationTable
  let speechSynthesisClient: SpeechSynthesisClient

  var body: some View {
    List {
      Section {
        ConjugationHeader(entry: entry, rule: table.rule) {
          speechSynthesisClient.speak(entry.reading)
        }
      }

      if table.supportsModes {
        Section {
          Picker("Conjugation mode", selection: $mode) {
            ForEach(ConjugationMode.allCases, id: \.self) { option in
              Text(option.rawValue)
                .tag(option)
                .accessibilityIdentifier("conjugations.mode.\(option.rawValue.lowercased())")
            }
          }
          .pickerStyle(.segmented)
          .accessibilityIdentifier("conjugations.mode")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
      }

      Section {
        ForEach(table.forms(for: mode)) { form in
          NavigationLink(
            value: SearchExperienceRoute.conjugatedForm(entry, table, form, mode)
          ) {
            ConjugationRow(form: form)
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .listSectionSpacing(.compact)
    .accessibilityIdentifier("conjugations.screen")
    .navigationTitle("Conjugations")
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct ConjugationHeader: View {
  let entry: DictionaryEntry
  let rule: String
  let pronounce: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      WordHeadline(
        surface: entry.headword,
        reading: entry.reading,
        pitch: entry.pitchAccent,
        identifierPrefix: "conjugations.header",
        pronounce: pronounce
      )
      Text(entry.summary)
        .foregroundStyle(.secondary)
      if !entry.displayPartOfSpeech.isEmpty {
        Text(entry.displayPartOfSpeech)
          .font(.subheadline)
      }
      Text(rule)
        .font(.footnote)
        .foregroundStyle(.tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("conjugations.header")
  }
}

private struct ConjugationRow: View {
  let form: ConjugatedForm

  var body: some View {
    let title = form.id.presentation.title
    HStack(spacing: 12) {
      Text(title)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("conjugations.title.\(form.id.rawValue)")
      Spacer(minLength: 8)
      ConjugatedSurface(form: form, font: .title3, rubyFont: .caption2)
        .multilineTextAlignment(.trailing)
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(title), \(form.surface)")
    .accessibilityValue(form.reading)
    .accessibilityHint("Explains this form")
    .accessibilityIdentifier("conjugations.row.\(form.id.rawValue)")
  }
}

/// One conjugated form: what it means, the form itself, and the Example Sentences that use it.
struct ConjugatedFormView: View {
  @State private var examples: [ExampleSentence] = []
  @State private var isLoadingExamples = true

  let entry: DictionaryEntry
  let table: ConjugationTable
  let form: ConjugatedForm
  let mode: ConjugationMode
  let exampleSentenceClient: ExampleSentenceClient
  let speechSynthesisClient: SpeechSynthesisClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    let presentation = form.id.presentation
    List {
      // What the form means is the reason to open this screen, so it leads.
      Section {
        VStack(alignment: .leading, spacing: 10) {
          Text(presentation.explanation)
            .font(.title3)
            .accessibilityIdentifier("conjugations.explanation.\(form.id.rawValue)")
          if !sharedSpellings.isEmpty {
            Label(
              "Same spelling as \(sharedSpellings.formatted(.list(type: .and))). Context tells them apart.",
              systemImage: "equal.circle"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
        }
        .padding(.vertical, 4)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
      }

      Section {
        WordHeadline(
          surface: form.surface,
          reading: form.reading,
          highlightedEnding: form.ending,
          identifierPrefix: "conjugations.form",
          pronounce: { speechSynthesisClient.speak(form.reading) }
        )
      }

      Section("Examples") {
        ExampleSentenceRows(
          examples: examples,
          isLoading: isLoadingExamples,
          emptyMessage: "No example sentences use this form yet.",
          highlightedQuery: SearchQuery(form.surface),
          highlightedEntry: nil,
          presentation: { .conjugatedForm(form.id, index: $0) },
          speechSynthesisClient: speechSynthesisClient,
          japaneseTextAnalysisClient: japaneseTextAnalysisClient,
          openWord: openWord
        )
      }
    }
    .listSectionSpacing(.compact)
    .navigationTitle(presentation.title)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("conjugations.form.\(form.id.rawValue)")
    .task(id: form) {
      examples = await loadExamples()
      isLoadingExamples = false
    }
  }

  /// Other forms with the same spelling, such as potential and passive 見られる.
  private var sharedSpellings: [String] {
    table.forms(for: mode)
      .filter { $0.id != form.id && $0.surface == form.surface }
      .map(\.id.presentation.title)
  }

  /// Every retrieved Example Sentence in which the parser reads this exact form as one word,
  /// in retrieval order. Word boundaries come from the same inflection grouping linked text
  /// uses, so 見たかった (wanted to see) and 見た目 (appearance) are not examples of past 見た.
  private func loadExamples() async -> [ExampleSentence] {
    let sentences = (try? await exampleSentenceClient.search(SearchQuery(form.surface))) ?? []
    var examples: [ExampleSentence] = []
    for sentence in sentences where sentence.japanese.contains(form.surface) {
      if await japaneseTextAnalysisClient.words(sentence.japanese).contains(form.surface) {
        examples.append(sentence)
      }
    }
    return examples
  }
}

private struct ConjugationKindPresentation: Identifiable {
  let id: ConjugatedForm.Kind
  let title: String
  let explanation: String
}

extension ConjugatedForm.Kind {
  fileprivate var presentation: ConjugationKindPresentation {
    switch self {
    case .presentFuture:
      ConjugationKindPresentation(
        id: self,
        title: "Present/Future",
        explanation:
          "The non-past form. It can describe a present habit or fact, or a future action or state."
      )
    case .past:
      ConjugationKindPresentation(
        id: self,
        title: "Past",
        explanation: "Describes an action or state in the past."
      )
    case .negative:
      ConjugationKindPresentation(
        id: self,
        title: "Negative",
        explanation: "Says that an action does not happen, or a state is not true."
      )
    case .pastNegative:
      ConjugationKindPresentation(
        id: self,
        title: "Past Negative",
        explanation: "Says that an action did not happen, or a state was not true."
      )
    case .teForm:
      ConjugationKindPresentation(
        id: self,
        title: "Te-Form",
        explanation:
          "A connecting form. It can link actions or descriptions and, depending on context, show sequence, cause, or reason."
      )
    case .potential:
      ConjugationKindPresentation(
        id: self,
        title: "Potential",
        explanation:
          "Expresses ability or possibility: that someone can do the action or that the action is possible."
      )
    case .passive:
      ConjugationKindPresentation(
        id: self,
        title: "Passive",
        explanation:
          "Presents the person, thing, or event affected by an action as the focus. The exact meaning depends on context."
      )
    case .causative:
      ConjugationKindPresentation(
        id: self,
        title: "Causative",
        explanation:
          "Expresses causing or allowing another person or thing to perform an action or enter a state."
      )
    case .conditional:
      ConjugationKindPresentation(
        id: self,
        title: "Conditional",
        explanation:
          "Sets a condition for what follows: if this happens, the next statement can apply."
      )
    case .volitional:
      ConjugationKindPresentation(
        id: self,
        title: "Volitional",
        explanation:
          "Expresses will or intention. In context, it can also propose doing something together."
      )
    case .imperative:
      ConjugationKindPresentation(
        id: self,
        title: "Imperative",
        explanation:
          "Gives a strong command or instruction. It can sound forceful, so context matters."
      )
    case .standalone:
      ConjugationKindPresentation(
        id: self,
        title: "Standalone",
        explanation:
          "The adjective's base form, shown on its own rather than attached to a noun or verb."
      )
    case .modifyingANoun:
      ConjugationKindPresentation(
        id: self,
        title: "Modifying a Noun",
        explanation: "Places the adjective before a noun to describe that noun."
      )
    case .adverb:
      ConjugationKindPresentation(
        id: self,
        title: "Adverb",
        explanation: "Places the adjective form before a verb to describe how an action is done."
      )
    case .noun:
      ConjugationKindPresentation(
        id: self,
        title: "Noun",
        explanation: "Turns the adjective into a noun that names the quality or its degree."
      )
    }
  }
}

private struct ConjugatedSurface: View {
  let form: ConjugatedForm
  let font: Font
  let rubyFont: Font

  var body: some View {
    // The stem reading is already in the header, so rows show furigana only when the
    // ending itself contains kanji, as in 来させる, whose reading changes.
    if form.ending.contains(where: \.isKanji) {
      JapaneseRubyText(
        surface: form.surface,
        reading: form.reading,
        baseFont: font,
        rubyFont: rubyFont,
        highlightedEnding: form.ending,
        exposesAccessibility: false
      )
      .fixedSize(horizontal: false, vertical: true)
    } else {
      Text(form.surface.highlightingEnding(form.ending))
        .font(font)
    }
  }
}

extension Character {
  fileprivate var isKanji: Bool {
    unicodeScalars.contains { (0x4E00...0x9FFF).contains($0.value) || $0 == "々" }
  }
}
