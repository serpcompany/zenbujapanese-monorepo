import SwiftUI

struct ConjugationsView: View {
  @State private var mode = ConjugationMode.plain
  @State private var selectedForm: ConjugatedForm?

  let entry: DictionaryEntry
  let table: ConjugationTable
  let exampleSentenceClient: ExampleSentenceClient
  let speechSynthesisClient: SpeechSynthesisClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    List {
      Section {
        ConjugationHeader(entry: entry, rule: table.rule)
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
          Button {
            selectedForm = form
          } label: {
            ConjugationRow(form: form)
          }
          .foregroundStyle(.primary)
        }
      }
    }
    .listStyle(.insetGrouped)
    .listSectionSpacing(.compact)
    .accessibilityIdentifier("conjugations.screen")
    .navigationTitle("Conjugations")
    .navigationBarTitleDisplayMode(.inline)
    .sheet(item: $selectedForm) { form in
      ConjugatedFormSheet(
        entry: entry,
        form: form,
        counterpart: counterpart(of: form),
        sharedSpellings: table.forms(for: mode)
          .filter { $0.id != form.id && $0.surface == form.surface }
          .map(\.id.presentation.title),
        exampleSentenceClient: exampleSentenceClient,
        speechSynthesisClient: speechSynthesisClient,
        japaneseTextAnalysisClient: japaneseTextAnalysisClient,
        openWord: { word in
          selectedForm = nil
          openWord(word)
        }
      )
    }
  }

  /// The same form in the other register, when it is spelled differently.
  private func counterpart(of form: ConjugatedForm) -> (mode: ConjugationMode, form: ConjugatedForm)? {
    guard table.supportsModes else { return nil }
    let other: ConjugationMode = mode == .plain ? .polite : .plain
    guard let match = table.forms(for: other).first(where: { $0.id == form.id }),
      match.surface != form.surface
    else { return nil }
    return (other, match)
  }
}

private struct ConjugationHeader: View {
  let entry: DictionaryEntry
  let rule: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      JapaneseRubyText(
        surface: entry.headword,
        reading: entry.reading,
        baseFont: .largeTitle,
        rubyFont: .subheadline
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
    .accessibilityElement(children: .combine)
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
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.tertiary)
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(title), \(form.surface)")
    .accessibilityValue(form.reading)
    .accessibilityHint("Explains this form")
    .accessibilityIdentifier("conjugations.row.\(form.id.rawValue)")
  }
}

struct ConjugatedFormSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var example: ExampleSentence?
  @State private var isLoadingExample = true

  let entry: DictionaryEntry
  let form: ConjugatedForm
  let counterpart: (mode: ConjugationMode, form: ConjugatedForm)?
  /// Other forms with the same spelling, such as potential and passive 見られる.
  let sharedSpellings: [String]
  let exampleSentenceClient: ExampleSentenceClient
  let speechSynthesisClient: SpeechSynthesisClient
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    let presentation = form.id.presentation
    NavigationStack {
      List {
        Section {
          VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .lastTextBaseline, spacing: 12) {
              ConjugatedSurface(form: form, font: .largeTitle, rubyFont: .subheadline, alwaysShowsReading: true)
              Button {
                speechSynthesisClient.speak(form.reading)
              } label: {
                Image(systemName: "speaker.wave.2.fill")
              }
              .buttonStyle(.borderless)
              .accessibilityLabel("Pronounce \(form.surface)")
              .accessibilityIdentifier("conjugations.sheet.pronounce")
            }
            Text(presentation.explanation)
              .foregroundStyle(.secondary)
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
        }

        if !form.stem.isEmpty, !form.ending.isEmpty {
          Section("How it's built") {
            Text("\(entry.headword) → \(form.stem) + \(form.ending)")
              .font(.title3)
          }
        }

        if let counterpart {
          Section(counterpart.mode.rawValue) {
            ConjugatedSurface(form: counterpart.form, font: .title3, rubyFont: .caption2)
          }
        }

        if isLoadingExample {
          Section("Example") { ProgressView() }
        } else if let example {
          Section("Example") {
            JapaneseExampleRowContent(
              example: example,
              highlightedQuery: SearchQuery(form.surface),
              highlightedEntry: nil,
              japaneseTextAnalysisClient: japaneseTextAnalysisClient,
              presentation: .conjugatedForm(form.id),
              speak: { speechSynthesisClient.speak(example.japanese) },
              openWord: openWord
            )
          }
        }
      }
      .listSectionSpacing(.compact)
      .navigationTitle(presentation.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
            .accessibilityIdentifier("conjugations.explanation.done")
        }
      }
    }
    .presentationDetents([.fraction(0.7), .large])
    .presentationDragIndicator(.visible)
    .task(id: form) {
      example = await loadExample()
      isLoadingExample = false
    }
  }

  /// A short sentence that contains this exact form, preferring one with some context over a
  /// bare exclamation such as 見て！. Nothing when the corpus has none.
  private func loadExample() async -> ExampleSentence? {
    let sentences = (try? await exampleSentenceClient.search(SearchQuery(form.surface))) ?? []
    let matches = sentences.filter { Self.containsCompleteForm(form.surface, in: $0.japanese) }
    let minimumLength = form.surface.count + 5
    return matches.filter { $0.japanese.count >= minimumLength }
      .min { $0.japanese.count < $1.japanese.count }
      ?? matches.min { $0.japanese.count < $1.japanese.count }
  }

  /// Whether `sentence` uses `surface` as a whole form, not inside a longer one: 見たら is a
  /// conditional, not the past 見た, and 花見た is a different word.
  static func containsCompleteForm(_ surface: String, in sentence: String) -> Bool {
    var searchStart = sentence.startIndex
    while let range = sentence.range(of: surface, range: searchStart..<sentence.endIndex) {
      let previous = range.lowerBound > sentence.startIndex
        ? sentence[sentence.index(before: range.lowerBound)] : nil
      let next = range.upperBound < sentence.endIndex ? sentence[range.upperBound] : nil
      // A kanji form may follow a particle such as を; a kana form needs a clear break.
      let startsCleanly: Bool =
        switch previous {
        case nil: true
        case let character? where character.isKanji: false
        case let character? where character.isHiragana: !(surface.first?.isHiragana ?? true)
        default: true
        }
      let endsCleanly: Bool =
        switch next {
        case nil: true
        case let character? where character.isHiragana: followingParticles.contains(character)
        default: true
        }
      if startsCleanly, endsCleanly { return true }
      searchStart = sentence.index(after: range.lowerBound)
    }
    return false
  }

  /// Particles that can follow a finished form without extending its inflection.
  private static let followingParticles: Set<Character> = [
    "の", "か", "よ", "ね", "し", "と", "が", "を", "は", "も", "ん", "わ", "ぞ", "ぜ", "な",
  ]
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
  var alwaysShowsReading = false

  var body: some View {
    // The stem reading is already in the header, so rows show furigana only when the
    // ending itself contains kanji, as in 来させる, whose reading changes.
    if alwaysShowsReading || form.ending.contains(where: \.isKanji) {
      JapaneseRubyText(
        surface: form.surface,
        reading: form.reading,
        baseFont: font,
        rubyFont: rubyFont,
        exposesAccessibility: false
      )
      .fixedSize(horizontal: false, vertical: true)
    } else {
      Text(tintedSurface)
        .font(font)
    }
  }

  private var tintedSurface: AttributedString {
    var stem = AttributedString(form.stem)
    var ending = AttributedString(form.ending)
    ending.foregroundColor = .accentColor
    stem.append(ending)
    return stem
  }
}

extension Character {
  fileprivate var isKanji: Bool {
    unicodeScalars.contains { (0x4E00...0x9FFF).contains($0.value) || $0 == "々" }
  }

  fileprivate var isHiragana: Bool {
    unicodeScalars.allSatisfy { (0x3041...0x309F).contains($0.value) }
  }
}
