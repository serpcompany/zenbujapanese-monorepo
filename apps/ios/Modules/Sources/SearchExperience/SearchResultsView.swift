import SwiftUI

struct SearchResultsView: View {
  let query: SearchQuery
  let results: LookupSearchResults
  let exampleCount: Int
  let rankedEntryLimit: Int?
  let frequencyCapability: FrequencyCapability
  let frequencyRefreshID: Int
  let selectRefinement: (SearchRefinement) -> Void
  @State private var frequencyLoadState = SearchFrequencyLoadState()

  var body: some View {
    let orderedEntries = SearchResultFrequencyOrdering.ordered(
      results, entries: presentedEntries, ranks: frequencyLoadState.results)
    List {
      if exampleCount > 0 {
        Section {
          NavigationLink(
            value: SearchExperienceRoute.examples(
              query,
              results.primaryEntry(for: query),
              results.usesPrimaryEntryExamples
            )
          ) {
            Text(SearchResultsScreen.exampleActionTitle(count: exampleCount))
              .font(.headline)
          }
          .accessibilityIdentifier("search.examples")
        }
      }

      if let refinement = results.readingRefinement {
        Section {
          Button {
            selectRefinement(refinement)
          } label: {
            Text(SearchResultsScreen.readingRefinementTitle(refinement))
              .font(.headline)
          }
          .accessibilityLabel("Search for Japanese reading \(refinement.query.value)")
          .accessibilityIdentifier("search.reading-refinement")
        }
      }

      switch SearchResultsScreen.list(query: query, results: results, ordered: orderedEntries) {
      case .discoveredWords(let entries):
        Section {
          SearchListHeading(LocalizedStringKey(SearchResultsScreen.discoveredWordsHeading))
          resultRows(entries) { .discovered(position: $0 + 1, count: entries.count) }
        }
      case .ranked(let kanji, let entries):
        Section {
          if let kanji {
            KanjiPrimaryRow(
              character: kanji,
              entry: primaryKanjiEntry,
              resultCount: SearchResultsScreen.rankedCount(query: query, entries: entries)
            )
          }
          resultRows(entries) { index in
            .result(
              position: index + (kanji == nil ? 1 : 2),
              count: SearchResultsScreen.rankedCount(query: query, entries: entries)
            )
          }
          if let frequencyUnavailableNotice {
            Label(frequencyUnavailableNotice, systemImage: "info.circle")
              .font(.footnote)
              .foregroundStyle(.secondary)
              .listRowSeparator(.hidden)
              .accessibilityIdentifier("search.frequency-ordering-unavailable")
          }
        }
      case .none:
        EmptyView()
      }
    }
    .listStyle(.plain)
    .id(query)
    .accessibilityIdentifier("search.results")
    .task(id: frequencyTaskID) {
      let requestID = frequencyTaskID
      frequencyLoadState.begin(requestID)
      do {
        let response = try await SearchFrequencyLoader.load(
          requestID, using: frequencyCapability)
        _ = frequencyLoadState.commit(response.results, for: response.request)
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled else { return }
        _ = frequencyLoadState.commit(
          FrequencyLookupResult.unavailableResults(
            for: requestID.entryIDs, pack: nil, reason: "Frequency data unavailable"
          ).mapValues { [$0] },
          for: requestID
        )
      }
    }
  }

  private func resultRows(
    _ entries: [DictionaryEntry], rank: @escaping (Int) -> ResultRank
  ) -> some View {
    ForEach(entries.enumerated(), id: \.element.id) { index, entry in
      ResultRow(
        entry: entry,
        summary: results.displaySummary(for: entry),
        frequencyRanks: frequencyLoadState.results[entry.id],
        rank: rank(index),
        link: SearchExperienceRoute.word(entry, nil)
      )
    }
  }

  private var primaryKanjiEntry: DictionaryEntry? {
    results.primaryEntry(for: query)
  }

  private var displayedEntryIDs: [LanguageReferenceID] {
    SearchResultsScreen.displayedEntryIDs(presentedEntries)
  }

  private var presentedEntries: [DictionaryEntry] {
    SearchResultsScreen.presentedEntries(results, rankedEntryLimit: rankedEntryLimit)
  }

  private var frequencyTaskID: SearchFrequencyTaskID {
    SearchFrequencyTaskID(entryIDs: displayedEntryIDs, refreshID: frequencyRefreshID)
  }

  private var frequencyUnavailableNotice: String? {
    SearchFrequencyUnavailableNotice.text(
      for: displayedEntryIDs.compactMap { frequencyLoadState.results[$0] })
  }
}

private struct KanjiPrimaryRow: View {
  let character: KanjiCharacter
  let entry: DictionaryEntry?
  let resultCount: Int

  var body: some View {
    NavigationLink(value: SearchExperienceRoute.kanji(character, entry)) {
      HStack(spacing: 10) {
        Text(character.rawValue)
          .font(.title.weight(.light))
        VStack(alignment: .leading, spacing: 3) {
          Text(SearchResultsScreen.kanjiLabel)
            .font(.caption2.weight(.bold))
            .foregroundStyle(.primary)
          Text(SearchResultsScreen.kanjiSummary(entry))
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(Rectangle())
    }
    .accessibilityLabel(
      "\(character.rawValue), \(SearchResultsScreen.kanjiLabel), "
        + SearchResultsScreen.kanjiSummary(entry))
    .accessibilityValue("Result 1 of \(resultCount), Kanji primary")
    .accessibilityIdentifier("result.kanji-primary.\(character.rawValue)")
  }
}
