import SwiftUI

struct RadicalInputView: View {
  @Binding var query: String
  @Binding var mode: SearchInputMode
  let lookupClient: RadicalLookupClient
  let submit: (SearchQuery) -> Void
  @AppStorage("search.radicals.closed-sections") private var closedSections = ClosedTileSections()
  @State private var selectionOrder: [String] = []
  @State private var panel: RadicalPanel?
  @State private var loadFailed = false

  var body: some View {
    SearchInputPanel(mode: $mode) {
      SectionedTilePanel(accessibilityIdentifier: "radical.grid") {
        SearchCandidateStrip(
          candidates: panel?.candidates ?? [],
          identifierPrefix: "radical",
          select: { SearchInputCandidate.accept($0, into: $query, submit: submit) }
        ) {
          CandidateStripMessage {
            Text("Select one or more radicals")
          }
        }
      } content: {
        radicalSections
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

  @ViewBuilder
  private var radicalSections: some View {
    if loadFailed {
      PanelDataUnavailable(title: "Radical data unavailable")
        .accessibilityIdentifier("radical.load-failure")
    } else {
      SectionedTiles(
        sections: (panel?.groups ?? []).map { group in
          TileSection(
            id: "strokes-\(group.strokeCount)", title: group.label,
            accessibilityIdentifier: "radical.stroke.\(group.strokeCount)",
            items: group.radicals)
        },
        itemID: \.id,
        closed: $closedSections.ids
      ) { _ in
        EmptyView()
      } tile: { radical in
        radicalTile(radical)
      }
    }
  }

  private func radicalTile(_ radical: RadicalComponent) -> some View {
    let isSelected = selectionOrder.contains(radical.id)
    return PanelTile(
      glyph: radical.glyph, spoken: "Radical \(radical.glyph)", isSelected: isSelected
    ) {
      toggle(radical.id)
    }
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
