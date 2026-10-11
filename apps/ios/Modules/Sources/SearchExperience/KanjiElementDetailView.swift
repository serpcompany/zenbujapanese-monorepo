import SwiftUI

struct KanjiElementDetailView: View {
  let elementID: KanjiElementID
  let lookupClient: KanjiLookupClient
  let preservedContribution: KanjiCharacter?

  @State private var loadState = KanjiElementDetailLoadState.loading
  @State private var retryID = 0

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section {
          KanjiElementHeader(elementID: elementID, page: page)
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
        case .loaded(let page):
          KanjiElementContent(page: page)
        }
      }
      .groupedList()
      .accessibilityIdentifier("kanji-element.screen")
      .onAppear { restorePreservedContribution(with: proxy) }
      .onChange(of: containingCharacters) {
        restorePreservedContribution(with: proxy)
      }
    }
    .navigationTitle("Element")
    .inlineNavigationTitle()
    .task(id: KanjiElementDetailLoadRequest(id: elementID, retryID: retryID)) {
      loadPage()
    }
  }

  private var page: KanjiElementPage? {
    guard case .loaded(let page) = loadState else { return nil }
    return page
  }

  private var containingCharacters: [KanjiCharacter] {
    page?.containing.map(\.character) ?? []
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

  private func loadPage() {
    do {
      if let page = try lookupClient.element(elementID) {
        loadState = .loaded(page)
      } else {
        loadState = .missing
      }
    } catch {
      loadState = .failed
    }
  }
}

private struct KanjiElementHeader: View {
  @ScaledMetric(relativeTo: .largeTitle) private var glyphSize = 108.0

  let elementID: KanjiElementID
  let page: KanjiElementPage?

  var body: some View {
    VStack(spacing: 16) {
      Text(elementID.rawValue)
        .font(.system(size: glyphSize, weight: .light))
        .accessibilityIdentifier("kanji-element.glyph")
      if let page, !page.meanings.isEmpty {
        Text(page.meanings.joined(separator: ", "))
          .font(.title3.weight(.semibold))
          .multilineTextAlignment(.center)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 8)
  }
}

private struct KanjiElementContent: View {
  let page: KanjiElementPage

  var body: some View {
    let alternatives = page.alternatives.compactMap(KanjiElementID.init)
    if !alternatives.isEmpty {
      Section("ALTERNATIVE FORMS") {
        ForEach(alternatives, id: \.rawValue.unicodeScalars.first?.value) { alternative in
          NavigationLink(value: SearchExperienceRoute.kanjiElement(alternative)) {
            Text(alternative.rawValue)
              .font(.title3)
          }
          .accessibilityLabel("Alternative element \(alternative.rawValue)")
          .accessibilityIdentifier("kanji-element.alternative.\(alternative.rawValue)")
        }
      }
    }

    if let explanation = page.explanation {
      Section {
        Text(explanation)
          .accessibilityIdentifier("kanji-element.meaning-explanation")
      } header: {
        Text("MEANING / STRUCTURE")
          .accessibilityIdentifier("kanji-element.meaning-header")
      }
    }

    if let soundPatterns = page.soundPatterns {
      Section("SOUND PATTERNS") {
        Text(soundPatterns)
      }
    }

    if let standalone = page.standalone {
      Section("AS A STANDALONE KANJI") {
        KanjiContributionRow(
          contribution: standalone,
          identifierPrefix: "kanji-element.standalone"
        )
      }
    }

    if !page.containing.isEmpty {
      Section("KANJI CONTAINING THIS ELEMENT") {
        ForEach(page.containing) { contribution in
          KanjiContributionRow(
            contribution: contribution,
            identifierPrefix: "kanji-element.contribution"
          )
        }
      }
    }

    Section("SOURCE") {
      LabeledContent("Structure") {
        Text(page.structureSource)
          .multilineTextAlignment(.trailing)
          .accessibilityIdentifier("kanji-element.structure-source")
      }
      LabeledContent("Meanings and readings") {
        Text(page.metadataSource)
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

  let contribution: KanjiElementPage.Kanji
  let identifierPrefix: String

  var body: some View {
    NavigationLink(value: SearchExperienceRoute.kanji(contribution.character, nil)) {
      HStack(spacing: 18) {
        Text(contribution.character.rawValue)
          .font(.system(size: glyphSize, weight: .light))
          .frame(minWidth: 64)
        VStack(alignment: .leading, spacing: 5) {
          if !contribution.meanings.isEmpty {
            Text(contribution.meanings.joined(separator: ", "))
              .lineLimit(2)
          }
          if !contribution.onReadings.isEmpty {
            Text(contribution.onReadings.joined(separator: ", "))
              .font(.caption)
          }
        }
      }
    }
    .accessibilityLabel(contribution.spoken)
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
  case loaded(KanjiElementPage)
  case missing
  case failed
}
