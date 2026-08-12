import SwiftUI

struct ReplicaTabBar: View {
  let select: (ReplicaTab) -> Void

  var body: some View {
    HStack {
      TabItem(tab: .search, symbol: "magnifyingglass", selected: true, select: select)
      Spacer()
      TabItem(tab: .clippings, symbol: "list.bullet.rectangle", selected: false, select: select)
      Spacer()
      TabItem(tab: .flashcards, symbol: "rectangle.on.rectangle", selected: false, select: select)
      Spacer()
      TabItem(tab: .settings, symbol: "gearshape", selected: false, select: select)
    }
    .padding(.horizontal, 42)
    .padding(.vertical, 7)
    .frame(minHeight: 62)
    .background(ReplicaPalette.row.ignoresSafeArea())
    .overlay(alignment: .top) {
      Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5)
    }
  }
}

enum ReplicaTab: String, CaseIterable {
  case search = "Search"
  case clippings = "Clippings"
  case flashcards = "Flashcards"
  case settings = "Settings"
}

private struct TabItem: View {
  let tab: ReplicaTab
  let symbol: String
  let selected: Bool
  let select: (ReplicaTab) -> Void

  var body: some View {
    Button { select(tab) } label: {
      VStack(spacing: 2) {
        Image(systemName: symbol)
          .font(.system(size: 23, weight: .regular))
        Text(tab.rawValue)
          .font(.system(size: 10))
      }
      .foregroundStyle(selected ? ReplicaPalette.selectedTab : .white.opacity(0.42))
      .frame(minWidth: 52)
    }
    .buttonStyle(.plain)
    .frame(minWidth: 52, minHeight: 48)
    .contentShape(Rectangle())
    .accessibilityLabel(tab.rawValue)
    .accessibilityIdentifier("replica-tab.\(tab.rawValue.lowercased())")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
