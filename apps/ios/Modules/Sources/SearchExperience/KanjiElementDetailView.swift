import SwiftUI

struct KanjiElementDetailView: View {
  @Environment(\.dismiss) private var dismiss
  let elementID: KanjiElementID
  let lookupClient: KanjiElementLookupClient
  let openAlternative: (KanjiElementID) -> Void
  let openKanji: (KanjiCharacter) -> Void

  @State private var loadState = KanjiElementDetailLoadState.loading
  @State private var retryID = 0

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Button {
          dismiss()
        } label: {
          HStack(spacing: 4) {
            Image(systemName: "chevron.left")
            Text("Kanji")
          }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("kanji-element.back")
        Spacer()
        Text("Element")
          .font(.headline)
      }
      .font(.system(size: 17))
      .padding(.horizontal, 16)
      .frame(height: 49)
      .background(ZenbuTheme.chrome.ignoresSafeArea(edges: .top))

      ScrollView {
        VStack(spacing: 0) {
          header
          switch loadState {
          case .loading:
            ProgressView("Loading element reference…")
              .frame(maxWidth: .infinity)
              .padding(24)
          case .missing:
            Text("No element reference is available.")
              .foregroundStyle(ZenbuTheme.secondaryText)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(24)
          case .failed:
            VStack(spacing: 12) {
              Text("Element reference unavailable")
              Button("Retry") { retryID += 1 }
                .accessibilityIdentifier("kanji-element.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(24)
          case .loaded(let entry):
            content(entry)
          }
        }
        .padding(.bottom, SearchExperienceLayout.bottomNavigationContentClearance)
      }
      .accessibilityIdentifier("kanji-element.screen")
    }
    .background(ZenbuTheme.background)
    .toolbar(.hidden, for: .navigationBar)
    .task(id: KanjiElementDetailLoadRequest(id: elementID, retryID: retryID)) {
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

  private var header: some View {
    VStack(spacing: 16) {
      Text(elementID.rawValue)
        .font(.system(size: 108, weight: .light))
        .accessibilityIdentifier("kanji-element.glyph")
      if case .loaded(let entry) = loadState {
        if !entry.meanings.isEmpty {
          Text(entry.meanings.joined(separator: ", "))
            .font(.title3.weight(.semibold))
            .multilineTextAlignment(.center)
        }
        if !entry.alternatives.isEmpty {
          HStack(spacing: 10) {
            Text("Alternative")
              .font(.caption)
              .foregroundStyle(ZenbuTheme.secondaryText)
            ForEach(entry.alternatives, id: \.self) { alternative in
              Button(alternative.rawValue) { openAlternative(alternative) }
                .font(.title3)
                .accessibilityIdentifier("kanji-element.alternative.\(alternative.rawValue)")
            }
          }
        }
      }
    }
    .frame(maxWidth: .infinity)
    .padding(24)
    .background(ZenbuTheme.row)
  }

  @ViewBuilder
  private func content(_ entry: KanjiElementEntry) -> some View {
    if !entry.meanings.isEmpty {
      roleSection(
        title: "MEANING / STRUCTURE",
        text:
          "This element contributes forms associated with \(entry.meanings.joined(separator: ", "))."
      )
    }
    if !entry.commonLinkedOnReadings.isEmpty {
      roleSection(
        title: "SOUND PATTERNS",
        text: "Linked on-readings: \(entry.commonLinkedOnReadings.joined(separator: ", "))"
      )
    }
    if let standalone = entry.standaloneKanji {
      KanjiSectionHeader(title: "AS A STANDALONE KANJI")
      contributionRow(standalone, identifierPrefix: "kanji-element.standalone")
    }
    if !entry.containingKanji.isEmpty {
      KanjiSectionHeader(title: "KANJI CONTAINING THIS ELEMENT")
      ForEach(entry.containingKanji) { contribution in
        contributionRow(contribution, identifierPrefix: "kanji-element.contribution")
        Divider().overlay(ZenbuTheme.divider)
      }
    }
    VStack(alignment: .leading, spacing: 4) {
      Text("Source")
        .font(.caption.weight(.semibold))
      Text(
        "Structure: \(entry.structureProvenance.sourceIdentity) \(entry.structureProvenance.sourceSnapshot)"
      )
      .accessibilityIdentifier("kanji-element.structure-source")
      Text(
        "Meanings and readings: \(entry.metadataProvenance.sourceIdentity) \(entry.metadataProvenance.sourceSnapshot)"
      )
      .accessibilityIdentifier("kanji-element.metadata-source")
      Text("Both sources are independently normalized into Zenbu Japanese Language Reference Data.")
        .foregroundStyle(ZenbuTheme.secondaryText)
    }
    .font(.caption)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(20)
  }

  private func roleSection(title: String, text: String) -> some View {
    VStack(spacing: 0) {
      KanjiSectionHeader(title: title)
      Text(text)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(ZenbuTheme.row)
    }
  }

  private func contributionRow(
    _ contribution: KanjiElementContribution,
    identifierPrefix: String
  ) -> some View {
    Button {
      openKanji(contribution.character)
    } label: {
      HStack(spacing: 18) {
        Text(contribution.character.rawValue)
          .font(.system(size: 48, weight: .light))
          .frame(width: 64)
        VStack(alignment: .leading, spacing: 5) {
          if !contribution.meanings.isEmpty {
            Text(contribution.meanings.prefix(3).joined(separator: ", "))
              .lineLimit(2)
          }
          if !contribution.onReadings.isEmpty {
            Text(contribution.onReadings.joined(separator: ", "))
              .font(.caption)
              .foregroundStyle(ZenbuTheme.secondaryText)
          }
        }
        Spacer()
        Image(systemName: "chevron.right")
          .foregroundStyle(ZenbuTheme.mutedForeground)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      ([contribution.character.rawValue] + contribution.meanings + contribution.onReadings)
        .joined(separator: ", ")
    )
    .accessibilityIdentifier("\(identifierPrefix).\(contribution.character.rawValue)")
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
