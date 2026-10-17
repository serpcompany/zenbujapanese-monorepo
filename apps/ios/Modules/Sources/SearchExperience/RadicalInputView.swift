import SwiftUI

struct RadicalInputView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  @Binding var mode: SearchInputMode
  let lookupClient: RadicalLookupClient
  let submit: (SearchQuery) -> Void
  @State private var selectionOrder: [String] = []
  @State private var panel: RadicalPanel?
  @State private var loadFailed = false

  var body: some View {
    SearchInputPanel(mode: $mode) {
      VStack(spacing: 12) {
        SearchCandidateStrip(
          candidates: panel?.candidates ?? [],
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
      SearchInputUndoButton(isEnabled: !selectionOrder.isEmpty) {
        select(selectionOrder.dropLast())
      }
      .accessibilityLabel("Undo last radical")
      .accessibilityIdentifier("radical.undo")
    }
    .task {
      if panel == nil { select(selectionOrder) }
    }
  }

  private func select(_ radicals: some Sequence<String>) {
    selectionOrder = Array(radicals)
    do {
      panel = try lookupClient.panel(selectionOrder)
    } catch {
      loadFailed = true
    }
  }

  private func accept(_ candidate: String) {
    let submittedQuery = SearchInputCandidate.query(query, adding: candidate)
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
          ForEach(panel?.groups ?? [], id: \.strokeCount) { group in
            Section {
              LazyVGrid(
                columns: Array(
                  repeating: GridItem(.flexible(), spacing: 4),
                  count: dynamicTypeSize >= .xxLarge ? 5 : 8
                ),
                spacing: 4
              ) {
                ForEach(group.radicals) { radical in
                  radicalButton(radical)
                }
              }
            } header: {
              Text(group.label)
                .font(.footnote.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
                .padding(.bottom, 6)
                .background(SystemColor.panel)
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
    let isSelected = selectionOrder.contains(radical.id)
    return Button(radical.glyph) { toggle(radical.id) }
      .buttonStyle(.plain)
      .font(.title3)
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(
        isSelected ? ZenbuTheme.radicalSelection : SystemColor.secondaryFill,
        in: .rect(cornerRadius: 8)
      )
      .foregroundStyle(isSelected ? Color.white : Color.primary)
      .contentShape(.rect(cornerRadius: 8))
      .accessibilityLabel("Radical \(radical.glyph)")
      .accessibilityValue(isSelected ? "Selected" : "Not selected")
      .accessibilityIdentifier(radical.accessibilityIdentifier)
  }

  private func toggle(_ radical: String) {
    select(
      selectionOrder.contains(radical)
        ? selectionOrder.filter { $0 != radical } : selectionOrder + [radical])
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
