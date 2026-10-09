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
      filterMenu
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

  private var filterMenu: some View {
    Menu {
      if appliedFilter.isOn {
        Button("Show All Words", systemImage: "line.3.horizontal.decrease.circle") {
          filter = .none
        }
        .accessibilityIdentifier("search.filter.show-all")
      }
      Section {
        Toggle(SearchResultFilter.knownWordsTitle, isOn: filterBinding(\.knownWords))
        Toggle(SearchResultFilter.unknownWordsTitle, isOn: filterBinding(\.unknownWords))
      }
      Section {
        ForEach(dictionaries, id: \.id) { dictionary in
          Toggle("In \(dictionary.sortName)", isOn: dictionaryBinding(dictionary.id.family))
        }
      }
    } label: {
      Label("Filter", systemImage: "line.3.horizontal.decrease")
      Text(appliedFilter.summary(dictionaries: dictionaries))
    }
    .menuActionDismissBehavior(.disabled)
    .accessibilityIdentifier("search.filter-menu")
  }

  private func filterBinding(_ keyPath: WritableKeyPath<SearchResultFilter, Bool>) -> Binding<Bool> {
    Binding(
      get: { appliedFilter[keyPath: keyPath] },
      set: { isOn in
        var newFilter = appliedFilter
        newFilter[keyPath: keyPath] = isOn
        filter = newFilter
      })
  }

  private func dictionaryBinding(_ family: String) -> Binding<Bool> {
    Binding(
      get: { appliedFilter.dictionaryFamilies.contains(family) },
      set: { isOn in
        var newFilter = appliedFilter
        if isOn {
          newFilter.dictionaryFamilies.insert(family)
        } else {
          newFilter.dictionaryFamilies.remove(family)
        }
        filter = newFilter
      })
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

struct SearchResultsFilterStatusRow: View {
  let hiddenCount: Int
  let clear: () -> Void

  var body: some View {
    HStack {
      Text(SearchResultFiltering.hiddenCountTitle(hiddenCount))
        .foregroundStyle(.secondary)
      Spacer()
      Button("Clear Filter", action: clear)
        .buttonStyle(.borderless)
    }
    .font(.footnote)
    .accessibilityIdentifier("search.filter-status")
  }
}
