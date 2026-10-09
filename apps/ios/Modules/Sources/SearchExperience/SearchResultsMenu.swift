import SwiftUI

struct SearchResultsMenu: View {
  @Binding var sort: SearchResultSort
  let appliedSort: SearchResultSort
  let dictionaries: [FrequencyPackDisclosure]

  var body: some View {
    SearchActionsMenu {
      Menu {
        sortKeyPicker
        orderPicker
      } label: {
        Label("Sort By", systemImage: "arrow.up.arrow.down")
        Text(appliedSort.summary(dictionaries: dictionaries))
      }
      .accessibilityIdentifier("search.sort-menu")
    }
  }

  private var sortKeyPicker: some View {
    Picker(
      "Sort By",
      selection: Binding(
        get: { appliedSort.key },
        set: { key in
          if key != appliedSort.key { sort = key.initialSort }
        })
    ) {
      Text(SearchResultSort.relevanceTitle).tag(SearchResultSortKey.relevance)
      ForEach(dictionaries, id: \.id) { dictionary in
        Text(dictionary.sortName).tag(SearchResultSortKey.frequency(family: dictionary.id.family))
      }
      Text(SearchResultSort.knownWordsTitle).tag(SearchResultSortKey.knownWords)
    }
    .pickerStyle(.inline)
  }

  @ViewBuilder
  private var orderPicker: some View {
    switch appliedSort {
    case .relevance:
      EmptyView()
    case .frequency(let family, let direction):
      Picker(
        "Order",
        selection: Binding(get: { direction }, set: { sort = .frequency(family: family, $0) })
      ) {
        ForEach(FrequencySortDirection.allCases, id: \.self) { Text($0.title).tag($0) }
      }
      .pickerStyle(.inline)
    case .knownWords(let direction):
      Picker("Order", selection: Binding(get: { direction }, set: { sort = .knownWords($0) })) {
        ForEach(KnownWordSortDirection.allCases, id: \.self) { Text($0.title).tag($0) }
      }
      .pickerStyle(.inline)
    }
  }
}

struct SearchActionsMenu<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    Menu {
      content
    } label: {
      Label("Search Actions", systemImage: "ellipsis")
    }
    .accessibilityIdentifier("search.actions-menu")
  }
}

struct SearchResultsStatusRow: View {
  let text: String
  let systemImage: String
  let actionTitle: String
  let action: () -> Void

  var body: some View {
    HStack {
      Label(text, systemImage: systemImage)
        .foregroundStyle(.secondary)
      Spacer()
      Button(actionTitle, action: action)
        .buttonStyle(.borderless)
    }
    .font(.footnote)
    .listRowSeparator(.hidden)
  }
}
