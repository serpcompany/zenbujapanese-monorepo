import SwiftUI

struct KanjiOverview: View {
  @ScaledMetric(relativeTo: .largeTitle) private var glyphSize = 104.0

  let character: String
  let reference: KanjiReferenceEntry?
  let strokeDiagramLoadState: KanjiStrokeDiagramLoadState
  let retryStrokeOrder: () -> Void
  let openStrokeOrder: (KanjiStrokeDiagram) -> Void

  var body: some View {
    VStack(spacing: 18) {
      HStack(alignment: .center, spacing: 24) {
        VStack(spacing: 4) {
          Text(character)
            .font(.system(size: glyphSize, weight: .light))
            .accessibilityIdentifier("kanji-detail.glyph")
          strokeOrderAction
        }
        if let reference {
          HStack(spacing: 18) {
            ForEach(reference.stats, id: \.identifier) { stat in
              KanjiMetric(stat: stat)
            }
          }
        }
      }
      .frame(maxWidth: .infinity)

      let meanings = reference?.meanings ?? []
      if !meanings.isEmpty {
        Text(meanings.joined(separator: ", "))
          .font(.title3.weight(.semibold))
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .padding(.vertical, 8)
  }

  @ViewBuilder
  private var strokeOrderAction: some View {
    switch strokeDiagramLoadState {
    case .available(let strokeDiagram):
      Button {
        openStrokeOrder(strokeDiagram)
      } label: {
        Image(systemName: "pencil.and.scribble")
          .font(.caption.weight(.bold))
      }
      .buttonStyle(.bordered)
      .accessibilityLabel("Show stroke order for \(character)")
      .accessibilityIdentifier("kanji-detail.stroke-order")
    case .failed:
      Button("Retry stroke order", action: retryStrokeOrder)
        .font(.caption)
        .accessibilityIdentifier("kanji-detail.stroke-order-retry")
    case .loading, .unavailable:
      Text("Kanji \(character)")
        .font(.caption)
    }
  }
}

struct KanjiStat: Hashable, Sendable {
  let value: String
  let caption: String
  let accessibilityLabel: String
  let identifier: String
}

extension KanjiReferenceEntry {
  var stats: [KanjiStat] {
    let strokes = strokeCount == 1 ? "Stroke" : "Strokes"
    var stats = [
      KanjiStat(
        value: "\(strokeCount)",
        caption: strokes,
        accessibilityLabel: "\(strokeCount) \(strokes)",
        identifier: "kanji-detail.strokes"
      )
    ]
    if let grade {
      stats.append(
        KanjiStat(
          value: "\(grade)",
          caption: "Grade",
          accessibilityLabel: "Grade \(grade)",
          identifier: "kanji-detail.grade"
        ))
    }
    if let wallerJlptLevel {
      stats.append(
        KanjiStat(
          value: "N\(wallerJlptLevel)",
          caption: "JLPT",
          accessibilityLabel: "JLPT N\(wallerJlptLevel)",
          identifier: "kanji-detail.jlpt"
        ))
    }
    return stats
  }
}

private struct KanjiMetric: View {
  let stat: KanjiStat

  var body: some View {
    VStack(spacing: 4) {
      Text(stat.value)
        .font(.title2.weight(.bold))
      Text(stat.caption.uppercased())
        .font(.body)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(stat.accessibilityLabel)
    .accessibilityIdentifier(stat.identifier)
  }
}

struct KanjiReadingsSection: View {
  let reference: KanjiReferenceEntry
  let relatedWords: [DictionaryEntry]

  var body: some View {
    Section("READINGS") {
      ForEach(reference.readings, id: \.self) { reading in
        let matches = reading.words(in: relatedWords)
        if let destination = matches.first {
          NavigationLink(value: SearchExperienceRoute.word(destination, nil)) {
            KanjiReadingRow(reading: reading, words: matches)
          }
          .accessibilityLabel(
            "\(reading.kind.label) reading \(reading.value), \(destination.headword), \(destination.summary)"
          )
          .accessibilityIdentifier(
            "kanji-detail.reading.\(reading.kind.rawValue).\(reading.value)")
        } else {
          KanjiReadingRow(reading: reading, words: [])
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(
              "kanji-detail.reading.\(reading.kind.rawValue).\(reading.value)")
        }
      }
    }
  }
}

extension KanjiReading {
  func words(in relatedWords: [DictionaryEntry]) -> [DictionaryEntry] {
    let stem = value
      .replacingOccurrences(of: ".", with: "")
      .replacingOccurrences(of: "-", with: "")
      .hiragana
    guard !stem.isEmpty else { return [] }
    return Array(
      relatedWords.filter { entry in
        let candidate = entry.reading.hiragana
        return candidate == stem || candidate.hasPrefix(stem)
      }.prefix(3))
  }
}

private struct KanjiReadingRow: View {
  let reading: KanjiReading
  let words: [DictionaryEntry]

  var body: some View {
    LabeledContent {
      VStack(alignment: .trailing, spacing: 5) {
        Text(reading.value)
          .font(.headline)
        RomajiReadingAidText(trustedReading: reading.value)
        if !words.isEmpty {
          Text(words.map { "\($0.headword) · \($0.summary)" }.joined(separator: "   "))
            .font(.body)
            .fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(.trailing)
        }
      }
    } label: {
      Text(reading.kind.label)
        .font(.body.weight(.semibold))
    }
  }
}

extension KanjiReading.Kind {
  fileprivate var label: String {
    switch self {
    case .on: "On"
    case .kun: "Kun"
    case .name: "Name"
    }
  }
}

extension String {
  fileprivate var hiragana: String {
    String(
      unicodeScalars.map { scalar in
        let value = scalar.value
        if (0x30A1...0x30F6).contains(value), let converted = UnicodeScalar(value - 0x60) {
          return Character(String(converted))
        }
        return Character(String(scalar))
      })
  }
}

struct KanjiElementsSection: View {
  @ScaledMetric(relativeTo: .largeTitle) private var elementGlyphSize = 52.0

  let elements: [KanjiElementSummary]

  var body: some View {
    Section("ELEMENTS") {
      ForEach(elements) { element in
        NavigationLink(value: SearchExperienceRoute.kanjiElement(element.id)) {
          HStack(spacing: 18) {
            Text(element.id.rawValue)
              .font(.system(size: elementGlyphSize, weight: .light))
              .frame(minWidth: 72, minHeight: 72)
              .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 6) {
              Text(element.role.label)
                .font(.body.weight(.semibold))
              if !element.meanings.isEmpty {
                Text(element.meanings.prefix(3).joined(separator: ", "))
                  .fixedSize(horizontal: false, vertical: true)
              } else if !element.commonLinkedOnReadings.isEmpty {
                Text(
                  "Linked on-readings: \(element.commonLinkedOnReadings.joined(separator: ", "))"
                )
                .fixedSize(horizontal: false, vertical: true)
              }
            }
          }
        }
        .accessibilityLabel(
          "Element \(element.id.rawValue), \(element.role.label.lowercased()), "
            + element.meanings.prefix(3).joined(separator: ", ")
        )
        .accessibilityIdentifier("kanji-detail.element.\(element.id.rawValue)")
        .id(KanjiDetailScrollTarget.element(element.id))
      }
    }
  }
}

struct KanjiWordsSection: View {
  let entries: [DictionaryEntry]

  var body: some View {
    Section("WORDS") {
      ForEach(entries) { entry in
        NavigationLink(value: SearchExperienceRoute.word(entry, nil)) {
          HStack(spacing: 14) {
            JapaneseRubyText(
              surface: entry.headword,
              reading: entry.reading,
              baseFont: .title3,
              rubyFont: .body,
              highlightsKanjiOnTap: false
            )
            Spacer()
            Text(entry.summary)
              .fixedSize(horizontal: false, vertical: true)
              .multilineTextAlignment(.trailing)
          }
        }
        .accessibilityLabel("\(entry.headword), \(entry.reading), \(entry.summary)")
        .accessibilityIdentifier("kanji-detail.word.\(entry.id.rawValue)")
        .id(KanjiDetailScrollTarget.word(entry.id))
      }
    }
  }
}

struct KanjiStrokeOrderSheet: View {
  @Environment(\.dismiss) private var dismiss

  let diagram: KanjiStrokeDiagram

  var body: some View {
    NavigationStack {
      KanjiStrokeOrderView(diagram: diagram)
        .navigationTitle("Stroke Order")
        .inlineNavigationTitle()
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Close", action: dismiss.callAsFunction)
              .accessibilityIdentifier("stroke-order.close")
          }
        }
    }
    .presentationDetents([.large])
  }
}
