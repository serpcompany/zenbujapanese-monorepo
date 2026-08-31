import SwiftUI

struct RadicalInputView: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
        ScrollViewReader { proxy in
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
                    .id(group.strokeCount)
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
                .padding(10)
              }
            }
          }
          .accessibilityIdentifier("radical.grid")
          .onChange(of: selectedRadicals) { _, _ in
            guard let selectedStrokeCount else { return }
            Task { @MainActor in
              await Task.yield()
              proxy.scrollTo(selectedStrokeCount, anchor: .top)
            }
          }
        }

        VStack(spacing: 0) {
          Button {
            selectedRadicals.removeAll()
            selectedCandidate = nil
            query = ""
          } label: {
            Image(systemName: "delete.left")
              .font(.title2)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
          .disabled(selectedRadicals.isEmpty && SearchQuery(query).isEmpty)
          .accessibilityLabel("Remove radical selection")
          .accessibilityIdentifier("radical.remove")

          Button("Search") {
            if let selectedCandidate { submit(selectedCandidate) }
          }
          .font(.body.weight(.semibold))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(
            selectedCandidate == nil
              ? ZenbuTheme.mutedForeground.opacity(0.08) : ZenbuTheme.selectedTab
          )
          .foregroundStyle(
            selectedCandidate == nil ? ZenbuTheme.foreground : ZenbuTheme.primaryForeground
          )
          .buttonStyle(UndimmedPlainButtonStyle())
          .disabled(selectedCandidate == nil)
          .accessibilityIdentifier("radical.search")
        }
        .frame(width: 90)
      }
      .frame(minHeight: dynamicTypeSize >= .xxLarge ? 360 : 258)
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
          ForEach(radicalCandidates, id: \.value) { candidate in
            Button(candidate.value) {
              selectedCandidate = SearchQuery(candidate.value)
              query = candidate.value
            }
            .font(.title)
            .foregroundStyle(
              selectedCandidate?.value == candidate.value
                ? ZenbuTheme.primaryForeground
                : ZenbuTheme.foreground
            )
            .frame(minWidth: 54, minHeight: 46)
            .background(
              selectedCandidate?.value == candidate.value ? ZenbuTheme.selectedTab : .clear
            )
            .accessibilityLabel("Use radical candidate \(candidate.value)")
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

  private var selectedStrokeCount: Int? {
    catalog?.components
      .filter { selectedRadicals.contains($0.id) }
      .map(\.strokeCount)
      .max()
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
