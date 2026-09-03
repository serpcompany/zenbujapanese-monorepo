import SwiftUI

struct ConjugationsView: View {
  @State private var mode = ConjugationMode.plain
  @State private var presentedExplanation: ConjugationKindPresentation?

  let entry: DictionaryEntry
  let table: ConjugationTable

  var body: some View {
    List {
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
          .controlSize(.large)
          .accessibilityIdentifier("conjugations.mode")
        }
      }

      ForEach(table.forms(for: mode)) { form in
        ConjugationSection(form: form) {
          presentedExplanation = form.id.presentation
        }
      }
    }
    .listStyle(.plain)
    .listSectionSpacing(.compact)
    .environment(\.defaultMinListRowHeight, 35)
    .accessibilityIdentifier("conjugations.screen")
    .navigationTitle(table.title)
    .navigationBarTitleDisplayMode(.inline)
    .sheet(item: $presentedExplanation) { explanation in
      ConjugationExplanationSheet(explanation: explanation)
    }
  }
}

private struct ConjugationSection: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let form: ConjugatedForm
  let showExplanation: () -> Void

  var body: some View {
    let presentation = form.id.presentation
    Section {
      HStack {
        ConjugatedSurface(form: form)
          .accessibilityHidden(true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(form.surface), \(presentation.title)")
      .accessibilityValue(form.reading)
      .accessibilityIdentifier("conjugations.row.\(form.id.rawValue)")
    } header: {
      HStack(spacing: 8) {
        Text(presentation.title)
          .font(dynamicTypeSize.isAccessibilitySize ? .caption2 : .headline)
          .accessibilityIdentifier("conjugations.title.\(form.id.rawValue)")
        Spacer()
        Button(action: showExplanation) {
          Image(systemName: "info.circle")
            .font(dynamicTypeSize.isAccessibilitySize ? .caption2 : .body)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("About \(presentation.title)")
        .accessibilityIdentifier("conjugations.info.\(form.id.rawValue)")
      }
      .textCase(nil)
    }
  }
}

private struct ConjugationExplanationSheet: View {
  @Environment(\.dismiss) private var dismiss
  let explanation: ConjugationKindPresentation

  var body: some View {
    NavigationStack {
      Form {
        Text(explanation.explanation)
          .accessibilityIdentifier("conjugations.explanation.\(explanation.id.rawValue)")
      }
      .navigationTitle(explanation.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
            .accessibilityIdentifier("conjugations.explanation.done")
        }
      }
    }
    .presentationDetents([.medium])
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

  var body: some View {
    JapaneseRubyText(
      surface: form.surface,
      reading: form.reading,
      baseFont: .title3,
      rubyFont: .body,
      exposesAccessibility: false
    )
    .fixedSize(horizontal: false, vertical: true)
  }
}
