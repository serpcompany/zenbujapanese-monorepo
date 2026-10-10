import SwiftUI

struct SearchResultsMenu: View {
  @Binding var sort: SearchResultSort
  let appliedSort: SearchResultSort
  @Binding var filter: SearchResultFilter
  let dictionaries: [FrequencyPackDisclosure]

  var body: some View {
    Menu {
      sortPicker
      filterPicker
    } label: {
      HStack(spacing: 4) {
        Label(status, systemImage: "arrow.up.arrow.down")
        Image(systemName: "chevron.down")
          .imageScale(.small)
          .accessibilityHidden(true)
      }
      .font(.footnote)
      .foregroundStyle(.secondary)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("search.sort-menu")
  }

  private var status: String {
    let sortStatus = appliedSort.status(dictionaries: dictionaries)
    return filter.statusSuffix.map { "\(sortStatus) · \($0)" } ?? sortStatus
  }

  private var sortPicker: some View {
    Picker(selection: Binding(get: { appliedSort }, set: { sort = $0 })) {
      Text(SearchResultSort.relevanceTitle).tag(SearchResultSort.relevance)
      ForEach(dictionaries, id: \.id) { dictionary in
        Text(dictionary.sortName).tag(SearchResultSort.frequency(family: dictionary.id.family))
      }
      Text(SearchResultSort.knownWordsTitle).tag(SearchResultSort.knownWords)
    } label: {
      Text("Sort By")
      Text(appliedSort.summary(dictionaries: dictionaries))
    }
    .pickerStyle(.menu)
    .accessibilityIdentifier("search.sort-by")
  }

  private var filterPicker: some View {
    Picker(selection: $filter) {
      ForEach(SearchResultFilter.allCases, id: \.self) { Text($0.title).tag($0) }
    } label: {
      Text("Filter")
      Text(filter.title)
    }
    .pickerStyle(.menu)
    .accessibilityIdentifier("search.filter.words")
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
