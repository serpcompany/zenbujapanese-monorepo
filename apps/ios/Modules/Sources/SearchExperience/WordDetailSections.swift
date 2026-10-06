import SwiftUI

struct PartOfSpeechRow: View {
  let entry: DictionaryEntry
  let conjugationTable: ConjugationTable?

  var body: some View {
    if let conjugationTable {
      NavigationLink(value: SearchExperienceRoute.conjugations(entry, conjugationTable)) {
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
      .accessibilityIdentifier("word-detail.entry.\(entry.id.rawValue)")
  }

  private var title: String { entry.displayPartOfSpeech }
}

struct MeaningSection: View {
  let senses: [DictionarySense]

  var body: some View {
    ForEach(senses, id: \.self) { sense in
      VStack(alignment: .leading, spacing: 6) {
        Text("\(senseNumber(for: sense)).  \(sense.meaning)")
          .font(.body.weight(.semibold))
        if !sense.notes.isEmpty {
          Text(sense.notes.joined(separator: " · "))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
    }
  }

  private func senseNumber(for sense: DictionarySense) -> Int {
    (senses.firstIndex(of: sense) ?? senses.startIndex) + 1
  }
}

struct AlternativeFormsSection: View {
  let forms: [DictionaryForm]
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

  private var writtenForms: [DictionaryForm] { forms.filter { $0.kind == .written } }
  private var readingForms: [DictionaryForm] { forms.filter { $0.kind == .reading } }
}

private struct AlternativeFormLine: View {
  let forms: [DictionaryForm]
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
        if let character = form.value.first(where: { $0.isKanji }),
          let kanji = KanjiCharacter(String(character))
        {
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

  private func formLabel(_ form: DictionaryForm) -> some View {
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
  let relationships: [DictionaryRelationship]
  let openRelated: (DictionaryRelationship) -> Void

  var body: some View {
    ForEach(relationships, id: \.self) { relationship in
      Button {
        openRelated(relationship)
      } label: {
        VStack(alignment: .leading, spacing: 3) {
          JapaneseRubyText(
            surface: relationship.headword,
            reading: relationship.reading,
            baseFont: .headline,
            rubyFont: .caption,
            exposesAccessibility: false,
            highlightsKanjiOnTap: false
          )
          .foregroundStyle(.primary)
          .accessibilityIdentifier("word-detail.related-primary.\(relationship.headword)")
          Text("\(relationship.relation) · \(relationship.summary)")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .accessibilityIdentifier("word-detail.related-support.\(relationship.headword)")
        }
      }
      .tint(.primary)
      .accessibilityLabel(
        "\(relationship.headword), \(relationship.reading), \(relationship.relation), \(relationship.summary)"
      )
      .accessibilityIdentifier("word-detail.related.\(relationship.headword)")
    }
  }
}

extension Character {
  fileprivate var isKanji: Bool {
    unicodeScalars.contains { (0x3400...0x9FFF).contains(Int($0.value)) }
  }
}
