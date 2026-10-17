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
  let returnsToTopOn: AnyHashable
  let strip: Strip
  let content: Content
  @State private var position = ScrollPosition(edge: .top)

  init(
    accessibilityIdentifier: String, returnsToTopOn: AnyHashable = 0,
    @ViewBuilder strip: () -> Strip, @ViewBuilder content: () -> Content
  ) {
    self.accessibilityIdentifier = accessibilityIdentifier
    self.returnsToTopOn = returnsToTopOn
    self.strip = strip()
    self.content = content()
  }

  var body: some View {
    VStack(spacing: 12) {
      strip
      ScrollView {
        content
      }
      .scrollPosition($position)
      .scrollIndicators(.hidden)
      .accessibilityIdentifier(accessibilityIdentifier)
    }
    .onChange(of: returnsToTopOn) { position.scrollTo(edge: .top) }
  }
}

struct PanelDataUnavailable: View {
  let title: LocalizedStringKey

  var body: some View {
    ContentUnavailableView {
      Label(title, systemImage: "exclamationmark.triangle")
        .foregroundStyle(.red)
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
            LazyVGrid(columns: PanelTile.columns(dynamicTypeSize), spacing: PanelTile.spacing) {
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
  @ScaledMetric(relativeTo: .title) private var minHeight = PanelTile.height

  static let height: CGFloat = 60
  static let spacing: CGFloat = 8

  static func columns(_ dynamicTypeSize: DynamicTypeSize) -> [GridItem] {
    Array(
      repeating: GridItem(.flexible(), spacing: spacing),
      count: dynamicTypeSize.isAccessibilitySize ? 3 : 5)
  }

  var body: some View {
    Button(action: select) {
      VStack(spacing: 0) {
        Text(glyph)
          .font(.title)
        if let caption {
          Text(caption)
            .font(.caption2)
            .foregroundStyle(isSelected ? Color.white : Color.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
      .padding(.horizontal, 4)
      .padding(.vertical, 4)
      .frame(maxWidth: .infinity, minHeight: minHeight)
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
