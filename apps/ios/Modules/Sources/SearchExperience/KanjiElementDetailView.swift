import SwiftUI

struct KanjiElementDetailView: View {
  let elementID: KanjiElementID
  let lookupClient: KanjiElementLookupClient
  let preservedContribution: KanjiCharacter?

  @State private var loadState = KanjiElementDetailLoadState.loading
  @State private var retryID = 0

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section {
          KanjiElementHeader(elementID: elementID, entry: entry)
        }

        switch loadState {
        case .loading:
          Section {
            HStack {
              Spacer()
              ProgressView("Loading element reference…")
              Spacer()
            }
            .padding(.vertical, 16)
          }
        case .missing:
          Section {
            ContentUnavailableView(
              "No Element Reference",
              systemImage: "square.dashed",
              description: Text("No source-backed reference is available for this element.")
            )
          }
        case .failed:
          Section {
            ContentUnavailableView {
              Label("Element reference unavailable", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
            } description: {
              Text("Zenbu couldn't open its offline element reference.")
            } actions: {
              Button("Retry", action: retry)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("kanji-element.retry")
            }
          }
        case .loaded(let entry):
          KanjiElementContent(entry: entry)
        }
      }
      .listStyle(.insetGrouped)
      .accessibilityIdentifier("kanji-element.screen")
      .onAppear { restorePreservedContribution(with: proxy) }
      .onChange(of: containingCharacters) {
        restorePreservedContribution(with: proxy)
      }
    }
    .navigationTitle("Element")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: KanjiElementDetailLoadRequest(id: elementID, retryID: retryID)) {
      await loadEntry()
    }
  }

  private var entry: KanjiElementEntry? {
    guard case .loaded(let entry) = loadState else { return nil }
    return entry
  }

  private var containingCharacters: [KanjiCharacter] {
    entry?.containingKanji.map(\.character) ?? []
  }

  private func retry() { retryID += 1 }

  private func restorePreservedContribution(with proxy: ScrollViewProxy) {
    guard let preservedContribution, containingCharacters.contains(preservedContribution) else {
      return
    }
    Task { @MainActor in
      await Task.yield()
      guard containingCharacters.contains(preservedContribution) else { return }
      proxy.scrollTo(preservedContribution, anchor: .center)
    }
  }

  private func loadEntry() async {
    loadState = .loading
    do {
      if let entry = try await lookupClient.entry(elementID) {
        guard !Task.isCancelled else { return }
        loadState = .loaded(entry)
      } else {
        guard !Task.isCancelled else { return }
        loadState = .missing
      }
    } catch is CancellationError {
      return
    } catch {
      guard !Task.isCancelled else { return }
      loadState = .failed
    }
  }
}

private struct KanjiElementHeader: View {
  @ScaledMetric(relativeTo: .largeTitle) private var glyphSize = 108.0

  let elementID: KanjiElementID
  let entry: KanjiElementEntry?

  var body: some View {
    VStack(spacing: 16) {
      Text(elementID.rawValue)
        .font(.system(size: glyphSize, weight: .light))
        .accessibilityIdentifier("kanji-element.glyph")
      if let meanings = entry?.headerMeanings {
        Text(meanings)
          .font(.title3.weight(.semibold))
          .multilineTextAlignment(.center)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 8)
  }
}

private struct KanjiElementContent: View {
  let entry: KanjiElementEntry

  // The sections come from `entry.sections`, which the conformance suite records, so the suite
  // records the order and choice of sections this view draws.
  var body: some View {
    ForEach(entry.sections, id: \.self) { section in
      content(for: section)
    }
  }

  @ViewBuilder
  private func content(for section: KanjiElementSection) -> some View {
    switch section {
    case .alternativeForms:
      Section(section.title) {
        ForEach(entry.alternatives, id: \.self) { alternative in
          NavigationLink(value: SearchExperienceRoute.kanjiElement(alternative)) {
            Text(alternative.rawValue)
              .font(.title3)
          }
          .accessibilityLabel("Alternative element \(alternative.rawValue)")
          .accessibilityIdentifier("kanji-element.alternative.\(alternative.rawValue)")
        }
      }
    case .meaningStructure:
      if let explanation = entry.meaningExplanation {
        Section {
          Text(explanation)
            .accessibilityIdentifier("kanji-element.meaning-explanation")
        } header: {
          Text(section.title)
            .accessibilityIdentifier("kanji-element.meaning-header")
        }
      }
    case .soundPatterns:
      if let soundPatterns = entry.soundPatterns {
        Section(section.title) {
          Text(soundPatterns)
        }
      }
    case .standaloneKanji:
      if let standalone = entry.standaloneKanji {
        Section(section.title) {
          KanjiContributionRow(
            contribution: standalone,
            identifierPrefix: "kanji-element.standalone"
          )
        }
      }
    case .containingKanji:
      Section(section.title) {
        ForEach(entry.containingKanji) { contribution in
          KanjiContributionRow(
            contribution: contribution,
            identifierPrefix: "kanji-element.contribution"
          )
        }
      }
    case .source:
      Section(section.title) {
        LabeledContent("Structure") {
          Text(entry.structureProvenance.text)
            .multilineTextAlignment(.trailing)
            .accessibilityIdentifier("kanji-element.structure-source")
        }
        LabeledContent("Meanings and readings") {
          Text(entry.metadataProvenance.text)
            .multilineTextAlignment(.trailing)
            .accessibilityIdentifier("kanji-element.metadata-source")
        }
        Text(KanjiElementEntry.sourceNote)
          .font(.caption)
      }
    }
  }
}

private struct KanjiContributionRow: View {
  @ScaledMetric(relativeTo: .title) private var glyphSize = 48.0

  let contribution: KanjiElementContribution
  let identifierPrefix: String

  var body: some View {
    NavigationLink(value: SearchExperienceRoute.kanji(contribution.character, nil)) {
      HStack(spacing: 18) {
        Text(contribution.character.rawValue)
          .font(.system(size: glyphSize, weight: .light))
          .frame(minWidth: 64)
        VStack(alignment: .leading, spacing: 5) {
          if let meanings = contribution.rowMeanings {
            Text(meanings)
              .lineLimit(2)
          }
          if let readings = contribution.rowReadings {
            Text(readings)
              .font(.caption)
          }
        }
      }
    }
    .accessibilityLabel(
      ([contribution.character.rawValue] + contribution.meanings + contribution.onReadings)
        .joined(separator: ", ")
    )
    .accessibilityIdentifier("\(identifierPrefix).\(contribution.character.rawValue)")
    .id(contribution.character)
  }
}

// The element screen's words, shared by the view and the kanji-element-detail conformance suite,
// so the website's element pages are held to the app's (see also
// apps/web/src/lib/dictionary/detail/element.ts).

/// The element screen's sections, in order; each shows only when it has something to show.
enum KanjiElementSection: CaseIterable, Hashable {
  case alternativeForms
  case meaningStructure
  case soundPatterns
  case standaloneKanji
  case containingKanji
  case source

  var title: String {
    switch self {
    case .alternativeForms: "ALTERNATIVE FORMS"
    case .meaningStructure: "MEANING / STRUCTURE"
    case .soundPatterns: "SOUND PATTERNS"
    case .standaloneKanji: "AS A STANDALONE KANJI"
    case .containingKanji: "KANJI CONTAINING THIS ELEMENT"
    case .source: "SOURCE"
    }
  }
}

extension KanjiElementEntry {
  /// The meanings under the glyph at the top of the screen.
  var headerMeanings: String? { meanings.isEmpty ? nil : meanings.joined(separator: ", ") }

  var meaningExplanation: String? {
    meanings.isEmpty
      ? nil : "This element contributes forms associated with \(meanings.joined(separator: ", "))."
  }

  var soundPatterns: String? {
    commonLinkedOnReadings.isEmpty
      ? nil : "Linked on-readings: \(commonLinkedOnReadings.joined(separator: ", "))"
  }

  /// The sections the screen shows, in order.
  var sections: [KanjiElementSection] {
    KanjiElementSection.allCases.filter { section in
      switch section {
      case .alternativeForms: !alternatives.isEmpty
      case .meaningStructure: meaningExplanation != nil
      case .soundPatterns: soundPatterns != nil
      case .standaloneKanji: standaloneKanji != nil
      case .containingKanji: !containingKanji.isEmpty
      case .source: true
      }
    }
  }

  static let sourceNote =
    "Both sources are independently normalized into Zenbu Japanese Language Reference Data."
}

extension KanjiElementProvenance {
  /// The source and its snapshot, as the Source section names it.
  var text: String { "\(sourceIdentity) \(sourceSnapshot)" }
}

extension KanjiElementContribution {
  /// Up to three meanings, as a kanji's row shows them.
  var rowMeanings: String? { meanings.isEmpty ? nil : meanings.prefix(3).joined(separator: ", ") }

  /// The kanji's on-readings, under its meanings.
  var rowReadings: String? { onReadings.isEmpty ? nil : onReadings.joined(separator: ", ") }
}

private struct KanjiElementDetailLoadRequest: Hashable {
  let id: KanjiElementID
  let retryID: Int
}

private enum KanjiElementDetailLoadState: Equatable {
  case loading
  case loaded(KanjiElementEntry)
  case missing
  case failed
}
