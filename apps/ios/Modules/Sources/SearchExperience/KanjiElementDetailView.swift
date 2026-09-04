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
      if let entry, !entry.meanings.isEmpty {
        Text(entry.meanings.joined(separator: ", "))
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

  var body: some View {
    if !entry.alternatives.isEmpty {
      Section("ALTERNATIVE FORMS") {
        ForEach(entry.alternatives, id: \.self) { alternative in
          NavigationLink(value: SearchExperienceRoute.kanjiElement(alternative)) {
            Text(alternative.rawValue)
              .font(.title3)
          }
          .accessibilityLabel("Alternative element \(alternative.rawValue)")
          .accessibilityIdentifier("kanji-element.alternative.\(alternative.rawValue)")
        }
      }
    }

    if !entry.meanings.isEmpty {
      Section {
        Text(
          "This element contributes forms associated with \(entry.meanings.joined(separator: ", "))."
        )
        .accessibilityIdentifier("kanji-element.meaning-explanation")
      } header: {
        Text("MEANING / STRUCTURE")
          .accessibilityIdentifier("kanji-element.meaning-header")
      }
    }

    if !entry.commonLinkedOnReadings.isEmpty {
      Section("SOUND PATTERNS") {
        Text("Linked on-readings: \(entry.commonLinkedOnReadings.joined(separator: ", "))")
      }
    }

    if let standalone = entry.standaloneKanji {
      Section("AS A STANDALONE KANJI") {
        KanjiContributionRow(
          contribution: standalone,
          identifierPrefix: "kanji-element.standalone"
        )
      }
    }

    if !entry.containingKanji.isEmpty {
      Section("KANJI CONTAINING THIS ELEMENT") {
        ForEach(entry.containingKanji) { contribution in
          KanjiContributionRow(
            contribution: contribution,
            identifierPrefix: "kanji-element.contribution"
          )
        }
      }
    }

    Section("SOURCE") {
      LabeledContent("Structure") {
        Text(
          "\(entry.structureProvenance.sourceIdentity) \(entry.structureProvenance.sourceSnapshot)"
        )
        .multilineTextAlignment(.trailing)
        .accessibilityIdentifier("kanji-element.structure-source")
      }
      LabeledContent("Meanings and readings") {
        Text(
          "\(entry.metadataProvenance.sourceIdentity) \(entry.metadataProvenance.sourceSnapshot)"
        )
        .multilineTextAlignment(.trailing)
        .accessibilityIdentifier("kanji-element.metadata-source")
      }
      Text("Both sources are independently normalized into Zenbu Japanese Language Reference Data.")
        .font(.caption)
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
          if !contribution.meanings.isEmpty {
            Text(contribution.meanings.prefix(3).joined(separator: ", "))
              .lineLimit(2)
          }
          if !contribution.onReadings.isEmpty {
            Text(contribution.onReadings.joined(separator: ", "))
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
