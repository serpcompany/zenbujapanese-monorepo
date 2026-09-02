import SwiftUI

struct KanjiDetailView: View {
  let character: KanjiCharacter
  let entry: DictionaryEntry?
  let kanjiLookupClient: KanjiLookupClient
  let kanjiElementLookupClient: KanjiElementLookupClient
  let kanjiStrokeOrderClient: KanjiStrokeOrderClient
  let preservedWordID: LanguageReferenceID?
  let preservedElementID: KanjiElementID?

  @State private var loadState = KanjiDetailLoadState.loading
  @State private var retryID = 0
  @State private var strokeDiagramLoadState = KanjiStrokeDiagramLoadState.loading
  @State private var strokeRetryID = 0
  @State private var presentedStrokeDiagram: KanjiStrokeDiagram?
  @State private var pendingScrollTarget: KanjiDetailScrollTarget?

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section {
          KanjiOverview(
            character: character.rawValue,
            reference: reference,
            strokeDiagramLoadState: strokeDiagramLoadState,
            retryStrokeOrder: retryStrokeOrder,
            openStrokeOrder: openStrokeOrder
          )
        }

        if loadState == .loading {
          Section {
            HStack {
              Spacer()
              ProgressView("Loading kanji reference…")
              Spacer()
            }
            .padding(.vertical, 16)
          }
        }

        if loadFailed {
          Section {
            ContentUnavailableView {
              Label("Kanji reference unavailable", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
            } description: {
              Text("Some source-backed kanji content could not be loaded.")
            } actions: {
              Button("Retry", action: retry)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("kanji-detail.retry")
            }
          }
        }

        if let reference {
          KanjiReadingsSection(reference: reference, relatedWords: relatedWords)
          if elements.isEmpty, !reference.components.isEmpty {
            Section("COMPONENTS") {
              Text(reference.components.joined(separator: " · "))
                .font(.title3)
                .accessibilityIdentifier("kanji-detail.elements")
            }
          }
        }

        if !elements.isEmpty {
          KanjiElementsSection(elements: elements)
        }

        if !relatedWords.isEmpty {
          KanjiWordsSection(entries: orderedRelatedWords)
        }
      }
      .listStyle(.insetGrouped)
      .accessibilityIdentifier("kanji-detail.screen")
      .onAppear {
        restorePreservedWordPosition(in: relatedWords)
        restorePreservedElementPosition(in: elements)
      }
      .onChange(of: relatedWords.map(\.id)) {
        restorePreservedWordPosition(in: relatedWords)
      }
      .onChange(of: elements.map(\.id)) {
        restorePreservedElementPosition(in: elements)
      }
      .onScrollGeometryChange(for: KanjiDetailScrollReadiness.self) { geometry in
        KanjiDetailScrollReadiness(
          target: pendingScrollTarget,
          contentHeight: geometry.contentSize.height
        )
      } action: { _, readiness in
        guard let target = readiness.target, readiness.contentHeight > 0 else { return }
        proxy.scrollTo(target, anchor: .center)
        pendingScrollTarget = nil
      }
    }
    .navigationTitle(character.rawValue)
    .navigationBarTitleDisplayMode(.inline)
    .sheet(item: $presentedStrokeDiagram) { diagram in
      KanjiStrokeOrderSheet(diagram: diagram)
    }
    .task(id: KanjiStrokeDiagramLoadRequest(character: character, retryID: strokeRetryID)) {
      await loadStrokeDiagram()
    }
    .task(id: KanjiDetailLoadRequest(character: character, retryID: retryID)) {
      await loadDetail()
    }
  }

  private var reference: KanjiReferenceEntry? {
    switch loadState {
    case .loaded(let reference, _, _), .failed(let reference, _, _): reference
    case .loading: nil
    }
  }

  private var loadFailed: Bool {
    if case .failed = loadState { return true }
    return false
  }

  private var relatedWords: [DictionaryEntry] {
    switch loadState {
    case .loaded(_, _, let relatedWords), .failed(_, _, let relatedWords): relatedWords
    case .loading: []
    }
  }

  private var elements: [KanjiElementSummary] {
    switch loadState {
    case .loaded(_, let elements, _), .failed(_, let elements, _): elements
    case .loading: []
    }
  }

  private var orderedRelatedWords: [DictionaryEntry] {
    guard let entry, relatedWords.contains(entry) else { return relatedWords }
    return [entry] + relatedWords.filter { $0.id != entry.id }
  }

  private func retry() { retryID += 1 }

  private func retryStrokeOrder() { strokeRetryID += 1 }

  private func openStrokeOrder(_ diagram: KanjiStrokeDiagram) {
    presentedStrokeDiagram = diagram
  }

  private func restorePreservedWordPosition(in loadedWords: [DictionaryEntry]) {
    guard let preservedWordID,
      loadedWords.contains(where: { $0.id == preservedWordID })
    else { return }
    pendingScrollTarget = .word(preservedWordID)
  }

  private func restorePreservedElementPosition(in loadedElements: [KanjiElementSummary]) {
    guard let preservedElementID,
      loadedElements.contains(where: { $0.id == preservedElementID })
    else { return }
    pendingScrollTarget = .element(preservedElementID)
  }

  private func loadStrokeDiagram() async {
    strokeDiagramLoadState = .loading
    do {
      if let diagram = try await kanjiStrokeOrderClient.diagram(character) {
        strokeDiagramLoadState = .available(diagram)
      } else {
        strokeDiagramLoadState = .unavailable
      }
    } catch is CancellationError {
      return
    } catch {
      strokeDiagramLoadState = .failed
    }
  }

  private func loadDetail() async {
    loadState = .loading
    var loadedReference: KanjiReferenceEntry?
    var loadedWords: [DictionaryEntry] = []
    var loadedElements: [KanjiElementSummary] = []
    var loadFailed = false

    do {
      loadedReference = try await kanjiLookupClient.entry(character)
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
    guard !Task.isCancelled else { return }

    do {
      loadedElements = try await kanjiElementLookupClient.elements(character)
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
    guard !Task.isCancelled else { return }

    do {
      loadedWords = try await kanjiLookupClient.relatedWords(character)
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
    guard !Task.isCancelled else { return }

    if loadFailed {
      loadState = .failed(
        reference: loadedReference,
        elements: loadedElements,
        relatedWords: loadedWords
      )
    } else {
      loadState = .loaded(
        reference: loadedReference,
        elements: loadedElements,
        relatedWords: loadedWords
      )
    }
  }
}

private struct KanjiDetailLoadRequest: Hashable {
  let character: KanjiCharacter
  let retryID: Int
}

private struct KanjiStrokeDiagramLoadRequest: Hashable {
  let character: KanjiCharacter
  let retryID: Int
}

private enum KanjiDetailScrollTarget: Hashable {
  case word(LanguageReferenceID)
  case element(KanjiElementID)
}

private struct KanjiDetailScrollReadiness: Equatable {
  let target: KanjiDetailScrollTarget?
  let contentHeight: CGFloat
}

private enum KanjiStrokeDiagramLoadState: Equatable {
  case loading
  case available(KanjiStrokeDiagram)
  case unavailable
  case failed
}

private enum KanjiDetailLoadState: Equatable {
  case loading
  case loaded(
    reference: KanjiReferenceEntry?,
    elements: [KanjiElementSummary],
    relatedWords: [DictionaryEntry]
  )
  case failed(
    reference: KanjiReferenceEntry?,
    elements: [KanjiElementSummary],
    relatedWords: [DictionaryEntry]
  )
}

private struct KanjiOverview: View {
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
            KanjiMetric(
              value: "\(reference.strokeCount)",
              caption: reference.strokeCount == 1 ? "Stroke" : "Strokes",
              accessibilityLabel:
                "\(reference.strokeCount) \(reference.strokeCount == 1 ? "Stroke" : "Strokes")",
              identifier: "kanji-detail.strokes"
            )
            if let grade = reference.grade {
              KanjiMetric(
                value: "\(grade)",
                caption: "Grade",
                accessibilityLabel: "Grade \(grade)",
                identifier: "kanji-detail.grade"
              )
            }
            if let jlpt = reference.jlpt {
              KanjiMetric(
                value: "N\(jlpt)",
                caption: "JLPT",
                accessibilityLabel: "JLPT N\(jlpt)",
                identifier: "kanji-detail.jlpt"
              )
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

private struct KanjiMetric: View {
  let value: String
  let caption: String
  let accessibilityLabel: String
  let identifier: String

  var body: some View {
    VStack(spacing: 4) {
      Text(value)
        .font(.title2.weight(.bold))
      Text(caption.uppercased())
        .font(.body)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
    .accessibilityIdentifier(identifier)
  }
}

private struct KanjiReadingsSection: View {
  let reference: KanjiReferenceEntry
  let relatedWords: [DictionaryEntry]

  var body: some View {
    Section("READINGS") {
      ForEach(reference.readings, id: \.self) { reading in
        let matches = words(matching: reading)
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

  private func words(matching reading: KanjiReading) -> [DictionaryEntry] {
    let stem = reading.value
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

private struct KanjiElementsSection: View {
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

private struct KanjiWordsSection: View {
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
              rubyFont: .body
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

private struct KanjiStrokeOrderSheet: View {
  @Environment(\.dismiss) private var dismiss

  let diagram: KanjiStrokeDiagram

  var body: some View {
    NavigationStack {
      KanjiStrokeOrderView(diagram: diagram)
        .navigationTitle("Stroke Order")
        .navigationBarTitleDisplayMode(.inline)
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
