import SwiftUI

struct RadicalInputView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  let lookupClient: RadicalLookupClient
  let submit: (SearchQuery) -> Void
  @State private var selectedRadicals: Set<String> = []
  @State private var catalog: RadicalCatalog?
  @State private var loadFailed = false

  var body: some View {
    SearchInputPanel {
      VStack(spacing: 12) {
        SearchCandidateStrip(
          candidates: radicalCandidates.map(\.value),
          identifierPrefix: "radical",
          select: accept
        ) {
          CandidateStripMessage {
            Text("Select one or more radicals")
          }
        }
        radicalGrid
      }
    } actions: {
      Spacer()
      SearchInputClearButton(isEnabled: !selectedRadicals.isEmpty) {
        selectedRadicals.removeAll()
      }
      .accessibilityLabel("Clear radical selection")
      .accessibilityIdentifier("radical.remove")
    }
    .task {
      guard catalog == nil else { return }
      do {
        catalog = try lookupClient.load()
      } catch {
        loadFailed = true
      }
    }
  }

  private func accept(_ candidate: String) {
    let submittedQuery = SearchQuery(candidate)
    query = submittedQuery.value
    submit(submittedQuery)
  }

  private var radicalGrid: some View {
    ScrollView {
      if loadFailed {
        ContentUnavailableView {
          Label("Radical data unavailable", systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        }
        .accessibilityIdentifier("radical.load-failure")
      } else {
        LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
          ForEach(groups, id: \.strokeCount) { group in
            Section {
              LazyVGrid(
                columns: Array(
                  repeating: GridItem(.flexible(), spacing: 4),
                  count: dynamicTypeSize >= .xxLarge ? 5 : 8
                ),
                spacing: 4
              ) {
                ForEach(group.values) { radical in
                  radicalButton(radical)
                }
              }
            } header: {
              Text(group.strokeCount == 1 ? "1 Stroke" : "\(group.strokeCount) Strokes")
                .font(.footnote.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
                .padding(.bottom, 6)
                .background(Color(uiColor: .systemGray5))
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("radical.stroke.\(group.strokeCount)")
            }
          }
        }
      }
    }
    .scrollIndicators(.hidden)
    .accessibilityIdentifier("radical.grid")
  }

  private func radicalButton(_ radical: RadicalComponent) -> some View {
    let isSelected = selectedRadicals.contains(radical.id)
    return Button(radical.glyph) { toggle(radical.id) }
      .buttonStyle(.plain)
      .font(.title3)
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(
        isSelected ? ZenbuTheme.radicalSelection : Color(uiColor: .secondarySystemFill),
        in: .rect(cornerRadius: 8)
      )
      .foregroundStyle(isSelected ? Color.white : Color.primary)
      .contentShape(.rect(cornerRadius: 8))
      .accessibilityLabel("Radical \(radical.glyph)")
      .accessibilityValue(isSelected ? "Selected" : "Not selected")
      .accessibilityIdentifier(radical.accessibilityIdentifier)
  }

  private var radicalCandidates: [RadicalCharacter] {
    catalog?.candidates(matching: selectedRadicals) ?? []
  }

  private var groups: [(strokeCount: Int, values: [RadicalComponent])] {
    catalog?.componentGroups(matching: radicalCandidates) ?? []
  }

  private func toggle(_ radical: String) {
    if selectedRadicals.contains(radical) {
      selectedRadicals.remove(radical)
    } else {
      selectedRadicals.insert(radical)
    }
  }
}

extension RadicalComponent {
  fileprivate var accessibilityIdentifier: String {
    switch id {
    case "一": "radical.one"
    case "艾": "radical.grass"
    case "攵": "radical.strike"
    default: "radical.\(id)"
    }
  }
}
