import SwiftUI

struct SearchResultsMenu: View {
  let menu: ResultsMenuContent
  let chooseSort: (ResultsChoice) -> Void
  let chooseFilter: (ResultsChoice) -> Void

  var body: some View {
    OutsetHitTarget(fillsWidth: true) {
      status.hidden()
      menuButton
    }
  }

  private var status: some View {
    HStack(spacing: 4) {
      Label(menu.status, systemImage: "arrow.up.arrow.down")
      Image(systemName: "chevron.down")
        .imageScale(.small)
        .accessibilityHidden(true)
    }
    .font(.footnote)
    .foregroundStyle(.secondary)
  }

  private var menuButton: some View {
    Menu {
      picker(
        "Sort By", summary: menu.sort.summary, chosen: menu.sort.chosen,
        options: menu.sort.options, choose: chooseSort
      )
      .accessibilityIdentifier("search.sort-by")
      picker(
        "Filter", summary: menu.filter.title, chosen: menu.filter.chosen,
        options: menu.filter.options, choose: chooseFilter
      )
      .accessibilityIdentifier("search.filter.words")
    } label: {
      status
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("search.sort-menu")
  }

  private func picker(
    _ title: LocalizedStringKey, summary: String, chosen: String, options: [ResultsChoice],
    choose: @escaping (ResultsChoice) -> Void
  ) -> some View {
    Picker(
      selection: Binding(
        get: { chosen },
        set: { value in
          if let option = options.first(where: { $0.value == value }) { choose(option) }
        })
    ) {
      ForEach(options, id: \.value) { Text($0.title).tag($0.value) }
    } label: {
      Text(title)
      Text(summary)
    }
    .pickerStyle(.menu)
  }
}

struct SearchActionsMenu<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    Menu {
      content
    } label: {
      Label("Look Up Actions", systemImage: "ellipsis")
    }
    .accessibilityIdentifier("search.actions-menu")
  }
}
