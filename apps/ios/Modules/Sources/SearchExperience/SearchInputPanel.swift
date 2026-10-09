import SwiftUI

extension View {
  func searchInputGlass(in shape: some Shape) -> some View {
    contentShape(shape)
      .glassEffect(
        .regular.tint(Color(uiColor: .systemBackground).opacity(0.7)).interactive(), in: shape)
  }
}

enum SearchInputCandidate {
  static func query(_ query: String, adding candidate: String) -> SearchQuery {
    SearchQuery(query + candidate)
  }

  static func isSingleCharacter(_ query: SearchQuery) -> Bool {
    query.value.count == 1
  }
}

struct SearchInputPanel<Content: View, Actions: View>: View {
  @ViewBuilder let content: Content
  @ViewBuilder let actions: Actions

  var body: some View {
    VStack(spacing: 10) {
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      HStack {
        actions
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 16)
    .padding(.top, 12)
    .padding(.bottom, 8)
    .background(Color(uiColor: .systemGray5), ignoresSafeAreaEdges: .all)
  }
}

struct SearchInputModeButtons: View {
  @Binding var mode: SearchInputMode

  var body: some View {
    HStack(spacing: 12) {
      button("Handwriting", systemImage: "pencil.and.scribble", for: .handwriting)
      button("Radicals", systemImage: "square.grid.3x3", for: .radicals)
    }
    .labelStyle(.iconOnly)
    .buttonBorderShape(.circle)
    .controlSize(.large)
  }

  @ViewBuilder
  private func button(_ title: String, systemImage: String, for target: SearchInputMode)
    -> some View
  {
    let button = Button(title, systemImage: systemImage) { mode = target }
      .accessibilityAddTraits(mode == target ? .isSelected : [])
      .accessibilityIdentifier("search.input.\(title.lowercased())")
    if mode == target {
      button.buttonStyle(.glassProminent)
    } else {
      button.buttonStyle(.glass)
    }
  }
}

struct SearchInputClearButton: View {
  let isEnabled: Bool
  let clear: () -> Void

  var body: some View {
    Button(action: clear) {
      Text("Clear")
        .font(.body.weight(.medium))
        .padding(.horizontal, 18)
        .frame(minHeight: 48)
        .searchInputGlass(in: .capsule)
    }
    .disabled(!isEnabled)
  }
}

struct SearchCandidateGrid<Placeholder: View>: View {
  let candidates: [String]
  let kanjiLookupClient: KanjiLookupClient
  let identifierPrefix: String
  let select: (String) -> Void
  @ViewBuilder let placeholder: Placeholder
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .title) private var tileHeight: CGFloat = 60

  var body: some View {
    ScrollView {
      if candidates.isEmpty {
        placeholder
          .frame(maxWidth: .infinity, minHeight: visibleHeight)
      } else {
        LazyVGrid(
          columns: Array(
            repeating: GridItem(.flexible(), spacing: 8),
            count: dynamicTypeSize.isAccessibilitySize ? 3 : 5),
          spacing: 8
        ) {
          ForEach(Array(candidates.enumerated()), id: \.offset) { index, candidate in
            SearchCandidateTile(
              candidate: candidate, height: tileHeight, kanjiLookupClient: kanjiLookupClient
            ) {
              select(candidate)
            }
            .accessibilityValue("Candidate rank \(index + 1)")
            .accessibilityIdentifier("\(identifierPrefix).candidate.\(candidate)")
          }
        }
      }
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: visibleHeight)
  }

  private var visibleHeight: CGFloat {
    dynamicTypeSize.isAccessibilitySize ? tileHeight * 2 + 8 : tileHeight * 3 + 16
  }
}

struct SearchCandidateStrip<Placeholder: View>: View {
  let candidates: [String]
  let identifierPrefix: String
  let select: (String) -> Void
  @ViewBuilder let placeholder: Placeholder

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      if candidates.isEmpty {
        placeholder
      } else {
        LazyHStack(spacing: 0) {
          ForEach(Array(candidates.enumerated()), id: \.offset) { index, candidate in
            if index > 0 {
              Divider()
                .frame(height: 22)
            }
            Button(candidate) { select(candidate) }
              .buttonStyle(.plain)
              .font(.title)
              .frame(minWidth: 54, maxHeight: .infinity)
              .padding(.horizontal, 6)
              .contentShape(.rect)
              .accessibilityValue("Candidate rank \(index + 1)")
              .accessibilityIdentifier("\(identifierPrefix).candidate.\(candidate)")
          }
        }
      }
    }
    .frame(minHeight: 54)
    .fixedSize(horizontal: false, vertical: true)
    .background(Color(uiColor: .systemBackground), in: .rect(cornerRadius: 16))
    .accessibilityIdentifier("\(identifierPrefix).candidate-strip")
  }
}

private struct SearchCandidateTile: View {
  let candidate: String
  let height: CGFloat
  let kanjiLookupClient: KanjiLookupClient
  let select: () -> Void
  @State private var meaning: String?

  var body: some View {
    Button(action: select) {
      VStack(spacing: 2) {
        Text(candidate)
          .font(.title)
        if let meaning {
          Text(meaning)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      .padding(.horizontal, 4)
      .frame(maxWidth: .infinity, minHeight: height)
      .searchInputGlass(in: .rect(cornerRadius: 14))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(meaning.map { "\(candidate), \($0)" } ?? candidate)
    .task(id: candidate) {
      meaning = nil
      guard let character = KanjiCharacter(candidate) else { return }
      meaning = try? await kanjiLookupClient.entry(character)?.meanings.first
    }
  }
}
