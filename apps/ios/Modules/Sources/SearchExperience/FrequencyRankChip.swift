import SwiftUI

/// A dictionary name and its rank, such as "Netflix 449". Each dictionary keeps its own color.
/// Subtle chips confine it to a small dot so dense lists stay readable; prominent chips tint
/// the name for a single entry's detail.
struct FrequencyRankChip: View {
  enum Style {
    case subtle
    case prominent
  }

  let presentation: FrequencyPresentationModel
  var style = Style.prominent

  var body: some View {
    let color = presentation.pack?.chipColor ?? .secondary
    switch style {
    case .subtle:
      HStack(spacing: 4) {
        Circle()
          .fill(color)
          .frame(width: 6, height: 6)
        Text(presentation.packName)
          .foregroundStyle(.secondary)
        Text(presentation.inlineText)
          .monospacedDigit()
          .foregroundStyle(.primary)
      }
      .font(.caption)
      .lineLimit(1)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .strokeBorder(.separator, lineWidth: 1)
      }
    case .prominent:
      HStack(spacing: 0) {
        Text(presentation.packName)
          .fontWeight(.semibold)
          .foregroundStyle(color)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(color.opacity(0.18))
        Text(presentation.inlineText)
          .monospacedDigit()
          .foregroundStyle(.primary)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
      }
      .font(.caption)
      .lineLimit(1)
      .clipShape(.rect(cornerRadius: 6))
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .strokeBorder(color.opacity(0.5), lineWidth: 1)
      }
    }
  }
}

extension FrequencyPackDisclosure {
  /// A stable color for this dictionary's chips across Search and Word Detail.
  var chipColor: Color {
    // System colors adapt to dark mode and Increase Contrast. Gray is reserved for
    // unavailable evidence and yellow reads poorly on light backgrounds.
    switch id.rawValue {
    case "zenbu.tubelex.youtube.ja.unidic-3.1": .red
    case "zenbu.wikipedia.written.ja.unidic-3.1": .blue
    case "zenbu.public.netflix.ja.ordered-v1": .pink
    case "zenbu.public.novels.ja.ordered-v1": .brown
    case "zenbu.public.slice-of-life.ja.ordered-v1": .mint
    case "zenbu.public.nhk.ja.ordered-v1": .indigo
    case "zenbu.public.shonen.ja.ordered-v1": .orange
    case "zenbu.public.jp-dict.ja.ordered-v1": .teal
    case "zenbu.public.visual-novel.ja.ordered-v1": .purple
    case "zenbu.public.tv-shows.ja.ordered-v1": .cyan
    case "zenbu.public.internet.ja.ordered-v1": .green
    default: .accentColor
    }
  }
}

/// Places chips left to right, wrapping to a new line when the row is full.
struct FrequencyChipFlowLayout: Layout {
  var spacing: CGFloat = 6

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = rows(for: subviews, width: proposal.width ?? .infinity)
    let width = rows.map(\.width).max() ?? 0
    let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for row in rows(for: subviews, width: bounds.width) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(
          at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
          proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func rows(for subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var current = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let proposedWidth =
        current.indices.isEmpty ? size.width : current.width + spacing + size.width
      if proposedWidth > width, !current.indices.isEmpty {
        rows.append(current)
        current = Row(indices: [index], width: size.width, height: size.height)
      } else {
        current.indices.append(index)
        current.width = proposedWidth
        current.height = max(current.height, size.height)
      }
    }
    if !current.indices.isEmpty { rows.append(current) }
    return rows
  }
}
