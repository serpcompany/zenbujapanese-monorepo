import SwiftUI

struct RadicalInputView: View {
  @Binding var query: String
  let lookupClient: RadicalLookupClient
  let selectMode: (SearchInputMode) -> Void
  let submit: (SearchQuery) -> Void
  @State private var selectedRadicals: Set<String> = []
  @State private var selectedCandidate: SearchQuery?
  @State private var catalog: RadicalCatalog?
  @State private var loadFailed = false

  var body: some View {
    VStack(spacing: 0) {
      candidateStrip
      SearchInputModeBar(selectedMode: .radicals, selectMode: selectMode)

      HStack(spacing: 0) {
        ScrollView {
          if loadFailed {
            ContentUnavailableView("Radical data unavailable", systemImage: "exclamationmark.triangle")
              .accessibilityIdentifier("radical.load-failure")
          } else {
            LazyVStack(alignment: .leading, spacing: 8) {
              ForEach(groups, id: \.strokeCount) { group in
                Text(group.strokeCount == 1 ? "1 Stroke" : "\(group.strokeCount) Strokes")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(ReplicaPalette.secondaryText)
                LazyVGrid(
                  columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 8),
                  spacing: 4
                ) {
                  ForEach(group.values) { radical in
                    Button(radical.glyph) { toggle(radical.id) }
                      .font(.system(size: 20))
                      .frame(maxWidth: .infinity, minHeight: 34)
                      .background(
                        selectedRadicals.contains(radical.id)
                          ? ReplicaPalette.selectedTab
                          : .white.opacity(0.08),
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

        VStack(spacing: 0) {
          Button {
            selectedRadicals.removeAll()
            selectedCandidate = nil
            query = ""
          } label: {
            Image(systemName: "delete.left")
              .font(.system(size: 22))
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
          .disabled(selectedRadicals.isEmpty && SearchQuery(query).isEmpty)
          .accessibilityLabel("Remove radical selection")
          .accessibilityIdentifier("radical.remove")

          Button("Search") {
            if let selectedCandidate { submit(selectedCandidate) }
          }
          .font(.system(size: 17, weight: .semibold))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(selectedCandidate == nil ? Color.white.opacity(0.08) : ReplicaPalette.selectedTab)
          .disabled(selectedCandidate == nil)
          .accessibilityIdentifier("radical.search")
        }
        .frame(width: 90)
      }
      .frame(height: 258)
    }
    .background(ReplicaPalette.row)
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
      .font(.system(size: 14))
      .foregroundStyle(ReplicaPalette.secondaryText)
      .padding(.horizontal, 14)
      .frame(height: 46)
    } else {
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(spacing: 0) {
          ForEach(radicalCandidates, id: \.value) { candidate in
            Button(candidate.value) {
              selectedCandidate = SearchQuery(candidate.value)
              query = candidate.value
            }
              .font(.system(size: 27))
              .foregroundStyle(.white)
              .frame(minWidth: 54, minHeight: 46)
              .background(selectedCandidate?.value == candidate.value ? ReplicaPalette.selectedTab : .clear)
              .accessibilityLabel("Use radical candidate \(candidate.value)")
              .accessibilityIdentifier("radical.candidate.\(candidate.value)")
          }
        }
      }
      .frame(height: 46)
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
    if let selectedCandidate,
      !radicalCandidates.contains(where: { $0.value == selectedCandidate.value })
    {
      self.selectedCandidate = nil
      query = ""
    }
  }
}

private extension RadicalComponent {
  var accessibilityIdentifier: String {
    switch id {
    case "一": "radical.one"
    case "艾": "radical.grass"
    case "攵": "radical.strike"
    default: "radical.\(id)"
    }
  }
}
