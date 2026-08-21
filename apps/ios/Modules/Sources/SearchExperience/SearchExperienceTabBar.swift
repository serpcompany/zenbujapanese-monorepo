import SwiftUI

enum SearchExperienceLayout {
  static let bottomNavigationContentClearance: CGFloat = 64
}

struct SearchExperienceTabBar: View {
  let select: (SearchExperienceTab) -> Void

  var body: some View {
    HStack {
      TabItem(tab: .search, symbol: "magnifyingglass", selected: true, select: select)
      Spacer()
      TabItem(tab: .settings, symbol: "gearshape", selected: false, select: select)
    }
    .padding(.horizontal, 42)
    .padding(.vertical, 7)
    .frame(minHeight: 62)
    .background(ZenbuTheme.card.ignoresSafeArea())
    .overlay(alignment: .top) {
      Rectangle().fill(ZenbuTheme.border).frame(height: 0.5)
    }
  }
}

enum SearchExperienceTab: String, CaseIterable {
  case search = "Search"
  case settings = "Settings"
}

private struct TabItem: View {
  let tab: SearchExperienceTab
  let symbol: String
  let selected: Bool
  let select: (SearchExperienceTab) -> Void

  var body: some View {
    Button {
      select(tab)
    } label: {
      VStack(spacing: 2) {
        Image(systemName: symbol)
          .font(.system(size: 23, weight: .regular))
        Text(tab.rawValue)
          .font(.caption2)
      }
      .foregroundStyle(
        selected ? ZenbuTheme.interactiveForeground : ZenbuTheme.mutedForeground
      )
      .frame(minWidth: 52)
    }
    .buttonStyle(.plain)
    .frame(minWidth: 52, minHeight: 48)
    .contentShape(Rectangle())
    .accessibilityLabel(tab.rawValue)
    .accessibilityIdentifier("search-experience-tab.\(tab.rawValue.lowercased())")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
