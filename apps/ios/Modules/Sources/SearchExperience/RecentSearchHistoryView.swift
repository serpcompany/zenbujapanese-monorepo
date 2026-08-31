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
          ForEach(Array(searches.enumerated()), id: \.element) { index, search in
            Button {
              selectSearch(search)
            } label: {
              Label {
                Text(search.value)
              } icon: {
                Image(systemName: "clock.arrow.circlepath")
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(search.value)
            .accessibilityValue("Recent search \(index + 1)")
            .accessibilityIdentifier("recent-search.\(index)")
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
              Button("Delete", role: .destructive) {
                remove(search)
              }
              .tint(ZenbuTheme.destructiveActionTint)
            }
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
          }
        } header: {
          HStack {
            Text("Recent Searches")
            Spacer()
            Button("Clear All", action: requestClearAll)
              .accessibilityIdentifier("recent-search.clear-all")
          }
          .textCase(nil)
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(ZenbuTheme.background)
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
