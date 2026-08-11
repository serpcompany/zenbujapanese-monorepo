import SwiftUI

struct RecentSearchHistoryView: View {
  let recentSearchStore: RecentSearchStore
  let selectSearch: (SearchQuery) -> Void
  @State private var searches: [SearchQuery] = []
  @State private var isConfirmingClearAll = false

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
                  .foregroundStyle(ReplicaPalette.secondaryText)
                Text(search.value)
                  .foregroundStyle(.white)
                  .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                  .foregroundStyle(.white.opacity(0.25))
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
            }
            .listRowBackground(Color.black)
            .listRowSeparatorTint(ReplicaPalette.divider)
          }
        } header: {
          HStack {
            Text("Recent Searches")
            Spacer()
            Button("Clear All") {
              isConfirmingClearAll = true
            }
            .accessibilityIdentifier("recent-search.clear-all")
          }
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(ReplicaPalette.secondaryText)
          .textCase(nil)
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(.black)
    .task {
      await reload()
    }
    .alert("Clear Recent Searches?", isPresented: $isConfirmingClearAll) {
      Button("Cancel", role: .cancel) {}
      Button("Clear All", role: .destructive) {
        clearAll()
      }
    } message: {
      Text("This removes every recent Search query from this device.")
    }
  }

  private func remove(_ search: SearchQuery) {
    Task {
      await recentSearchStore.remove(search)
      await reload()
    }
  }

  private func clearAll() {
    Task {
      await recentSearchStore.removeAll()
      await reload()
    }
  }

  @MainActor
  private func reload() async {
    searches = await recentSearchStore.load()
  }
}
