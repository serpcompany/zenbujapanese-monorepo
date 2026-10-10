import SwiftUI

struct KanjiOverview: View {
  @ScaledMetric(relativeTo: .largeTitle) private var glyphSize = 104.0

  let character: String
  let page: KanjiPage?
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
        if let page, !page.stats.isEmpty {
          HStack(spacing: 18) {
            ForEach(page.stats, id: \.kind) { stat in
              KanjiMetric(stat: stat)
            }
          }
        }
      }
      .frame(maxWidth: .infinity)

      let meanings = page?.meanings ?? []
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

private struct KanjiMetric: View {
  let stat: KanjiPage.Stat

  var body: some View {
    VStack(spacing: 4) {
      Text(stat.value)
        .font(.title2.weight(.bold))
      Text(stat.label.uppercased())
        .font(.body)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(stat.spoken)
    .accessibilityIdentifier("kanji-detail.\(stat.kind)")
  }
}

struct KanjiReadingsSection: View {
  let readings: [KanjiPage.Reading]

  var body: some View {
    Section("READINGS") {
      ForEach(readings, id: \.self) { reading in
        if let destination = reading.words.first {
          NavigationLink(value: SearchExperienceRoute.word(destination, nil)) {
            KanjiReadingRow(reading: reading)
          }
          .accessibilityLabel(
            "\(reading.label) reading \(reading.value), \(destination.headword), \(destination.summary)"
          )
          .accessibilityIdentifier("kanji-detail.reading.\(reading.kind).\(reading.value)")
        } else {
          KanjiReadingRow(reading: reading)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("kanji-detail.reading.\(reading.kind).\(reading.value)")
        }
      }
    }
  }
}

private struct KanjiReadingRow: View {
  let reading: KanjiPage.Reading

  var body: some View {
    LabeledContent {
      VStack(alignment: .trailing, spacing: 5) {
        Text(reading.value)
          .font(.headline)
        RomajiReadingAidText(trustedReading: reading.value)
        if !reading.words.isEmpty {
          Text(
            reading.words.map { "\($0.headword) · \($0.summary)" }.joined(separator: "   ")
          )
          .font(.body)
          .fixedSize(horizontal: false, vertical: true)
          .multilineTextAlignment(.trailing)
        }
      }
    } label: {
      Text(reading.label)
        .font(.body.weight(.semibold))
    }
  }
}

struct KanjiElementsSection: View {
  @ScaledMetric(relativeTo: .largeTitle) private var elementGlyphSize = 52.0

  let elements: [KanjiPage.Element]

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
              Text(element.roleLabel.uppercased())
                .font(.body.weight(.semibold))
              if !element.description.isEmpty {
                Text(element.description)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
          }
        }
        .accessibilityLabel(element.spoken)
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
              ruby: JapaneseRuby(surface: entry.headword, reading: entry.reading),
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
    .sheetSize(onMac: AppWindow.sheetSize)
  }
}
