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
              HStack {
                Image(systemName: "clock.arrow.circlepath")
                  .foregroundStyle(ZenbuTheme.secondaryText)
                Text(search.value)
                  .foregroundStyle(ZenbuTheme.foreground)
                  .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                  .foregroundStyle(ZenbuTheme.mutedForeground.opacity(0.25))
              }
              .padding(.horizontal, 18)
              .frame(height: 52)
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
            .listRowBackground(ZenbuTheme.background)
            .listRowSeparatorTint(ZenbuTheme.divider)
          }
        } header: {
          HStack {
            Text("Recent Searches")
            Spacer()
            Button("Clear All", action: requestClearAll)
              .accessibilityIdentifier("recent-search.clear-all")
          }
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(ZenbuTheme.secondaryText)
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
