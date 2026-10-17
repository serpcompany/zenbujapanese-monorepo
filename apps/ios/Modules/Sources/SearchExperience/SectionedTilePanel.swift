import SwiftUI

struct TileSection<Item>: Identifiable {
  let id: String
  let title: String
  var spoken: String?
  let accessibilityIdentifier: String
  let items: [Item]
}

struct ClosedTileSections: RawRepresentable {
  var ids: Set<String>

  init(ids: Set<String> = []) {
    self.ids = ids
  }

  init?(rawValue: String) {
    ids = Set(rawValue.split(separator: "\n").map(String.init))
  }

  var rawValue: String { ids.sorted().joined(separator: "\n") }
}

struct SectionedTilePanel<Strip: View, Content: View>: View {
  let accessibilityIdentifier: String
  @ViewBuilder let strip: Strip
  @ViewBuilder let content: Content

  var body: some View {
    VStack(spacing: 12) {
      strip
      ScrollView {
        content
      }
      .scrollIndicators(.hidden)
      .accessibilityIdentifier(accessibilityIdentifier)
    }
  }
}

struct SectionedTiles<Item, ItemID: Hashable, Summary: View, Tile: View>: View {
  let sections: [TileSection<Item>]
  let itemID: KeyPath<Item, ItemID>
  @Binding var closed: Set<String>
  @ViewBuilder let summary: (TileSection<Item>) -> Summary
  @ViewBuilder let tile: (Item) -> Tile
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
      ForEach(sections) { section in
        let isOpen = !closed.contains(section.id)
        Section {
          if isOpen {
            LazyVGrid(columns: columns, spacing: 6) {
              ForEach(section.items, id: itemID) { tile($0) }
            }
            .padding(.bottom, 8)
          }
        } header: {
          TileSectionHeader(
            title: section.title, isOpen: isOpen, toggle: { toggle(section.id) }
          ) {
            summary(section)
          }
          .accessibilityLabel(section.spoken ?? section.title)
          .accessibilityIdentifier(section.accessibilityIdentifier)
        }
      }
    }
  }

  private var columns: [GridItem] {
    Array(
      repeating: GridItem(.flexible(), spacing: 6),
      count: dynamicTypeSize >= .xxLarge ? 4 : 6)
  }

  private func toggle(_ id: String) {
    if closed.contains(id) {
      closed.remove(id)
    } else {
      closed.insert(id)
    }
  }
}

private struct TileSectionHeader<Summary: View>: View {
  let title: String
  let isOpen: Bool
  let toggle: () -> Void
  @ViewBuilder let summary: Summary

  var body: some View {
    Button(action: toggle) {
      HStack(spacing: 6) {
        Image(systemName: isOpen ? "chevron.down" : "chevron.right")
          .foregroundStyle(.secondary)
          .frame(width: 14)
        Text(title)
        Spacer(minLength: 8)
        summary
      }
      .font(.footnote.weight(.semibold))
      .padding(.top, 8)
      .padding(.bottom, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .background(SystemColor.panel)
    .accessibilityAddTraits(.isHeader)
    .accessibilityValue(isOpen ? "Expanded" : "Collapsed")
  }
}

struct PanelTile: View {
  let glyph: String
  var caption: String?
  var spoken: String?
  var isSelected = false
  var isKnown = false
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      VStack(spacing: 0) {
        Text(glyph)
          .font(.title3)
        if let caption {
          Text(caption)
            .font(.caption2)
            .foregroundStyle(isSelected ? Color.white : Color.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
      .padding(.horizontal, 2)
      .padding(.vertical, 4)
      .frame(maxWidth: .infinity, minHeight: 44)
      .foregroundStyle(isSelected ? Color.white : Color.primary)
      .background(
        isSelected ? ZenbuTheme.radicalSelection : SystemColor.secondaryFill,
        in: .rect(cornerRadius: 8)
      )
      .overlay {
        if isKnown {
          RoundedRectangle(cornerRadius: 8)
            .strokeBorder(.green, lineWidth: 2)
        }
      }
      .contentShape(.rect(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(spoken ?? caption.map { "\(glyph), \($0)" } ?? glyph)
  }
}
