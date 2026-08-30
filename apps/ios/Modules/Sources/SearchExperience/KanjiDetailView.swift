import SwiftUI

struct KanjiDetailView: View {
  let character: KanjiCharacter
  let entry: DictionaryEntry?
  let kanjiLookupClient: KanjiLookupClient
  let kanjiElementLookupClient: KanjiElementLookupClient
  let kanjiStrokeOrderClient: KanjiStrokeOrderClient
  let openWord: (DictionaryEntry) -> Void
  let openElement: (KanjiElementID) -> Void
  let preservedWordID: LanguageReferenceID?
  let preserveWordID: (LanguageReferenceID) -> Void
  let preservedElementID: KanjiElementID?
  let preserveElementID: (KanjiElementID) -> Void

  @State private var loadState = KanjiDetailLoadState.loading
  @State private var retryID = 0
  @State private var strokeDiagramLoadState = KanjiStrokeDiagramLoadState.loading
  @State private var strokeRetryID = 0
  @State private var presentedStrokeDiagram: KanjiStrokeDiagram?

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(spacing: 0) {
          KanjiOverview(
            character: character.rawValue,
            reference: reference,
            strokeDiagramLoadState: strokeDiagramLoadState,
            retryStrokeOrder: { strokeRetryID += 1 },
            openStrokeOrder: { presentedStrokeDiagram = $0 }
          )
          if loadState == .loading {
            ProgressView("Loading kanji reference…")
              .frame(maxWidth: .infinity)
              .padding(24)
          }
          if loadFailed {
            VStack(spacing: 12) {
              Text("Kanji reference unavailable")
              Button("Retry") { retryID += 1 }
                .accessibilityIdentifier("kanji-detail.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(24)
            .background(ZenbuTheme.row)
          }
          if let reference {
            KanjiReadingsSection(
              reference: reference,
              relatedWords: relatedWords,
              openWord: openWord
            )
            if elements.isEmpty, !reference.components.isEmpty {
              KanjiComponentsSummarySection(components: reference.components)
            }
          }
          if !elements.isEmpty {
            KanjiElementsSection(elements: elements) { selectedElement in
              preserveElementID(selectedElement)
              openElement(selectedElement)
            }
          }
          if !relatedWords.isEmpty {
            KanjiWordsSection(entries: orderedRelatedWords) { selectedEntry in
              preserveWordID(selectedEntry.id)
              openWord(selectedEntry)
            }
          }
        }
        .scrollTargetLayout()
      }
      .accessibilityIdentifier("kanji-detail.screen")
      .onAppear {
        restorePreservedWordPosition(with: proxy, in: relatedWords)
        restorePreservedElementPosition(with: proxy, in: elements)
      }
      .onChange(of: relatedWords.map(\.id)) {
        restorePreservedWordPosition(with: proxy, in: relatedWords)
      }
      .onChange(of: elements.map(\.id)) {
        restorePreservedElementPosition(with: proxy, in: elements)
      }
    }
    .foregroundStyle(ZenbuTheme.foreground)
    .background(ZenbuTheme.background)
    .navigationTitle(character.rawValue)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityHidden(presentedStrokeDiagram != nil)
    .overlay {
      if let diagram = presentedStrokeDiagram {
        ZStack {
          ZenbuTheme.background.opacity(0.72)
            .ignoresSafeArea()
          KanjiStrokeOrderView(
            diagram: diagram,
            close: { presentedStrokeDiagram = nil }
          )
          .frame(maxWidth: 356)
          .padding(.horizontal, 28)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.96)))
      }
    }
    .animation(.easeOut(duration: 0.18), value: presentedStrokeDiagram != nil)
    .task(id: KanjiStrokeDiagramLoadRequest(character: character, retryID: strokeRetryID)) {
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
    .task(id: KanjiDetailLoadRequest(character: character, retryID: retryID)) {
      loadState = .loading
      var loadedReference: KanjiReferenceEntry?
      var loadedWords: [DictionaryEntry] = []
      var loadedElements: [KanjiElementSummary] = []
      do {
        loadedReference = try await kanjiLookupClient.entry(character)
        guard !Task.isCancelled else { return }
        loadedElements = try await kanjiElementLookupClient.elements(character)
        guard !Task.isCancelled else { return }
        loadedWords = try await kanjiLookupClient.relatedWords(character)
        guard !Task.isCancelled else { return }
        loadState = .loaded(
          reference: loadedReference,
          elements: loadedElements,
          relatedWords: loadedWords
        )
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled else { return }
        loadState = .failed(
          reference: loadedReference,
          elements: loadedElements,
          relatedWords: loadedWords
        )
      }
    }
  }

  private func restorePreservedWordPosition(
    with proxy: ScrollViewProxy,
    in loadedWords: [DictionaryEntry]
  ) {
    guard let preservedWordID,
      loadedWords.contains(where: { $0.id == preservedWordID })
    else { return }
    proxy.scrollTo(preservedWordID, anchor: .center)
  }

  private func restorePreservedElementPosition(
    with proxy: ScrollViewProxy,
    in loadedElements: [KanjiElementSummary]
  ) {
    guard let preservedElementID,
      loadedElements.contains(where: { $0.id == preservedElementID })
    else { return }
    proxy.scrollTo(preservedElementID, anchor: .center)
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
}

private struct KanjiDetailLoadRequest: Hashable {
  let character: KanjiCharacter
  let retryID: Int
}

private struct KanjiStrokeDiagramLoadRequest: Hashable {
  let character: KanjiCharacter
  let retryID: Int
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
          if case .available(let strokeDiagram) = strokeDiagramLoadState {
            Button {
              openStrokeOrder(strokeDiagram)
            } label: {
              Image(systemName: "arrow.down.right.and.arrow.up.left")
                .font(.caption.weight(.bold))
                .frame(width: 44, height: 44)
                .background(ZenbuTheme.accent, in: Circle())
            }
            .accessibilityLabel("Show stroke order for \(character)")
            .accessibilityIdentifier("kanji-detail.stroke-order")
          } else if strokeDiagramLoadState == .failed {
            Button("Retry stroke order") {
              retryStrokeOrder()
            }
            .font(.caption)
            .accessibilityIdentifier("kanji-detail.stroke-order-retry")
          } else {
            Text("Kanji \(character)")
              .font(.caption)
              .foregroundStyle(ZenbuTheme.foreground)
          }
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
    .padding(24)
    .background(ZenbuTheme.row)
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
        .foregroundStyle(ZenbuTheme.foreground)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityLabel)
    .accessibilityIdentifier(identifier)
  }
}

private struct KanjiReadingsSection: View {
  let reference: KanjiReferenceEntry
  let relatedWords: [DictionaryEntry]
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    VStack(spacing: 0) {
      KanjiSectionHeader(title: "READINGS")
      VStack(spacing: 0) {
        ForEach(reference.readings, id: \.self) { reading in
          let matches = words(matching: reading)
          if let destination = matches.first {
            Button {
              openWord(destination)
            } label: {
              KanjiReadingRow(reading: reading, words: matches)
            }
            .buttonStyle(.plain)
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
      .background(ZenbuTheme.row)
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
    HStack(alignment: .top, spacing: 14) {
      Text(reading.kind.label)
        .font(.body.weight(.semibold))
        .foregroundStyle(ZenbuTheme.foreground)
        .frame(minWidth: 48, alignment: .leading)
      VStack(alignment: .leading, spacing: 5) {
        Text(reading.value)
          .font(.headline)
          .foregroundStyle(
            words.isEmpty ? ZenbuTheme.foreground : ZenbuTheme.interactiveForeground
          )
        if !words.isEmpty {
          Text(words.map { "\($0.headword) · \($0.summary)" }.joined(separator: "   "))
            .font(.body)
            .foregroundStyle(ZenbuTheme.foreground)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 8)
      if !words.isEmpty {
        Image(systemName: "chevron.right")
          .foregroundStyle(ZenbuTheme.foreground)
          .accessibilityHidden(true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .padding(.vertical, 9)
    .contentShape(Rectangle())
    .overlay(alignment: .bottom) {
      Rectangle().fill(ZenbuTheme.divider).frame(height: 0.5)
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
  let openElement: (KanjiElementID) -> Void

  var body: some View {
    VStack(spacing: 0) {
      KanjiSectionHeader(title: "ELEMENTS")
      ForEach(elements) { element in
        Button {
          openElement(element.id)
        } label: {
          HStack(spacing: 18) {
            Text(element.id.rawValue)
              .font(.system(size: elementGlyphSize, weight: .light))
              .frame(minWidth: 72, minHeight: 72)
              .background(ZenbuTheme.accent.opacity(0.35))
            VStack(alignment: .leading, spacing: 6) {
              Text(element.role.label)
                .font(.body.weight(.semibold))
                .foregroundStyle(ZenbuTheme.foreground)
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
            Spacer()
            Image(systemName: "chevron.right")
              .foregroundStyle(ZenbuTheme.foreground)
              .accessibilityHidden(true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 20)
          .padding(.vertical, 10)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          "Element \(element.id.rawValue), \(element.role.label.lowercased()), "
            + element.meanings.prefix(3).joined(separator: ", ")
        )
        .accessibilityIdentifier("kanji-detail.element.\(element.id.rawValue)")
        .id(element.id)
        Divider().overlay(ZenbuTheme.divider)
      }
      .background(ZenbuTheme.row)
    }
  }
}

private struct KanjiComponentsSummarySection: View {
  let components: [String]

  var body: some View {
    VStack(spacing: 0) {
      KanjiSectionHeader(title: "COMPONENTS")
      Text(components.joined(separator: " · "))
        .font(.title3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(ZenbuTheme.row)
        .accessibilityIdentifier("kanji-detail.elements")
    }
  }
}

private struct KanjiWordsSection: View {
  let entries: [DictionaryEntry]
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    VStack(spacing: 0) {
      KanjiSectionHeader(title: "WORDS")
      ForEach(entries) { entry in
        Button {
          openWord(entry)
        } label: {
          HStack(spacing: 14) {
            JapaneseRubyText(
              surface: entry.headword,
              reading: entry.reading,
              baseFont: .title3,
              rubyFont: .body
            )
            .foregroundStyle(ZenbuTheme.foreground)
            Spacer()
            Text(entry.summary)
              .foregroundStyle(ZenbuTheme.foreground)
              .fixedSize(horizontal: false, vertical: true)
              .multilineTextAlignment(.trailing)
            Image(systemName: "chevron.right")
              .foregroundStyle(ZenbuTheme.foreground)
              .accessibilityHidden(true)
          }
          .padding(.horizontal, 20)
          .padding(.vertical, 12)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(entry.headword), \(entry.reading), \(entry.summary)")
        .accessibilityIdentifier("kanji-detail.word.\(entry.id.rawValue)")
        .id(entry.id)
        Divider().overlay(ZenbuTheme.divider)
      }
    }
  }
}

struct KanjiSectionHeader: View {
  let title: String

  var body: some View {
    Text(title)
      .font(.body.weight(.semibold))
      .foregroundStyle(ZenbuTheme.foreground)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 20)
      .padding(.top, 22)
      .padding(.bottom, 10)
      .background(ZenbuTheme.background)
  }
}
