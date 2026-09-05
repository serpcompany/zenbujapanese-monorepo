import SwiftUI

struct RecentSearchHistoryView: View {
  let recentSearchStore: RecentSearchStore
  let refreshID: Int
  let requestClearAll: () -> Void
  let selectSearch: (SearchQuery) -> Void
  @State private var searches: [SearchQuery] = []

  var body: some View {
    List {
      if !searches.isEmpty {
        Section {
          HStack {
            Spacer()
            Button("Clear All", action: requestClearAll)
              .frame(minHeight: 44)
              .accessibilityIdentifier("recent-search.clear-all")
          }
          ForEach(Array(searches.enumerated()), id: \.element) { index, search in
            Button {
              selectSearch(search)
            } label: {
              Label {
                Text(search.value)
              } icon: {
                Image(systemName: "clock.arrow.circlepath")
              }
            }
            .accessibilityLabel(search.value)
            .accessibilityValue("Recent search \(index + 1)")
            .accessibilityIdentifier("recent-search.\(index)")
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
              Button("Delete", role: .destructive) {
                remove(search)
              }
            }
          }
        }
      }
    }
    .listStyle(.plain)
    .task(id: refreshID) {
      await reload()
    }
  }

  private func remove(_ search: SearchQuery) {
    Task {
      await recentSearchStore.remove(search)
      await reload()
    }
  }

  @MainActor
  private func reload() async {
    searches = await recentSearchStore.load()
  }
}
