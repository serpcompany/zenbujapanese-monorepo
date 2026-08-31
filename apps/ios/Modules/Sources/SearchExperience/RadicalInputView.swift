import SwiftUI

struct RadicalInputView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  let lookupClient: RadicalLookupClient
  let selectMode: (SearchInputMode) -> Void
  let submit: (SearchQuery) -> Void
  @State private var selectedRadicals: Set<String> = []
  @State private var catalog: RadicalCatalog?
  @State private var loadFailed = false

  var body: some View {
    VStack(spacing: 0) {
      candidateStrip
      SearchInputModePicker(selectedMode: .radicals, selectMode: selectMode)

      ScrollView {
        if loadFailed {
          ContentUnavailableView(
            "Radical data unavailable", systemImage: "exclamationmark.triangle"
          )
          .accessibilityIdentifier("radical.load-failure")
        } else {
          LazyVStack(alignment: .leading, spacing: 8) {
            ForEach(groups, id: \.strokeCount) { group in
              Text(group.strokeCount == 1 ? "1 Stroke" : "\(group.strokeCount) Strokes")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZenbuTheme.secondaryText)
              LazyVGrid(
                columns: Array(
                  repeating: GridItem(.flexible(), spacing: 4),
                  count: dynamicTypeSize >= .xxLarge ? 4 : 8
                ),
                spacing: 4
              ) {
                ForEach(group.values) { radical in
                  Button(radical.glyph) { toggle(radical.id) }
                    .font(.title3)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(
                      selectedRadicals.contains(radical.id)
                        ? ZenbuTheme.selectedTab
                        : ZenbuTheme.accent,
                      in: RoundedRectangle(cornerRadius: 5)
                    )
                    .accessibilityLabel("Radical \(radical.glyph)")
                    .accessibilityValue(
                      selectedRadicals.contains(radical.id) ? "Selected" : "Not selected"
                    )
                    .accessibilityIdentifier(radical.accessibilityIdentifier)
                }
              }
            }
          }
          .padding(10)
        }
      }
      .accessibilityIdentifier("radical.grid")
      .frame(minHeight: dynamicTypeSize >= .xxLarge ? 260 : 258)

      HStack {
        Button("Remove", systemImage: "delete.left") {
          selectedRadicals.removeAll()
          query = ""
        }
        .buttonStyle(.bordered)
        .disabled(selectedRadicals.isEmpty && SearchQuery(query).isEmpty)
        .accessibilityLabel("Remove radical selection")
        .accessibilityIdentifier("radical.remove")

        Spacer()
      }
      .controlSize(.large)
      .padding(.horizontal)
      .padding(.bottom, 10)
    }
    .background(ZenbuTheme.row)
    .task {
      guard catalog == nil else { return }
      do {
        catalog = try lookupClient.load()
      } catch {
        loadFailed = true
      }
    }
  }

  @ViewBuilder
  private var candidateStrip: some View {
    if radicalCandidates.isEmpty {
      HStack {
        Text("Select one or more radicals")
        Spacer()
      }
      .font(.body)
      .foregroundStyle(ZenbuTheme.secondaryText)
      .fixedSize(horizontal: false, vertical: true)
      .padding(.horizontal, 14)
      .padding(.vertical, 6)
      .frame(minHeight: 46)
    } else {
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(spacing: 0) {
          ForEach(Array(radicalCandidates.enumerated()), id: \.element.value) {
            index, candidate in
            Button(candidate.value) {
              let submittedQuery = SearchQuery(candidate.value)
              query = submittedQuery.value
              submit(submittedQuery)
            }
            .font(.title)
            .foregroundStyle(ZenbuTheme.foreground)
            .frame(minWidth: 54, minHeight: 46)
            .accessibilityLabel("Use radical candidate \(candidate.value)")
            .accessibilityValue("Candidate rank \(index + 1)")
            .accessibilityIdentifier("radical.candidate.\(candidate.value)")
          }
        }
      }
      .frame(minHeight: 46)
      .accessibilityIdentifier("radical.candidate-strip")
      .accessibilityValue("\(radicalCandidates.count) candidates")
    }
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
