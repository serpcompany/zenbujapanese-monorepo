import SwiftUI

struct LinkRow<Content: View>: View {
  let action: () -> Void
  @ViewBuilder let label: () -> Content

  var body: some View {
    Button(action: action) {
      HStack {
        label()
        Spacer()
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
    }
    .tint(.primary)
  }
}

struct PartOfSpeechRow: View {
  let title: String
  let entryID: LanguageReferenceID
  let conjugations: Conjugations?
  let openConjugations: (Conjugations) -> Void

  var body: some View {
    if let conjugations {
      LinkRow {
        openConjugations(conjugations)
      } label: {
        label
      }
      .accessibilityHint("Shows conjugations")
      .accessibilityIdentifier("word-detail.conjugations")
    } else if !title.isEmpty {
      label
    }
  }

  private var label: some View {
    Text(title.isEmpty ? "Dictionary entry" : title)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityIdentifier("word-detail.entry.\(entryID.rawValue)")
  }
}

struct MeaningSection: View {
  let senses: [WordPage.Sense]

  var body: some View {
    ForEach(senses, id: \.number) { sense in
      VStack(alignment: .leading, spacing: 6) {
        Text("\(sense.number).  \(sense.meaning)")
          .font(.body.weight(.semibold))
        if !sense.notes.isEmpty {
          Text(sense.notes.joined(separator: " · "))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
    }
  }
}

struct AlternativeFormsSection: View {
  let forms: [WordPage.AlternativeForm]
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      if !writtenForms.isEmpty {
        AlternativeFormLine(forms: writtenForms, openKanji: openKanji)
      }
      if !readingForms.isEmpty {
        AlternativeFormLine(forms: readingForms, openKanji: openKanji)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var writtenForms: [WordPage.AlternativeForm] { forms.filter { $0.kind == .written } }
  private var readingForms: [WordPage.AlternativeForm] { forms.filter { $0.kind == .reading } }
}

private struct AlternativeFormLine: View {
  let forms: [WordPage.AlternativeForm]
  let openKanji: (KanjiCharacter, DictionaryEntry?) -> Void

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 7) { tokens }
      VStack(alignment: .leading, spacing: 5) { tokens }
    }
  }

  @ViewBuilder
  private var tokens: some View {
    ForEach(Array(forms.enumerated()), id: \.element.value) { index, form in
      HStack(spacing: 2) {
        if index > 0 { Text(",") }
        if let kanji = form.kanji.flatMap(KanjiCharacter.init) {
          Button {
            openKanji(kanji, nil)
          } label: {
            formLabel(form)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("word-detail.alternative.\(form.value)")
        } else {
          formLabel(form)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("word-detail.alternative.\(form.value)")
        }
      }
    }
  }

  private func formLabel(_ form: WordPage.AlternativeForm) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(form.value + (form.labels.isEmpty ? "" : " (\(form.labels.joined(separator: ", ")))"))
        .font(.body)
        .foregroundStyle(form.labels.isEmpty ? Color.primary : Color.secondary)
      RomajiReadingAidText(
        trustedReading: form.value,
        isEnabled: form.kind == .reading,
        exposesAccessibility: false
      )
    }
  }
}

struct RelationshipsSection: View {
  let related: [WordPage.Related]
  let relationships: [DictionaryRelationship]
  let openRelated: (DictionaryRelationship) -> Void

  var body: some View {
    ForEach(Array(zip(related, relationships).enumerated()), id: \.offset) { _, pair in
      let (word, relationship) = pair
      Button {
        openRelated(relationship)
      } label: {
        VStack(alignment: .leading, spacing: 3) {
          JapaneseRubyText(
            ruby: JapaneseRuby(surface: word.headword, reading: word.reading, segments: word.ruby),
            baseFont: .headline,
            rubyFont: .caption,
            exposesAccessibility: false,
            highlightsKanjiOnTap: false
          )
          .foregroundStyle(.primary)
          .accessibilityIdentifier("word-detail.related-primary.\(word.headword)")
          Text("\(word.relation) · \(word.summary)")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .accessibilityIdentifier("word-detail.related-support.\(word.headword)")
        }
      }
      .tint(.primary)
      .accessibilityLabel(
        "\(word.headword), \(word.reading), \(word.relation), \(word.summary)"
      )
      .accessibilityIdentifier("word-detail.related.\(word.headword)")
    }
  }
}
