import SwiftUI

struct SearchResultsMenu: View {
  @Binding var sort: SearchResultSort
  let appliedSort: SearchResultSort
  @Binding var filter: SearchResultFilter
  let appliedFilter: SearchResultFilter
  let dictionaries: [FrequencyPackDisclosure]

  var body: some View {
    Menu {
      sortKeyPicker
      orderPicker
      filterPickers
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
    return appliedFilter.statusSuffix.map { "\(sortStatus) · \($0)" } ?? sortStatus
  }

  @ViewBuilder
  private var filterPickers: some View {
    Section("Filter") {
      Picker(selection: wordsBinding) {
        ForEach(KnownWordFilter.allCases, id: \.self) { Text($0.title).tag($0) }
      } label: {
        Text("Words")
        Text(appliedFilter.words.title)
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("search.filter.words")
    }
    Section {
      Picker(selection: dictionaryBinding) {
        Text(SearchResultFilter.allTitle).tag(String?.none)
        ForEach(dictionaries, id: \.id) { dictionary in
          Text(dictionary.sortName).tag(Optional(dictionary.id.family))
        }
      } label: {
        Text("Frequency Dictionaries")
        Text(dictionaryTitle)
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("search.filter.dictionary")
    }
  }

  private var dictionaryTitle: String {
    dictionaries.first { $0.id.family == appliedFilter.dictionaryFamily }?.sortName
      ?? SearchResultFilter.allTitle
  }

  private var wordsBinding: Binding<KnownWordFilter> {
    Binding(get: { appliedFilter.words }, set: { filter.words = $0 })
  }

  private var dictionaryBinding: Binding<String?> {
    Binding(get: { appliedFilter.dictionaryFamily }, set: { filter.dictionaryFamily = $0 })
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
    .labelsVisibility(.visible)
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
