import SwiftUI

struct ConjugationsView: View {
  @State private var mode: String

  let entry: DictionaryEntry
  let conjugations: Conjugations
  let speechSynthesisClient: SpeechSynthesisClient

  init(
    entry: DictionaryEntry, conjugations: Conjugations,
    speechSynthesisClient: SpeechSynthesisClient
  ) {
    self.entry = entry
    self.conjugations = conjugations
    self.speechSynthesisClient = speechSynthesisClient
    _mode = State(initialValue: conjugations.modes.first ?? "")
  }

  var body: some View {
    List {
      Section {
        ConjugationHeader(entry: entry, page: WordPage(entry), rule: conjugations.rule) {
          speechSynthesisClient.speak(entry.reading)
        }
      }

      if conjugations.modes.count > 1 {
        Section {
          Picker("Conjugation mode", selection: $mode) {
            ForEach(conjugations.modes, id: \.self) { option in
              Text(option)
                .tag(option)
                .accessibilityIdentifier("conjugations.mode.\(option.lowercased())")
            }
          }
          .pickerStyle(.segmented)
          .accessibilityIdentifier("conjugations.mode")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
      }

      Section {
        ForEach(conjugations.rows[mode] ?? []) { form in
          NavigationLink(value: SearchExperienceRoute.conjugatedForm(entry, form)) {
            ConjugationRow(form: form)
          }
        }
      }
    }
    .groupedList()
    .compactSectionSpacing()
    .accessibilityIdentifier("conjugations.screen")
    .navigationTitle("Conjugations")
    .inlineNavigationTitle()
  }
}

private struct ConjugationHeader: View {
  let entry: DictionaryEntry
  let page: WordPage?
  let rule: String
  let pronounce: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      WordHeadline(
        ruby: JapaneseRuby(headwordOf: entry, on: page),
        pitch: page?.pitch,
        identifierPrefix: "conjugations.header",
        pronounce: pronounce
      )
      Text(entry.summary)
        .foregroundStyle(.secondary)
      if let partOfSpeech = page?.partOfSpeech, !partOfSpeech.isEmpty {
        Text(partOfSpeech)
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
  let form: Conjugations.Row

  var body: some View {
    HStack(spacing: 12) {
      Text(form.title)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("conjugations.title.\(form.kind)")
      Spacer(minLength: 8)
      ConjugatedSurface(form: form, font: .title3, rubyFont: .caption2)
        .multilineTextAlignment(.trailing)
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(form.title), \(form.surface)")
    .accessibilityValue(form.reading)
    .accessibilityHint("Explains this form")
    .accessibilityIdentifier("conjugations.row.\(form.kind)")
  }
}

struct ConjugatedFormView: View {
  @State private var examples = LoadedExamples()
  @Environment(\.exampleRowsOnScreen) private var rowsOnScreen

  let form: Conjugations.Row
  let exampleSentenceClient: ExampleSentenceClient
  let speechSynthesisClient: SpeechSynthesisClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    List {
      Section {
        VStack(alignment: .leading, spacing: 10) {
          Text(form.explanation)
            .font(.title3)
            .accessibilityIdentifier("conjugations.explanation.\(form.kind)")
          if let note = form.note {
            Label(note, systemImage: "equal.circle")
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
          ruby: form.shown,
          highlightedEnding: form.ending,
          identifierPrefix: "conjugations.form",
          pronounce: { speechSynthesisClient.speak(form.reading) }
        )
      }

      ExampleSentenceSections(
        title: "Examples",
        examples: examples.examples,
        isLoading: !examples.answers(form.surface),
        emptyMessage: "No example sentences use this form yet.",
        hasMore: examples.hasMore,
        presentation: { .conjugatedForm(form.kind, index: $0) },
        speechSynthesisClient: speechSynthesisClient,
        loadMore: { await examples.loadMore(read: readExamples) },
        openWord: openWord
      )
    }
    .compactSectionSpacing()
    .navigationTitle(form.title)
    .inlineNavigationTitle()
    .accessibilityIdentifier("conjugations.form.\(form.kind)")
    .task(id: form) {
      await examples.load(form.surface, rowsOnScreen: rowsOnScreen, read: readExamples)
    }
  }

  private func readExamples(_ batch: ExampleBatch) async -> ExamplePage? {
    await exampleSentenceClient.formExamples(form.surface, batch)
  }
}

extension Conjugations.Row {
  fileprivate var shown: JapaneseRuby {
    JapaneseRuby(surface: surface, reading: reading, segments: ruby)
  }
}

private struct ConjugatedSurface: View {
  let form: Conjugations.Row
  let font: Font
  let rubyFont: Font

  var body: some View {
    if form.rowFurigana {
      JapaneseRubyText(
        ruby: form.shown,
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
